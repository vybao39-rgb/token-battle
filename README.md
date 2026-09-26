# Dump Risk Alarm

Dump Risk Alarm analyzes one token contract with live Nansen data and returns a transparent 0–100 distribution-risk score. It was built for the Nansen Meridian Buildathon.

**Live demo:** https://token-battle-nansen.vercel.app

## What it checks

| Signal | Weight | Nansen source |
| --- | ---: | --- |
| Smart Money netflow | 25% | `smart-money/netflow`, `tgm/flows` |
| Exchange flow | 20% | `tgm/flows` |
| Top holders and concentration | 20% | `tgm/holders`, `tgm/indicators` |
| Large transfer anomalies | 15% | `tgm/transfers` |
| Buyer versus seller pressure | 10% | `tgm/who-bought-sold` |
| Liquidity and market health | 10% | `tgm/indicators`, `tgm/token-information` |

The final score is normalized over the signals that are actually available. Missing endpoint data is shown as unavailable and is never treated as zero risk. Confidence is based on signal coverage.

The 30-day comparison chart calls `tgm/token-ohlcv` for the selected token and BTC on Hyperliquid, then rebases both daily close series to 100. This shows relative performance, not equal prices.

## Credit usage

A fresh complete analysis makes 11 API calls and costs up to 23 Nansen credits using the published endpoint prices. The UI reports credits from Nansen response headers. Results are cached server-side for five minutes, and the API route limits each IP to five requests per ten minutes.

## Run locally

Requirements: Node.js 22.13+.

```bash
npm install
cp .env.example .env.local
```

Add your key to `.env.local`:

```text
NANSEN_API_KEY=your_key_here
```

Then run:

```bash
npm run dev
```

Open `http://localhost:5173`. Without `NANSEN_API_KEY`, the server returns a clear configuration error; no sample result is substituted.

## Security and limitations

- The Nansen key is read only by the server route and is never included in browser JavaScript or API responses.
- `.env*` files are ignored; never commit a real key, seed phrase, or private key.
- The app is read-only and never connects a wallet or requests a signature.
- Scores depend on Nansen labels, endpoint coverage, lookback windows and available market data.
- Exchange inflow suggests potential sell-side supply but does not prove a sale.
- This is a diagnostic research tool, not investment advice or a price prediction.

## Buildathon checklist

- [ ] Create and configure a Nansen API key.
- [ ] Confirm a live token analysis and record the credits shown.
- [ ] Keep this GitHub repository public.
- [ ] Record a 30–60 second demo with real Nansen results.
- [ ] Post the demo on X, tag `@nansen_ai`, and include the GitHub link.
- [ ] Submit the Nansen account email, X post URL and GitHub URL through the official form.
- [ ] Submit only one product per account.

## Suggested 45-second demo

1. Show the live-data badge and enter one token contract.
2. Run the scan and reveal the 0–100 risk verdict.
3. Open two or three evidence cards: Smart Money, CEX flow and top holders.
4. Show the token-versus-BTC rebased chart and transfer watch.
5. End on the public GitHub repository and read-only disclaimer.

## License

MIT
