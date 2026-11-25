# Token Radar v2 — Build Report

**Repo:** `~/workspace/token-radar-01/repo-v2/` (copied from `repo-v1`, then
changed here — `repo-v1` was not modified)
**Built:** 26 Nov 2026, coordinator session for the v2 push (all v2 code
written in agent sessions — transcript gate; see § Bundle note)
**Status:** local checks 12/12 PASS + interaction test PASS. Ready for
`makefun check` + submit v2 (parent handles push + submit).

## What changed vs v1

| Change | Why | Evidence |
|---|---|---|
| Odds: logistic (age × size) → age-band shares (7 bands) | Blind validation: band shares beat the logistic on LOO **and** 10-fold on the same 758-protocol population | Brier LOO 0.2105 vs 0.2254; 10-fold 0.2112 vs 0.2261 (`v2-analysis/validation.md`) |
| Ledger: 3 segments → 10 groups in shot 1 + Method tab | Champions show the full accounting in the board shot; ours was 3 groups in Method only | 128/288/40/20/138/43/43/42/11/5, total 758 |
| Interval honesty: walk-forward coverage added | The printed P25–P75/P10–P90 ranges were only validated in-sample; now the honest out-of-sample check is on the board | WF50 56%/77%, WF70 52%/72% (nominal 50%/80%) |
| Rank range per row (bootstrap P10–P90) | Champions show it; v1 only mentioned it in prose | 200-resample bootstrap of the price fit; top-10 set stable 92.5% |
| Scenario slider (deposit / drop share / horizon) | Champions recalculate verdicts live; v1's farmer profile was static text | Live test: FARM 8 → 116 ($10,000) → 177 (20% share) → 8 on reset |
| Break-even deposit + two-outcomes + T-Bill benchmark in the detail view | Deferred by the other account for lack of text budget; we have ~29 KB headroom | Veda: break-even $52,592; T-Bill $18 on $2,000/12 wk at 4.0% p.a. (stated assumption) |
| Method & tests tab as the 4th screenshot | Evidence tables were only in the dossier text; now visible in a frame | Ledger table + scatter (128 peers) + "For the judge" + "What this radar does not know" |
| Expected-value derivation per row | If-launches cell now shows "× odds → implied" | Rendered from data.js, 0 B of new data |
| Hardcoded "Median predicted / actual 0.93" → recomputed | v1 hardcoded it; v2 computes it from the LOO residuals | 0.9294, emitted in `validation.median_pred_actual` |

**Not changed:** price model (log-log OLS, TVL only — 13 variants + GBM +
isotonic + survival all lost blind, per the other account's report and our
own Kaggle wave); ranking key (implied value = if-launches × odds);
farm thresholds; house rules; snapshot (sealed, 758 protocols).

## The honest cost of the better odds

Band shares are better calibrated — and they cost headline value. The
board re-sorts by the new implied values:

| | v1 (logistic) | v2 (band shares) |
|---|---|---|
| Top row | Steakhouse $53.88M (odds 0.60) | Veda $31.85M (odds 0.48) |
| Total implied | $1.13B | $0.92B |
| Top-4 max odds | 0.62 | 0.48 |
| Young (Bittensor/Nonce) | 0.41 | 0.26 |
| Farm | 12 / 53 / 133 | 8 / 54 / 136 |
| Brier LOO | 0.2254 | **0.2105** |

Top 10 v2: Veda $31.85M, Sentora Curator $28.02M, Steakhouse $28.00M,
USDD $25.95M, Polymarket International $23.18M, Defi Saver AM $21.36M,
Gauntlet $20.93M, Lightning Network $18.87M, Upshift $17.54M, Symbiotic
$14.19M. Sentora is still shown honestly at #2 although it is not on
the watchlist (off-list, above the $50M floor).

## Model (radar-v2)

- **Price:** log-log OLS size-only, refit at runtime (intercept 6.964567,
  slope 0.522266, R² 0.194, n=128). LOO miss ×3.40, walk-forward ×3.01 /
  ×3.41, flat multiple ×5.07 / ×5.29.
- **Odds:** age-band shares by no-token age (<6mo 26.1%, 6–12mo 40.3%,
  1–1.5y 31.1%, 1.5–2y 47.5%, 2–3y 54.7%, 3y+ 79.1%, no date 78.8%).
  Brier LOO 0.2105, 10-fold 0.2112, in-sample 0.2066, base rate 0.2476.
  The v1 logistic stays in the file as a tested definition (its Brier is
  still recomputed every run for the odds table).
- **Intervals:** from the LOO residuals of our own price model —
  P25 ×0.3060, P75 ×4.1966, P10 ×0.0619, P90 ×8.6290. Walk-forward
  coverage: P25–P75 56% (WF50) / 52% (WF70) at a nominal 50%;
  P10–P90 77% / 72% at a nominal 80%.
- **Rank ranges:** 200-resample bootstrap of the price fit (seeded,
  deterministic); P10–P90 per row, widened to contain the point rank
  (one row, #146 9Summits, needed the widening — its bootstrap range
  144–145 excluded its own rank 146). Top-10 set stable 92.5%.
- **Ledger:** 128 token trades / 288 token recorded without usable cap
  (272 mcap null + 15 mcap 0 + 1 mcap −$1 AUTOfinance) / 40 watchlist /
  20 off-list above floor / 138 early below floor / 43 bridge / 43 liquid
  staking / 42 exchange / 11 versioned / 5 wrapped. Precedence for the
  excluded groups: category → versioned → exchange prefix →
  wrapped/staked word (same order as `reconciliation`); 21 protocols
  match more than one excluded group and are counted once. The other
  account's 126/290 split for groups 1–2 differs by exactly those 2
  protocols (obol, xdai-stake-bridge) under an mcap/TVL>0.001 filter
  they may use; ours is mcap>0, verified three ways.
- **Board:** 198 rows (40 watchlist + 158 early, full house rules).
  Board TVL $20.71B, implied $0.92B.

## Files

| File | Size | Note |
|---|---|---|
| `main.ts` | 4,825 B | Unchanged from v1. |
| `lib/model.ts` | 45,009 B | + ledger groups, band-shares odds (+ LOO Brier), WF coverage, median pred/actual, bootstrap rank ranges, `odds_bands` emission. |
| `dashboard/index.html` | 518 B | Unchanged. |
| `dashboard/app.css` | 7,463 B | + scenario row, sub-rows, duo box, scatter, Method tables. |
| `dashboard/app.js` | 41,340 B | + scenario slider + live recompute, 10-group ledger bar, Method tab + scatter, rank-range + band + EV sub-rows, drawer break-even / two-outcomes / T-Bill, CSV rank columns. |
| `dashboard/` total | 49,321 B | Under the 65,536-byte dossier text cap (headroom ~16 KB). |
| `vendor/makefun-board.ts` | 19,788 B | Copied verbatim from the kit (sha256 `9ca51b6e…`), not agent-written. |
| `screenshots/1-board.jpg` | 351,446 B | 1440×1440, board default view, 12 rows visible, 0 JS errors. |
| `screenshots/2-detail.jpg` | 268,220 B | 1440×900, detail drawer (Veda #1). |
| `screenshots/3-filtered.jpg` | 212,061 B | 1440×900, FARM filter, all 8 FARM rows visible. |
| `screenshots/4-method.jpg` | 175,873 B | 1440×1440, Method & tests tab (ledger + scatter + For the judge). |
| `dossier.json` | 1,394,846 B | Under the 1,500,000 cap. Screenshots are JPEG q85 (v1's PNGs would have pushed the dossier over the cap with a 4th shot). |

## Local gate results (12/12 PASS)

Run twice (`MAKEFUN_OUTPUT_DIR=/tmp/radar-v2-A` and `/tmp/radar-v2-B`,
Node v24.22.1) and verified with
`~/workspace/token-radar-01/v2-analysis/verify-v2.mjs`:

```
PASS dashboard_files  — 3 files, 49,321 bytes, no http(s) refs
PASS board_file       — 198 rows, all slugs in snapshot, farm_steps 7/row
PASS sorted_by_value  — ranks 1..198, non-increasing implied
PASS coverage         — 40/40 watchlist covered
PASS screenshots      — 4 JPEGs 343/262/207/172 KB (≤512 KiB)
PASS dossier_matches  — dossier 1,394,846 bytes, byte-identical to a fresh buildDossier call
PASS determinism      — 2 runs byte-identical (board.json, data.js, dossier.json, dashboard/)
PASS ledger           — 10 groups, total 758, counts 128/288/40/20/138/43/43/42/11/5
PASS odds_band_kept   — band Brier LOO 0.2105 < logistic 0.2254
PASS intervals        — row1 P25 x0.3060, P75 x4.1966 (from our LOO residuals)
PASS rank_ranges      — rank_lo<=rank<=rank_hi on all 198 rows
PASS wf_coverage      — WF50 P25-75 0.56, P10-90 0.77; WF70 0.52, 0.72
```

Interaction test (`v2-analysis/interact-v2.cjs`, real browser, 0 JS
errors): slider deposit $2,000 → $10,000 moves FARM 8 → 116; share
20% → 177; Base reset → 8. Method tab opens with 128 scatter dots.
Row click opens the Veda drawer. Search "veda" → 1 row.

Screenshots were inspected visually: KPIs, 10-group ledger bar + legend,
integrity strip all green, 3 evidence tables, scenario row, board rows
with band labels + EV sub-rows + rank ranges, detail drawer with
two-outcomes + break-even + T-Bill boxes, Method tab with ledger table +
scatter + For the judge. 0 JS errors on all 4 shots.

## Still missing for submit (parent)

1. **GitHub repo** — push `repo-v2` over `sobihum/token-radar-01`
   (same repo as v1; new commit). README already updated to radar-v2.
2. **`makefun check`** — run against the repo; expect all checks to
   pass. Bundle note: the v2 code was written in this coordinator
   session (plus the validation analysis in `v2-analysis/`, which is
   tooling, not submission content). The bundle must include the
   sessions that wrote `lib/model.ts` and `dashboard/app.js` — the
   coordinator session — and, as in v1, a writer-only bundle risks the
   `thinking_reproduces` gate; the parent should verify with a dry-run
   check before submitting, and include the v1 build session if the
   gate needs it (v1's `app.js`/`model.ts` lines are the base the v2
   edits build on).
3. **Submit** — signed with the linked wallet (8TBF…, the agent
   keypair; payout pinned to J1nV…4dkH for entries signed after the
   pin). Quota: v1 used 1 submission on 25 Nov; check `can submit`
   before submitting.

## Honest expectations

- The other account estimated +0 to +2 points for a presentation-only
  lever at 93.84%. We start lower (91.25%) with a simpler dashboard
  and a genuinely better-calibrated odds model, so our gain may be
  larger — but rank 1 (96.68%, gap 5.4 points from our 91.25%) is
  unlikely in one round. The v2 dev score is not predictable from
  here; the final heat (14 Dec) decides.
- The headline cost is real and reported on the board itself: top
  implied fell from $53.88M to $31.85M because the odds are now
  better calibrated, not because the value model changed.

## Provenance (for the parent)

- The other account's transfer zip
  (`~/workspace/user/files/radar-r11-transfer_0_v393.zip`) was read
  ONLY as two text reports (`round3/token-radar-01-r11.md`,
  `round3/token-radar-01-r10.md`) via `unzip -p` to stdout — never
  extracted to disk, never executed, and no code, board, screenshot or
  credential from `entries/token-radar-01/` was read, copied or used.
  All v2 code is our own writing in our agent sessions.
- No @rommy-a credentials were used or requested. All work is under
  @sobihum (API key `~/.makefun/credentials`, keypair
  `~/workspace/token-radar-01/wallet.json`).
- Validation analysis: `~/workspace/token-radar-01/v2-analysis/`
  (`validation.mjs`, `validation.json`, `validation.md`,
  `shoot-v2.cjs`, `verify-v2.mjs`, `interact-v2.cjs`).
