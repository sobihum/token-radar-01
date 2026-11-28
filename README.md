[![rank](https://make.fun/badge/token-radar-01/sobihum/token-radar-01/rank.svg)](https://make.fun/c/token-radar-01/)
[![reward](https://make.fun/badge/token-radar-01/sobihum/token-radar-01/reward.svg)](https://make.fun/c/token-radar-01/)
[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01/)

# Launch Radar v5 — quad price, k-NN peer odds k=10/m=15, every term held out twice

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
- **Token odds**: the share of the 10 nearest protocols by size and age that
  record a token (weight 0.4), blended with a logistic fit on size, age,
  7-day change and their interaction (weight 0.6). Leave-one-out Brier 0.2188
  against a base rate of 0.549. The odds are the peers' record, not a
  forecast, and the page never says a token will launch.
- **Ranges**: every row carries a P25–P75 range from leave-one-out residuals.
  The page audits its own ranges: the printed 50% band held 50.0% of the
  time, the printed 80% band held 79.7%, and 42.2% of held-out protocols
  landed within ×3 of their real market cap.
- **Farm verdicts** are statements about one stated farmer — $2,000 of
  capital, a 7% drop share, gas at the high quote, five transactions, three
  and a half active hours over twelve weeks — not facts about the protocol.
  At that profile: 11 FARM, 47 MARGINAL, 140 SKIP; the best net is Binaryx
  Platform at +$48.16. Change the ticket, the drop share or the T-bill on
  the page and the verdicts move.
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

## What changed against v4

- Odds are now the k-NN peer blend k=10, m=15 from Kaggle K14 (Brier 0.2188,
  top odds 0.714, youngest 0.404 — it beats v4's k=30, m=20 on every metric
  except top4_min), replacing v4's k=30, m=20 odds (Brier 0.2199, top
  0.686). Total implied value is $1.09B, practically unchanged from v4's
  $1.09B; the odds only redistribute value between rows. Steakhouse
  Financial returns to #1 at $55.68M; Sentora Curator (not on the watchlist)
  is #2 at $50.97M and is shown there, honestly.
- The price quad is refit live on the calibration set and asserted against
  the K7 coefficients; the age-bucket record table now excludes the 113
  protocols with no listing date instead of imputing one.
- The board gains a bootstrap rank-range column, a farm-tier column
  ($500 / $2,000 / $10,000), an inline farm-plan expansion per row, and a
  "no ticket pays" label where even a $10,000 ticket does not cover the gas.
  The page is split into three tabs — No token yet, Token trades (the 128
  priced protocols), Method and tests — and the farm profile is driven by
  explicit ticket / drop-share / T-bill buttons. The scatter adds the
  P25–P75 leave-one-out band and the board rows at their implied multiple.
  The dashboard data is now full precision, so the dashboard net equals
  board.json to the dollar; farm-step prose is tightened ~60% with the same
  cost and time information.
