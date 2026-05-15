# Prediction Market Signal Aggregator + Hermes Bounty Scanner — proof notes

## Implemented endpoints

- `GET /api/prediction/signal?topic=bitcoin`
  - Price: `0.01 USDC`
  - Combines Polymarket active market odds with Reddit recent-post sentiment and returns direction/confidence/divergence.

- `GET /api/prediction/trending`
  - Price: `0.01 USDC`
  - Ranks preset prediction-market topics by Polymarket volume/liquidity.

- `GET /api/bounty-scan?url=https://github.com/owner/repo`
  - Price: `0.05 USDC`
  - Scans public GitHub bounty issues, rejects prompt-exfiltration requirements, rejects crowded/already-claimed issues, and ranks actionable targets.

## Verification performed locally

```bash
bun run typecheck
bun -e "import { buildPredictionSignal } from './src/scrapers/prediction-market.ts'; const r=await buildPredictionSignal('bitcoin',2,3); console.log(JSON.stringify({markets:r.markets.length, posts:r.sentiment.postsAnalyzed, direction:r.signals.direction, confidence:r.signals.confidence}, null, 2));"
bun -e "import { scanGitHubBounties } from './src/scrapers/bounty-scanner.ts'; const r=await scanGitHubBounties('https://github.com/UnsafeLabs/Bounty-Hunters'); console.log(JSON.stringify({total:r.totalIssues, actionable:r.actionable.length, skipped:r.skipped.length}, null, 2));"
```

Observed results:

```json
{
  "predictionSignal": { "markets": 2, "posts": 3, "direction": "bullish", "confidence": 0.27 },
  "bountyScan": { "total": 50, "actionable": 0, "skipped": 25 }
}
```

402 discovery was verified locally on port 3102 for:

- `/api/prediction/signal?topic=bitcoin`
- `/api/prediction/trending`
- `/api/bounty-scan?url=https%3A%2F%2Fgithub.com%2FUnsafeLabs%2FBounty-Hunters`

All returned Base USDC recipient:

`0x5f03897c6c77dD00F65222A2420a3Cff5507079D`

## Remaining revenue blockers

- Public deployment URL needed.
- For Proxies.sx listing/acceptance, real live proof should be generated from the deployed endpoint.
- CDP/Bazaar indexing requires x402 facilitator settlement metadata and at least one successful paid settlement.
