[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sobihum/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sobihum/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar — pre-token protocols, valued from their own record

Entry for [Build the best token launch radar](https://make.fun/bounty/token-radar-01) on make.fun.

The radar reads the sealed DefiLlama snapshot (758 protocols, 40 on the
watchlist), ranks the 198 pre-token protocols that pass the house rules
in full, and prices each one's token as if it launched — from the
snapshot's own figures, never from a hardcoded list of names.

**Model (radar-v2):** `implied value = TVL × fitted multiple × token odds`
- Price: log-log OLS on TVL only, fitted on the 128 token-bearing
  protocols with a market cap. Leave-one-out miss ×3.40, walk-forward
  ×3.01 / ×3.41, against a flat multiple's ×5.07 / ×5.29. Thirteen
  variants were tested; only size-only survived both tests.
- Token odds: age-band shares — the recorded token rate of protocols
  in the same age band (7 bands, n=758). Brier (leave-one-out) 0.211
  against a 0.248 base rate, beating the v1 logistic (0.225) on LOO
  and 10-fold alike. Top row odds 0.48. Odds are never raised by hand —
  the better Brier costs headline odds (top 0.62 → 0.48), and the board
  reports it, not hides it.
- Farm plans: EV = implied × 7% drop share × ($2,000 / TVL), minus gas
  (5 transactions at the most expensive chain's high cost), over a
  12-week horizon at 3.5 active hours. FARM 8 / MARGINAL 54 / SKIP 136.
  The dashboard's scenario slider recomputes every verdict live for
  any deposit, drop share and horizon.
- The board shows the leave-one-out P25–P75 interval on every row
  (walk-forward coverage 52–56% at a nominal 50%), a 10-group ledger
  of all 758 protocols, a bootstrap rank range per row, and a Method
  tab with the evidence tables, the ledger, a scatter of the priced
  peers, and a break-even / T-Bill benchmark in every detail view.

**Run it:** `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>` (Node 22, standard library only). Two runs write byte-identical output.
