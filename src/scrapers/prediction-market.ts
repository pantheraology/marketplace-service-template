export type PredictionSignal = {
  query: string;
  generatedAt: string;
  markets: MarketSnapshot[];
  sentiment: SentimentSnapshot;
  signals: SignalSummary;
};

export type MarketSnapshot = {
  source: 'polymarket';
  id: string;
  question: string;
  slug?: string;
  url?: string;
  volume?: number | null;
  liquidity?: number | null;
  outcomes: Array<{ name: string; probability: number | null; price?: number | null }>;
  endDate?: string | null;
};

export type SentimentSnapshot = {
  source: 'reddit';
  topic: string;
  postsAnalyzed: number;
  positive: number;
  negative: number;
  neutral: number;
  score: number;
  topPosts: Array<{ title: string; subreddit: string; score: number; comments: number; url: string }>;
};

export type SignalSummary = {
  direction: 'bullish' | 'bearish' | 'mixed' | 'neutral';
  confidence: number;
  impliedProbability: number | null;
  sentimentScore: number;
  divergence: number | null;
  notes: string[];
};

const POSITIVE_TERMS = [
  'win', 'wins', 'winning', 'surge', 'up', 'bull', 'bullish', 'yes', 'likely', 'strong', 'lead',
  'growth', 'approve', 'approval', 'breakthrough', 'record', 'beat', 'beats', 'success', 'positive',
];
const NEGATIVE_TERMS = [
  'lose', 'loses', 'losing', 'down', 'bear', 'bearish', 'no', 'unlikely', 'weak', 'risk', 'fall',
  'fraud', 'fail', 'fails', 'failed', 'crash', 'scandal', 'negative', 'lawsuit', 'delay', 'delayed',
];

function normalizeTopic(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, 120);
}

function includesAny(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((n, term) => n + (lower.includes(term) ? 1 : 0), 0);
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseOutcomes(market: any): Array<{ name: string; probability: number | null; price?: number | null }> {
  let outcomeNames: string[] = [];
  let outcomePrices: any[] = [];
  try {
    outcomeNames = Array.isArray(market.outcomes) ? market.outcomes : JSON.parse(market.outcomes || '[]');
  } catch {
    outcomeNames = [];
  }
  try {
    outcomePrices = Array.isArray(market.outcomePrices) ? market.outcomePrices : JSON.parse(market.outcomePrices || '[]');
  } catch {
    outcomePrices = [];
  }
  if (!outcomeNames.length && Array.isArray(market.tokens)) {
    return market.tokens.map((t: any) => ({
      name: String(t.outcome || t.name || 'Unknown'),
      probability: parseNumber(t.price),
      price: parseNumber(t.price),
    }));
  }
  return outcomeNames.map((name, idx) => {
    const price = parseNumber(outcomePrices[idx]);
    return { name: String(name), probability: price, price };
  });
}

export async function fetchPolymarketMarkets(topic: string, limit = 8): Promise<MarketSnapshot[]> {
  const q = encodeURIComponent(normalizeTopic(topic));
  const url = `https://gamma-api.polymarket.com/markets?search=${q}&active=true&closed=false&limit=${Math.min(Math.max(limit, 1), 20)}`;
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'HermesPredictionSignal/1.0' } });
  if (!res.ok) throw new Error(`polymarket_${res.status}`);
  const data: any = await res.json();
  const rows = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
  return rows.slice(0, limit).map((m: any): MarketSnapshot => ({
    source: 'polymarket',
    id: String(m.id || m.conditionId || m.slug || ''),
    question: String(m.question || m.title || m.slug || 'Untitled market'),
    slug: m.slug,
    url: m.slug ? `https://polymarket.com/event/${m.slug}` : undefined,
    volume: parseNumber(m.volume) ?? parseNumber(m.volumeNum),
    liquidity: parseNumber(m.liquidity) ?? parseNumber(m.liquidityNum),
    outcomes: parseOutcomes(m),
    endDate: m.endDate || m.end_date || null,
  })).filter((m: MarketSnapshot) => m.id && m.question);
}

export async function fetchRedditSentiment(topic: string, limit = 20): Promise<SentimentSnapshot> {
  const normalized = normalizeTopic(topic);
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(normalized)}&sort=new&t=week&limit=${Math.min(Math.max(limit, 1), 50)}`;
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'HermesPredictionSignal/1.0' } });
  if (!res.ok) throw new Error(`reddit_${res.status}`);
  const data: any = await res.json();
  const posts = (data?.data?.children || []).map((x: any) => x?.data).filter(Boolean);
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  const topPosts = posts.slice(0, limit).map((p: any) => {
    const title = String(p.title || '');
    const text = `${title} ${p.selftext || ''}`;
    const pos = includesAny(text, POSITIVE_TERMS);
    const neg = includesAny(text, NEGATIVE_TERMS);
    if (pos > neg) positive += 1;
    else if (neg > pos) negative += 1;
    else neutral += 1;
    return {
      title: title.slice(0, 220),
      subreddit: String(p.subreddit || ''),
      score: Number(p.score || 0),
      comments: Number(p.num_comments || 0),
      url: p.permalink ? `https://reddit.com${p.permalink}` : String(p.url || ''),
    };
  });
  const postsAnalyzed = topPosts.length;
  const score = postsAnalyzed ? Number(((positive - negative) / postsAnalyzed).toFixed(3)) : 0;
  return { source: 'reddit', topic: normalized, postsAnalyzed, positive, negative, neutral, score, topPosts };
}

function summarize(markets: MarketSnapshot[], sentiment: SentimentSnapshot): SignalSummary {
  const first = markets[0];
  const yes = first?.outcomes.find((o) => /yes|up|win|true/i.test(o.name)) || first?.outcomes[0];
  const impliedProbability = yes?.probability ?? null;
  const sentimentScore = sentiment.score;
  const divergence = impliedProbability == null ? null : Number((sentimentScore - (impliedProbability - 0.5) * 2).toFixed(3));
  let direction: SignalSummary['direction'] = 'neutral';
  if (sentimentScore > 0.2 && (impliedProbability == null || impliedProbability >= 0.45)) direction = 'bullish';
  else if (sentimentScore < -0.2 && (impliedProbability == null || impliedProbability <= 0.55)) direction = 'bearish';
  else if (Math.abs(sentimentScore) > 0.15 || (impliedProbability != null && Math.abs(impliedProbability - 0.5) > 0.15)) direction = 'mixed';
  const confidence = Math.min(0.95, Math.max(0.1, (markets.length / 10) * 0.35 + Math.min(sentiment.postsAnalyzed, 30) / 30 * 0.45 + (first?.liquidity ? 0.15 : 0)));
  const notes = [
    `${markets.length} active Polymarket market(s) matched`,
    `${sentiment.postsAnalyzed} Reddit post(s) analyzed from the last week`,
  ];
  if (divergence != null && Math.abs(divergence) > 0.6) notes.push('Large market/social divergence detected; useful for deeper human/agent review.');
  return { direction, confidence: Number(confidence.toFixed(2)), impliedProbability, sentimentScore, divergence, notes };
}

export async function buildPredictionSignal(topic: string, marketLimit = 8, redditLimit = 20): Promise<PredictionSignal> {
  const normalized = normalizeTopic(topic);
  const [markets, sentiment] = await Promise.all([
    fetchPolymarketMarkets(normalized, marketLimit).catch(() => []),
    fetchRedditSentiment(normalized, redditLimit).catch(() => ({
      source: 'reddit' as const,
      topic: normalized,
      postsAnalyzed: 0,
      positive: 0,
      negative: 0,
      neutral: 0,
      score: 0,
      topPosts: [],
    })),
  ]);
  return { query: normalized, generatedAt: new Date().toISOString(), markets, sentiment, signals: summarize(markets, sentiment) };
}

export async function trendingPredictionTopics(): Promise<Array<{ topic: string; source: string; score: number }>> {
  const topics = ['bitcoin', 'ethereum', 'fed rate cut', 'US election', 'AI regulation', 'ukraine ceasefire', 'super bowl'];
  const results = await Promise.all(topics.map(async (topic) => {
    const markets = await fetchPolymarketMarkets(topic, 3).catch(() => []);
    const score = markets.reduce((n, m) => n + (m.volume || 0) + (m.liquidity || 0), 0);
    return { topic, source: 'polymarket', score: Math.round(score) };
  }));
  return results.sort((a, b) => b.score - a.score);
}
