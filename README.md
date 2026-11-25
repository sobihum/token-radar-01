[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sobihum/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sobihum/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar — pre-token protocols, valued from their own record

Entry for [Build the best token launch radar](https://make.fun/bounty/token-radar-01) on make.fun.

The radar reads the sealed DefiLlama snapshot (758 protocols, 40 on the
watchlist), ranks the 198 pre-token protocols that pass the house rules
in full, and prices each one's token as if it launched — from the
snapshot's own figures, never from a hardcoded list of names.

**Model (radar-v1):** `implied value = TVL × fitted multiple × token odds`
- Price: log-log OLS on TVL only, fitted on the 128 token-bearing
  protocols with a market cap. Leave-one-out miss ×3.40, walk-forward
  ×3.01 / ×3.41, against a flat multiple's ×5.07 / ×5.29. Thirteen
  variants were tested; only size-only survived both tests.
- Token odds: logistic regression, age × size interaction, fitted on
  all 758 protocols. Brier (leave-one-out) 0.225 against a 0.248 base
  rate. Top row odds 0.60. Odds are never raised by hand — the gap to
  the leader's 0.83–0.85 is reported on the dashboard, not hidden.
- Farm plans: EV = implied × 7% drop share × ($2,000 / TVL), minus gas
  (5 transactions at the most expensive chain's high cost), over a
  12-week horizon at 3.5 active hours. FARM 12 / MARGINAL 53 / SKIP 133.

**Run it:** `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>` (Node 22, standard library only). Two runs write byte-identical output.
