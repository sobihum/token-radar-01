[![rank](https://make.fun/badge/token-radar-01/sobihum/token-radar-01/rank.svg)](https://make.fun/c/token-radar-01/)
[![reward](https://make.fun/badge/token-radar-01/sobihum/token-radar-01/reward.svg)](https://make.fun/c/token-radar-01/)
[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01/)

# Launch Radar v4 — quad price, k-NN peer odds, every term held out twice

A radar for pre-token protocols, valued from their own record. Built for the
[make.fun token-radar-01 bounty](https://make.fun/c/token-radar-01/): 198
protocols ranked by implied value, every one of 758 protocols accounted for,
and every modelling choice shown with the held-out test that kept it — or
killed it.

## What the page claims, and what it does not

- **Price if it launches**: log market cap is quadratic in log TVL, fitted on
  the 128 protocols whose token already trades. On protocols the fit had not
  seen, it misses the real market cap by a median factor of ×3.38
  (leave-one-out) and ×2.61 (walk-forward). That is the claim, and the page
  prints the miss next to it.
- **Token odds**: the share of the 30 nearest protocols by size and age that
  record a token (weight 0.6), blended with a logistic fit on size, age,
  7-day change and their interaction (weight 0.4). Leave-one-out Brier 0.2199
  against a base rate of 0.549. The odds are the peers' record, not a
  forecast, and the page never says a token will launch.
- **Ranges**: every row carries a P25–P75 range from leave-one-out residuals.
  The page audits its own ranges: the printed 50% band held 50.0% of the
  time, the printed 80% band held 79.7%, and 42.2% of held-out protocols
  landed within ×3 of their real market cap.
- **Farm verdicts** are statements about one stated farmer — $2,000 of
  capital, a 7% drop share, gas at the high quote, five transactions, three
  and a half active hours over twelve weeks — not facts about the protocol.
  At that profile: 12 FARM, 47 MARGINAL, 139 SKIP; the best net is FstSwap
  at +$47. Change the plan size or the drop share on the page and the
  verdicts move.
- **"Records no token"** means DefiLlama records none; it is not a promise
  one is coming. Not financial advice.

## How it is built

`main.ts` (Node 22, standard library only) reads the sealed snapshot,
computes the board, and writes `board.json`, the dashboard data, and
`dossier.json`. It is fully deterministic: two runs from different
directories produce byte-identical output. Run it with:

```sh
node main.ts --input <snapshot.json>
```

with `MAKEFUN_OUTPUT_DIR` set to the output directory (default `./out`).
`verify.mjs` re-checks every gate locally: `node verify.mjs <outDir>`.

## What changed against v3

- Odds are now the k-NN peer blend from Kaggle K12 (Brier 0.2199, top odds
  0.686, youngest 0.363 — the first definition in this programme to pass all
  four checks), replacing the tempered-isotonic odds (Brier 0.2251, top
  0.617). Total implied value is $1.09B, practically unchanged from v3's
  $1.10B; the odds only redistribute value between rows. Sentora Curator
  (not on the watchlist) is #1 at $60.62M and is shown there, honestly.
- The cover now carries the held-out evidence ladder for every term tested
  (16 price specifications, 9 odds definitions, including the ones that
  failed and a live negative control), a range-honesty audit, and the
  integrity strip directly under the KPI cards.
- Every protocol gets a "How the figure is made" detail page: the build-up
  with running multiples, the nearest priced peers (the same 30 neighbours
  the odds use), a bootstrap rank range from 200 refits, a "What moves the
  value" sensitivity table, and a named, costed, timed farm plan with a
  net-per-drop-share-by-ticket matrix, a T-bill benchmark, a break-even drop
  share, and the ticket size from which the plan pays.
