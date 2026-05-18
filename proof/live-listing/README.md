# PANTHERA x402 live listing proof

Generated: 2026-05-18T17:50Z

## Live service

- Stable base URL: https://hermes-x402-panthera.loca.lt
- Agent docs: https://hermes-x402-panthera.loca.lt/llms.txt
- OpenAPI: https://hermes-x402-panthera.loca.lt/openapi.json
- Health: https://hermes-x402-panthera.loca.lt/health
- Base recipient: `0x5f03897c6c77dD00F65222A2420a3Cff5507079D`
- Asset: Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## Proof files

- `manifest.json` — generated artifact manifest.
- `health.json` — live HTTP 200 health proof.
- `discovery.json` — live HTTP 200 root service discovery.
- `llms.txt` — live agent-readable service guide.
- `openapi.json` — live OpenAPI 3.1 service description.
- `ecommerce_402.json` — live HTTP 402 payment-discovery response for `/api/ecommerce/check`.
- `prediction_402.json` — live HTTP 402 payment-discovery response for `/api/prediction/signal`.
- `bounty_scan_402.json` — live HTTP 402 payment-discovery response for `/api/bounty-scan`.

## Buyer-facing pitch

PANTHERA Marketplace Service Hub exposes x402-paid APIs for agents that need structured intelligence without API keys: e-commerce price/stock checks, prediction-market signal aggregation, bounty triage, research aggregation, Google Maps leads, Reddit/Instagram/Airbnb/LinkedIn intelligence, and trend scanning.

Agents can discover price, payment network, recipient, headers, and output schema by calling paid endpoints without payment and reading the standard HTTP 402 response. Paid calls use Base USDC and retry with `Payment-Signature: <transaction_hash>`.

## Honest limitation

This proof bundle verifies live public service discovery and payment-discovery flows. It does **not** claim paid settlement proof or real mobile-proxy retailer extraction proof. Those require a real x402 payment transaction and/or configured `PROXY_*` credentials.
