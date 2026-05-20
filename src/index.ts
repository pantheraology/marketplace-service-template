/**
 * Marketplace Service — Server Entry Point
 * ─────────────────────────────────────────
 * Mounts: /api/*
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serviceRouter } from './service';

const app = new Hono();

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://hermes-x402-panthera.loca.lt';
const FALLBACK_BASE_URL = process.env.FALLBACK_BASE_URL || 'https://publisher-jason-aaa-sent.trycloudflare.com';
const BASE_RECIPIENT = process.env.WALLET_ADDRESS_BASE || '0x5f03897c6c77dD00F65222A2420a3Cff5507079D';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const marketplaceEndpoints = [
  { method: 'GET', path: '/api/run', description: 'Google Maps Lead Generator — search businesses by category + location', price: '0.005 USDC' },
  { method: 'GET', path: '/api/details', description: 'Google Maps Place Details — detailed business info by Place ID', price: '0.005 USDC' },
  { method: 'GET', path: '/api/serp', description: 'Mobile SERP Tracker — Google search results with organic, ads, PAA, AI overview', price: '0.003 USDC' },
  { method: 'GET', path: '/api/jobs', description: 'Get job listings (Indeed/LinkedIn) with salary + date + proxy metadata' },
  { method: 'GET', path: '/api/reviews/search', description: 'Search businesses by query + location', price: '0.01 USDC' },
  { method: 'GET', path: '/api/reviews/:place_id', description: 'Fetch Google reviews by Place ID', price: '0.02 USDC' },
  { method: 'GET', path: '/api/business/:place_id', description: 'Get business details + review summary', price: '0.01 USDC' },
  { method: 'GET', path: '/api/reviews/summary/:place_id', description: 'Get review summary stats', price: '0.005 USDC' },
  { method: 'GET', path: '/api/linkedin/person', description: 'LinkedIn person profile enrichment', price: '0.01 USDC' },
  { method: 'GET', path: '/api/linkedin/company', description: 'LinkedIn company profile enrichment', price: '0.01 USDC' },
  { method: 'GET', path: '/api/linkedin/search/people', description: 'Search LinkedIn people by keywords', price: '0.01 USDC' },
  { method: 'GET', path: '/api/linkedin/company/:id/employees', description: 'Find company employees by title', price: '0.01 USDC' },
  { method: 'GET', path: '/api/reddit/search', description: 'Search Reddit posts by keyword', price: '0.005 USDC' },
  { method: 'GET', path: '/api/reddit/trending', description: 'Get trending Reddit posts', price: '0.005 USDC' },
  { method: 'GET', path: '/api/reddit/subreddit/:name', description: 'Browse subreddit posts', price: '0.005 USDC' },
  { method: 'GET', path: '/api/reddit/thread/*', description: 'Fetch post comments', price: '0.01 USDC' },
  { method: 'GET', path: '/api/instagram/profile/:username', description: 'Instagram profile data', price: '0.01 USDC' },
  { method: 'GET', path: '/api/instagram/posts/:username', description: 'Recent Instagram posts', price: '0.02 USDC' },
  { method: 'GET', path: '/api/instagram/analyze/:username', description: 'Full Instagram analysis with AI vision', price: '0.15 USDC' },
  { method: 'GET', path: '/api/instagram/analyze/:username/images', description: 'AI vision analysis of Instagram images', price: '0.08 USDC' },
  { method: 'GET', path: '/api/instagram/audit/:username', description: 'Instagram authenticity audit', price: '0.05 USDC' },
  { method: 'GET', path: '/api/airbnb/search', description: 'Search Airbnb listings by location', price: '0.02 USDC' },
  { method: 'GET', path: '/api/airbnb/listing/:id', description: 'Get detailed Airbnb listing', price: '0.01 USDC' },
  { method: 'GET', path: '/api/airbnb/reviews/:listing_id', description: 'Get Airbnb listing reviews', price: '0.01 USDC' },
  { method: 'GET', path: '/api/airbnb/market-stats', description: 'Airbnb market statistics', price: '0.05 USDC' },
  { method: 'GET', path: '/api/ecommerce/check', description: 'E-Commerce Price & Stock Monitor — price, availability, seller, ratings, reviews, SKU/ASIN/GTIN', price: '0.002 USDC' },
  { method: 'POST', path: '/api/ecommerce/batch', description: 'Batch check up to 10 product URLs for price/stock intelligence', price: '0.002 USDC' },
  { method: 'GET', path: '/api/prediction/signal', description: 'Prediction Market Signal Aggregator — Polymarket odds + Reddit sentiment + divergence scoring', price: '0.01 USDC' },
  { method: 'GET', path: '/api/prediction/trending', description: 'Trending prediction-market topics ranked by volume/liquidity', price: '0.01 USDC' },
  { method: 'GET', path: '/api/bounty-scan', description: 'Hermes Bounty Scanner — rank GitHub bounties by payout, competition, safety, and next action', price: '0.05 USDC' },
  { method: 'GET', path: '/api/research', description: 'Multi-source research aggregation', price: '0.05 USDC' },
  { method: 'GET', path: '/api/trending', description: 'Trending topics intelligence', price: '0.01 USDC' },
];

// ─── MIDDLEWARE ──────────────────────────────────────

app.use('*', logger());

app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Payment-Signature', 'X-Payment-Signature', 'X-Payment-Network'],
  exposeHeaders: ['X-Payment-Settled', 'X-Payment-TxHash', 'Retry-After'],
}));

// Security headers
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
});

// Rate limiting (in-memory, per IP, resets every minute)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '60'); // requests per minute

app.use('*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const entry = rateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
  } else {
    entry.count++;
    if (entry.count > RATE_LIMIT) {
      c.header('Retry-After', '60');
      return c.json({ error: 'Rate limit exceeded', retryAfter: 60 }, 429);
    }
  }

  await next();
});

// Clean up rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(ip);
  }
}, 300_000);

// ─── ROUTES ─────────────────────────────────────────

app.get('/health', (c) => c.json({
  status: 'healthy',
  service: process.env.SERVICE_NAME || 'marketplace-service',
  version: '2.0.0',
  timestamp: new Date().toISOString(),
  endpoints: marketplaceEndpoints.map((endpoint) => endpoint.path),
}));

const serviceDiscovery = () => ({
  name: process.env.SERVICE_NAME || 'marketplace-service-hub',
  description: process.env.SERVICE_DESCRIPTION || 'AI agent intelligence services powered by real 4G/5G mobile proxies.',
  version: '2.0.0',
  endpoints: marketplaceEndpoints,
  pricing: {
    amount: process.env.PRICE_USDC || '0.005',
    currency: 'USDC',
    networks: [
      {
        network: 'solana',
        chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        recipient: '6eUdVwsPArTxwVqEARYGCh4S2qwW2zCs7jSEDRpxydnv',
        asset: 'USDC',
        assetAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        settlementTime: '~400ms',
      },
      {
        network: 'base',
        chainId: 'eip155:8453',
        recipient: BASE_RECIPIENT,
        asset: 'USDC',
        assetAddress: BASE_USDC,
        settlementTime: '~2s',
      },
    ],
  },
  infrastructure: 'Proxies.sx mobile proxies (real 4G/5G IPs)',
  links: {
    marketplace: 'https://agents.proxies.sx/marketplace/',
    skillFile: 'https://agents.proxies.sx/marketplace/skill.md',
    github: 'https://github.com/pantheraology/marketplace-service-template/tree/ecommerce-price-stock-monitor',
    llms: `${PUBLIC_BASE_URL}/llms.txt`,
    openapi: `${PUBLIC_BASE_URL}/openapi.json`,
    fallback: FALLBACK_BASE_URL,
  },
});

app.get('/', (c) => c.json(serviceDiscovery()));
app.get('/.well-known/x402/services', (c) => c.json(serviceDiscovery()));

app.get('/llms.txt', (c) => c.text(`# PANTHERA Marketplace Service Hub

> x402-paid intelligence APIs for autonomous agents. Pay per request in Base USDC; no API key required.

Base URL: ${PUBLIC_BASE_URL}
Fallback URL: ${FALLBACK_BASE_URL}
Health: ${PUBLIC_BASE_URL}/health
Discovery JSON: ${PUBLIC_BASE_URL}/
OpenAPI: ${PUBLIC_BASE_URL}/openapi.json
Repository: https://github.com/pantheraology/marketplace-service-template/tree/ecommerce-price-stock-monitor

Payment network: Base (eip155:8453)
Asset: USDC (${BASE_USDC})
Recipient: ${BASE_RECIPIENT}

## How to call

1. Call a paid endpoint without payment to receive HTTP 402 and the exact schema/payment metadata.
2. Send Base USDC payment for the advertised amount.
3. Retry with \`Payment-Signature: <transaction_hash>\` and optional \`X-Payment-Network: base\`.

## Monetizable endpoints

${marketplaceEndpoints.map((endpoint) => `- ${endpoint.method} ${endpoint.path} — ${endpoint.description}${endpoint.price ? ` — ${endpoint.price}` : ''}`).join('\n')}

## High-value entry points

- /api/ecommerce/check — product price/stock intelligence, 0.002 USDC
- /api/prediction/signal — Polymarket + Reddit divergence signal, 0.01 USDC
- /api/bounty-scan — GitHub bounty triage with safety filters, 0.05 USDC
- /api/research — multi-source research aggregation, 0.05 USDC
`));

app.get('/openapi.json', (c) => c.json({
  openapi: '3.1.0',
  info: {
    title: 'PANTHERA Marketplace Service Hub',
    version: '2.0.0',
    description: 'x402-paid intelligence APIs for autonomous agents. Call without payment for HTTP 402 payment discovery, then retry with Payment-Signature.',
  },
  servers: [
    { url: PUBLIC_BASE_URL, description: 'Stable localtunnel endpoint' },
    { url: FALLBACK_BASE_URL, description: 'Cloudflare fallback endpoint' },
  ],
  'x-payment': {
    network: 'base',
    chainId: 'eip155:8453',
    asset: 'USDC',
    assetAddress: BASE_USDC,
    recipient: BASE_RECIPIENT,
    header: 'Payment-Signature',
  },
  paths: Object.fromEntries(marketplaceEndpoints.map((endpoint) => [
    endpoint.path.replace(/:([A-Za-z_]+)/g, '{$1}').replace('*', '{path}'),
    {
      [endpoint.method.toLowerCase()]: {
        summary: endpoint.description,
        description: `${endpoint.description}${endpoint.price ? ` Price: ${endpoint.price}.` : ''} Call without Payment-Signature for HTTP 402 discovery and schema.`,
        responses: {
          '200': { description: 'Paid request succeeded' },
          '402': { description: 'Payment required; response includes networks, price, required headers, and output schema' },
          '429': { description: 'Rate limited' },
        },
      },
    },
  ])),
}));

app.route('/api', serviceRouter);

app.notFound((c) => c.json({ error: 'Not found', endpoints: ['/', '/health', '/api/run', '/api/details', '/api/serp', '/api/jobs', '/api/reviews/search', '/api/reviews/:place_id', '/api/business/:place_id', '/api/reviews/summary/:place_id', '/api/linkedin/person', '/api/linkedin/company', '/api/linkedin/search/people', '/api/reddit/search', '/api/reddit/trending', '/api/reddit/subreddit/:name', '/api/reddit/thread/*', '/api/instagram/profile/:username', '/api/instagram/posts/:username', '/api/instagram/analyze/:username', '/api/instagram/audit/:username', '/api/airbnb/search', '/api/airbnb/listing/:id', '/api/airbnb/reviews/:listing_id', '/api/airbnb/market-stats', '/api/research', '/api/trending'] }, 404));

app.onError((err, c) => {
  console.error(`[ERROR] ${err.message}`);
  return c.json({ error: 'Internal server error' }, 500);
});

export default {
  port: parseInt(process.env.PORT || '3000'),
  hostname: '0.0.0.0',
  fetch: app.fetch,
};
