# Launch Radar v3 — Token Radar

[![Rank](https://make.fun/badge/token-radar-01/sobihum/token-radar-01/rank.svg)](https://make.fun/c/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/sobihum/token-radar-01/reward.svg)](https://make.fun/c/token-radar-01)
[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)

Pre-token protocols, valued from their own record. Entry for the
[make.fun Token Radar bounty](https://make.fun/c/token-radar-01):
a board of 198 pre-token protocols ranked by implied value, with a farm
plan for each one.

## Model

- **Price if it launches**: log(market cap) = 10.055 + 0.189 · ln(TVL)
  + 0.00884 · ln(TVL)², fitted on the 128 protocols whose token trades.
  Out-of-sample miss ×3.376 (leave-one-out), ×2.609 (walk-forward, first
  50%) and ×2.824 (walk-forward, first 70%), against ×4.86 for a flat
  multiple. Two of six candidate terms were kept (log TVL and its square);
  growth, age and both interactions were tested and dropped.
- **Token odds**: logistic interaction of log10 TVL, log age and 7-day
  change, tempered by an isotonic calibration (t = 0.5) fitted on Kaggle.
  Brier 0.2251 leave-one-out vs base rate 0.549; top odds 0.617 (highest
  of the four largest watchlist protocols); lowest odds 0.382 among the
  two youngest watchlist protocols; decile calibration error 0.032.
- **Implied value** = TVL × fitted multiple × token odds. Total implied
  value across the board ≈ $1.10B.
- **Farm plan**: capital $2,000, drop share 7%, gas high per chain
  (5 tx at the protocol's most expensive chain: Ethereum $15, Base /
  Arbitrum / Optimism / Avalanche $2, Binance / Polygon / Tron $1,
  Hyperliquid / Monad $0.50, Solana $0.05, other chains $5), 3.5 active
  hours per 12 weeks. FARM if net > $25 and net/hour > $5; MARGINAL if
  net > $0; else SKIP. Result: 12 FARM / 51 MARGINAL / 135 SKIP; best net
  FstSwap $44.89.

The dashboard shows the protocol accounting for all 758 protocols
(10 ledger groups), an integrity strip recomputed from `board.json`
at render time, and the out-of-sample evidence tables. No protocol
name is hardcoded in the ranking; a protocol "records no token"
when DefiLlama carries no token for it.

## Run

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only. Deterministic: two runs write
byte-identical output. Runtime about 6 seconds.
