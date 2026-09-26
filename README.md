# Token Battle

Token Battle compares two token contracts, each on its own supported network, and selects the stronger token using live Nansen data. It was built for the Nansen Meridian Buildathon.

**Live demo:** https://token-battle-nansen.vercel.app

## What it does

Each live comparison makes eight Nansen API calls:

- `POST /api/v1/tgm/token-information` for liquidity, market cap, volume, buy/sell activity, traders, and holders.
- `POST /api/v1/tgm/flow-intelligence` for Smart Trader, Top PnL, Whale, and Exchange net flows.
- `POST /api/v1/token-screener` for both tokens' 24-hour and 7-day price performance.
- `POST /api/v1/perp-screener` for BTC and ETH 24-hour and 7-day market benchmarks on Hyperliquid.

The app calculates two transparent 100-point layers:

| Pillar | Weight | Inputs |
| --- | ---: | --- |
| Liquidity | 25 | Absolute liquidity and liquidity/market-cap ratio |
| Buy pressure | 25 | Buy/sell volume and buyer/seller ratio |
| Quality flow | 25 | Smart Trader, Top PnL, Whale, and Exchange flows |
| Market breadth | 25 | Holder count and unique trader count |

The **Relative Strength** layer measures the token's excess return against BTC and ETH. It weights 24h performance more heavily: 35% vs BTC (24h), 35% vs ETH (24h), 15% vs BTC (7d), and 15% vs ETH (7d).

The final score combines **65% Onchain Health** and **35% Relative Strength**. The winner is the token with the higher overall score; a difference below two points is treated as a draw.

The score is a comparison model, not investment advice. Displayed liquidity, volume, labels, and flows do not prove executable depth, ownership, or future performance.

## Run locally

Requirements: Node.js 22.13+.

```bash
npm install
cp .env.example .env.local
```

Add your Nansen API key to `.env.local`:

```text
NANSEN_API_KEY=your_key_here
```

Start the app:

```bash
npm run dev
```

Open `http://localhost:5173`.

Without `NANSEN_API_KEY`, the interface clearly runs in **demo mode** with sample data. With the key configured, the status changes to **Live Nansen** and every comparison uses live API responses.

## Security

- The API key is read only by the server route and is never sent to the browser.
- `.env*` files are ignored by Git; only `.env.example` is committed.
- The application is read-only. It does not connect a wallet, request signatures, or execute trades.
- Never commit a real API key, seed phrase, or private key.

## Buildathon submission checklist

- [ ] Create a Nansen API key at `https://app.nansen.ai/api`.
- [ ] Configure `NANSEN_API_KEY` and verify the **Live Nansen** badge.
- [ ] Use the API during the competition window and retain usage screenshots.
- [ ] Publish this repository publicly on GitHub.
- [ ] Keep this README and confirm another builder can run the app in under 10 minutes.
- [ ] Record a 30–60 second screen demo showing two real contracts and live results.
- [ ] Post the recording on X, tag `@nansen_ai`, and include the public GitHub URL.
- [ ] Submit the Nansen account email, X post URL, and GitHub URL through the official form.
- [ ] Submit only once per account.

## Suggested 45-second demo script

1. **0–5s:** Show the Live Nansen badge and the two network selectors.
2. **5–15s:** Select a network and paste a real contract address for each token.
3. **15–25s:** Run the battle and show the winning token.
4. **25–38s:** Highlight Relative Strength, Onchain Health, and the BTC/ETH benchmark strip.
5. **38–45s:** Show the public GitHub README and the read-only disclaimer.

## Data notes

Nansen coverage varies by endpoint and chain. Recent flow data may be cached or update at different intervals. Treat missing data as unavailable, not zero, when extending the model for production use.

## License

MIT
