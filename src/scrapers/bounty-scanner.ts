export type BountyScanResult = {
  sourceUrl: string;
  scannedAt: string;
  repository?: string;
  totalIssues: number;
  actionable: RankedBounty[];
  skipped: Array<{ url: string; title: string; reason: string }>;
};

export type RankedBounty = {
  url: string;
  title: string;
  number: number;
  payoutUsd: number | null;
  score: number;
  labels: string[];
  reasons: string[];
  nextAction: string;
};

type GitHubIssue = {
  number: number;
  title: string;
  html_url: string;
  labels: Array<{ name: string }>;
  body?: string;
  comments?: number;
  state?: string;
  pull_request?: unknown;
  updated_at?: string;
};

const PROMPT_EXFIL_PATTERNS = [
  /system prompt/i,
  /initial context/i,
  /context window/i,
  /operating instructions/i,
  /complete text that initialized/i,
  /before the first human/i,
  /before any user/i,
  /startup configuration/i,
  /verbatim.*instructions/i,
  /raw.*prompt/i,
];

const CLAIM_PATTERNS = [/\/claim\s+#?\d+/i, /reward/i, /submitted pr/i, /pull request/i, /solution/i];

function parseRepo(input: string): { owner: string; repo: string; issue?: number } | null {
  const m = input.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/issues\/(\d+))?/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, ''), issue: m[3] ? Number(m[3]) : undefined };
}

function payoutFrom(issue: GitHubIssue): number | null {
  const hay = [issue.title, issue.body || '', ...issue.labels.map((l) => l.name)].join(' ');
  const matches = [...hay.matchAll(/\$\s?([0-9]+(?:\.[0-9]+)?)(k)?/gi)];
  if (!matches.length) return null;
  return Math.max(...matches.map((m) => Number(m[1]) * (m[2]?.toLowerCase() === 'k' ? 1000 : 1)));
}

function hasPromptExfil(issue: GitHubIssue): boolean {
  const hay = `${issue.title}\n${issue.body || ''}`;
  return PROMPT_EXFIL_PATTERNS.some((re) => re.test(hay));
}

async function githubJson(url: string): Promise<any> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'HermesBountyScanner/1.0',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`github_${res.status}`);
  return res.json();
}

async function fetchIssueComments(owner: string, repo: string, issue: number): Promise<string[]> {
  const rows = await githubJson(`https://api.github.com/repos/${owner}/${repo}/issues/${issue}/comments?per_page=30`).catch(() => []);
  if (!Array.isArray(rows)) return [];
  return rows.map((c: any) => String(c.body || ''));
}

async function fetchIssues(owner: string, repo: string, issue?: number): Promise<GitHubIssue[]> {
  if (issue) return [await githubJson(`https://api.github.com/repos/${owner}/${repo}/issues/${issue}`)];
  const query = encodeURIComponent(`repo:${owner}/${repo} is:issue is:open bounty OR $ OR Algora`);
  const search = await githubJson(`https://api.github.com/search/issues?q=${query}&per_page=50`).catch(() => null);
  if (Array.isArray(search?.items)) return search.items;
  const rows = await githubJson(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`);
  return Array.isArray(rows) ? rows.filter((row: any) => !row.pull_request) : [];
}

export async function scanGitHubBounties(sourceUrl: string): Promise<BountyScanResult> {
  const parsed = parseRepo(sourceUrl);
  if (!parsed) throw new Error('unsupported_url: provide a GitHub repository or issue URL');
  const { owner, repo, issue } = parsed;
  const issues = (await fetchIssues(owner, repo, issue)).filter((i) => !i.pull_request && i.state !== 'closed');
  const actionable: RankedBounty[] = [];
  const skipped: Array<{ url: string; title: string; reason: string }> = [];

  for (const item of issues) {
    const labels = item.labels?.map((l) => l.name) || [];
    const body = item.body || '';
    const payoutUsd = payoutFrom(item);
    const hasBounty = payoutUsd != null || labels.some((l) => /bounty|\$|algora/i.test(l)) || /\/bounty/i.test(body);
    if (!hasBounty) {
      skipped.push({ url: item.html_url, title: item.title, reason: 'no bounty signal' });
      continue;
    }
    if (hasPromptExfil(item)) {
      skipped.push({ url: item.html_url, title: item.title, reason: 'unsafe prompt/context disclosure requirement' });
      continue;
    }
    const comments = await fetchIssueComments(owner, repo, item.number);
    const joinedComments = comments.join('\n---\n');
    const activeClaims = comments.filter((c) => /\/attempt/i.test(c) || CLAIM_PATTERNS.some((re) => re.test(c))).length;
    if (activeClaims >= 3 || /reward/i.test(joinedComments)) {
      skipped.push({ url: item.html_url, title: item.title, reason: `crowded or already claimed (${activeClaims} claim/attempt signals)` });
      continue;
    }
    let score = 50;
    const reasons: string[] = [];
    if (payoutUsd) {
      score += Math.min(35, payoutUsd / 100);
      reasons.push(`payout signal $${payoutUsd}`);
    }
    if (/good first issue|help wanted|ai agent/i.test(labels.join(' '))) {
      score += 10;
      reasons.push('labels suggest agent-friendly implementation');
    }
    if (activeClaims === 0) {
      score += 15;
      reasons.push('no active attempt/claim signals in recent comments');
    } else {
      score -= activeClaims * 8;
      reasons.push(`${activeClaims} competing attempt/claim signal(s)`);
    }
    if (/test|acceptance|criteria/i.test(body)) {
      score += 8;
      reasons.push('has explicit acceptance/test criteria');
    }
    actionable.push({
      url: item.html_url,
      title: item.title,
      number: item.number,
      payoutUsd,
      score: Math.round(score),
      labels,
      reasons,
      nextAction: `Clone ${owner}/${repo}, reproduce issue #${item.number}, implement minimal patch, run tests, then open PR only if no new claim appeared.`,
    });
  }

  actionable.sort((a, b) => b.score - a.score);
  return {
    sourceUrl,
    scannedAt: new Date().toISOString(),
    repository: `${owner}/${repo}`,
    totalIssues: issues.length,
    actionable: actionable.slice(0, 10),
    skipped: skipped.slice(0, 25),
  };
}
