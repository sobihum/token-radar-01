// Token Radar v1 — model, board builder and evidence computation.
//
// The model is the one decided by the Kaggle wave of 25 Nov 2026
// (~/workspace/token-radar-01/kaggle/KAGGLE-RESULTS.md):
//   price: log-log OLS on TVL only, fitted on the 128 token-bearing
//          protocols with mcap_usd > 0. No category, growth or age term:
//          every one of the 13 tested variants lost to size-only on
//          leave-one-out (LOO x3.40), so none of them is kept.
//   odds:  age-band shares P(has token) by no-token age, fitted on all
//          758 protocols. v1 used a logistic regression (age x size
//          interaction, Brier LOO 0.2254); blind validation on this
//          snapshot (LOO + 10-fold, same population) beats it with
//          plain band shares: Brier LOO 0.2105, 10-fold 0.2112. The
//          rate in each band is the share of protocols in that band
//          that already have a token. No hand-raising: the better
//          Brier costs headline odds (top row 0.62 -> 0.48, young
//          0.41 -> 0.26) and roughly halves the top implied values —
//          reported, not hidden.
//   farm:  EV = implied x drop_share x (capital / TVL); net = EV - gas;
//          net/hour = net / 3.5h. Capital $2,000, drop share 7%, gas
//          "high" (5 tx at the most expensive chain's high per-tx cost).
//          FARM if net > $25 and net/hour > $5; MARGINAL if net > $0.
//   board: 198 rows = the 40 watchlist protocols plus the 158 other
//          pre-token protocols that pass the house rules in full.
//          758 = 198 ranked + 416 token-bearing + 144 excluded.
//
// Every headline evidence number below is recomputed from the snapshot
// on every run (OLS fit, LOO, walk-forward, range calibration, IRLS
// odds fit, Brier LOO). The variant-search tables (13 price variants,
// 5 odds definitions) are the recorded results of that same search,
// refit leave-one-out and walk-forward on this snapshot during the
// Kaggle wave; the chosen model's own rows in those tables are the
// values this file recomputes, so the two agree.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface FarmPlan {
  ev_gross_usd: number;
  gas_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  main_chain: string;
  gas_per_tx_usd: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  watchlist: boolean;
  rank: number;
  rank_lo: number;
  rank_hi: number;
  token_odds: number;
  token_odds_band: string;
  implied_if_launches_usd: number;
  implied_value_usd: number;
  implied_range_p25_usd: number;
  implied_range_p75_usd: number;
  implied_range_p10_usd: number;
  implied_range_p90_usd: number;
  ev_gross_usd: number;
  gas_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  farm_steps: string[];
}

export interface PriceVariant {
  variant: string;
  loo: number;
  wf50: number;
  wf70: number;
  kept: boolean;
}

export interface OddsDefinition {
  definition: string;
  brier_loo: number;
  top4_max: number;
  young_min: number;
  kept: boolean;
}

export interface LedgerGroup {
  key: string;
  label: string;
  count: number;
  tvl_usd: number;
}

export interface RadarData {
  model: {
    name: string;
    price: string;
    odds: string;
    as_of: string;
    source: string;
    floor_usd: number;
    capital_usd: number;
    drop_share: number;
    gas_level: string;
    hours_per_plan: number;
    horizon_weeks: number;
    main_sha256: string;
    ols_intercept: number;
    ols_slope: number;
    ols_n: number;
    ols_r2: number;
    odds_beta: number[];
    odds_bands: { label: string; lo_days: number | null; hi_days: number | null; n: number; rate: number }[];
    odds_med_age_days: number;
    odds_med_change: number;
  };
  ledger: LedgerGroup[];
  totals: {
    protocols: number;
    board: number;
    token_bearing: number;
    excluded: number;
    watchlist: number;
    board_tvl_usd: number;
    total_implied_v2_usd: number;
    total_implied_v3_usd: number;
    farm: { FARM: number; MARGINAL: number; SKIP: number };
  };
  validation: {
    loo_miss: number;
    wf50_miss: number;
    wf70_miss: number;
    flat_loo_miss: number;
    flat_wf50_miss: number;
    flat_wf70_miss: number;
    range_within_x3: number;
    range_p25_p75: number;
    range_p10_p90: number;
    wf50_cov_p25_p75: number;
    wf50_cov_p10_p90: number;
    wf70_cov_p25_p75: number;
    wf70_cov_p10_p90: number;
    range_q25_log: number;
    range_q75_log: number;
    median_pred_actual: number;
    top10_stable_pct: number;
    brier_odds_loo: number;
    brier_odds_in_sample: number;
    brier_base_rate: number;
    top_row_odds: number;
    young_odds_bittensor: number;
    young_odds_nonce: number;
    price_variants_tested: number;
    price_variants_kept: number;
    odds_definitions_tested: number;
    odds_definitions_kept: number;
  };
  price_variants: PriceVariant[];
  odds_definitions: OddsDefinition[];
  accounting: {
    segments: { key: string; label: string; count: number; tvl_usd: number }[];
    excluded_reasons: { reason: string; count: number }[];
  };
  board: BoardRow[];
  live: { slug: string; name: string; category: string | null; tvl_usd: number; mcap_usd: number; ratio: number }[];
}

// --- Fitted constants (from the snapshot; see the header note) -----------

export const AS_OF = '2026-11-14';
const AGE_CAP_DAYS = 1095;
const MED_AGE_DAYS = 677;
const MED_CHANGE = -8.2334;
const CHG_CLAMP_LO = -60;
const CHG_CLAMP_HI = 120;
const CAPITAL_USD = 2000;
const DROP_SHARE = 0.07;
const HOURS_PER_PLAN = 3.5;
const TX_COUNT = 5;

// Gas per transaction, USD (low, high). Gas for a plan is TX_COUNT times
// the most expensive chain's high cost — the conservative reading.
const GAS_PER_TX: Record<string, [number, number]> = {
  Ethereum: [5.0, 15.0],
  Arbitrum: [0.1, 2.0],
  Base: [0.1, 2.0],
  Optimism: [0.1, 2.0],
  Solana: [0.01, 0.05],
  Binance: [0.1, 1.0],
  Polygon: [0.1, 1.0],
  Tron: [0.1, 1.0],
  Avalanche: [0.5, 2.0],
  'Hyperliquid L1': [0.1, 0.5],
  Monad: [0.1, 0.5],
};
const GAS_DEFAULT_TX: [number, number] = [1.0, 5.0];

const VERSION_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCLUDED_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking',
  'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const EXCHANGE_PREFIXES = [
  'Binance', 'Coinbase', 'Bybit', 'Kraken',
  'Bitget', 'OKX', 'Bitfinex', 'Gemini',
];
const WORD_RE = /\b(wrapped|staked|staking)\b/i;

// Price-variant search, refit leave-one-out and walk-forward on this
// snapshot (Kaggle K1, 25 Nov 2026). Only "ols" is kept: it wins on LOO
// (x3.40); every variant that looks better on one walk-forward split
// loses on LOO, so it is a split cherry-pick, not a win.
export const PRICE_VARIANTS: PriceVariant[] = [
  { variant: 'flat', loo: 5.07, wf50: 5.29, wf70: 5.29, kept: false },
  { variant: 'ols', loo: 3.40, wf50: 3.01, wf70: 3.41, kept: true },
  { variant: 'ols_cat', loo: 3.45, wf50: 2.87, wf70: 2.98, kept: false },
  { variant: 'ols_growth', loo: 3.76, wf50: 2.74, wf70: 3.62, kept: false },
  { variant: 'ols_age', loo: 3.42, wf50: 2.96, wf70: 5.45, kept: false },
  { variant: 'ols_growth_age', loo: 3.53, wf50: 2.72, wf70: 5.8, kept: false },
  { variant: 'ols_chains', loo: 3.66, wf50: 2.81, wf70: 3.28, kept: false },
  { variant: 'ols_slope_cat', loo: 3.68, wf50: 2.64, wf70: 2.5, kept: false },
  { variant: 'huber', loo: 3.62, wf50: 3.18, wf70: 3.36, kept: false },
  { variant: 'trim10', loo: 3.56, wf50: 3.11, wf70: 3.68, kept: false },
  { variant: 'trim3', loo: 3.69, wf50: 3.26, wf70: 3.76, kept: false },
  { variant: 'bucket_median', loo: 4.09, wf50: 2.94, wf70: 3.31, kept: false },
  { variant: 'isotonic', loo: 3.73, wf50: 3.1, wf70: 4.08, kept: false },
];

// Odds-definition search (Kaggle K2, 25 Nov 2026, plus the v2 band
// validation). "top4_max" is the highest odds among the four largest
// watchlist rows; "young_min" is the lowest odds among Bittensor dTAO
// (56 days) and Nonce Capital (45 days), the two youngest protocols
// above $250M TVL. The band-shares row is the kept definition: its
// Brier, top-4 and young numbers are recomputed every run in
// buildRadar (they are 0 here only as placeholders). The logistic
// interaction row is kept as a tested definition: its Brier is also
// recomputed every run, its top-4 / young numbers are the recorded
// values from the v1 fit.
export const ODDS_DEFINITIONS: OddsDefinition[] = [
  { definition: 'age_band_shares', brier_loo: 0, top4_max: 0, young_min: 0, kept: true },
  { definition: 'logistic_with_cat', brier_loo: 0.2135, top4_max: 0.57, young_min: 0.07, kept: false },
  { definition: 'logistic_interaction', brier_loo: 0.2254, top4_max: 0.62, young_min: 0.41, kept: false },
  { definition: 'logistic_no_cat', brier_loo: 0.227, top4_max: 0.6, young_min: 0.23, kept: false },
  { definition: 'empirical_bayes', brier_loo: 0.2483, top4_max: 0.57, young_min: 0.48, kept: false },
  { definition: 'hazard', brier_loo: 0.2643, top4_max: 0.69, young_min: 0.79, kept: false },
];

// --- Snapshot helpers ------------------------------------------------------

export function parseSnapshot(text: string): Snapshot {
  const snap = JSON.parse(text) as Snapshot;
  if (!snap || !Array.isArray(snap.protocols) || !Array.isArray(snap.watchlist)) {
    throw new Error('snapshot: expected { protocols: [], watchlist: [] }');
  }
  for (const p of snap.protocols) {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') {
      throw new Error(`snapshot: bad protocol row ${JSON.stringify(p).slice(0, 120)}`);
    }
  }
  return snap;
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function ageDays(p: SnapshotProtocol): number | null {
  if (p.listed_at === null) return null;
  const listed = Date.parse(`${p.listed_at}T00:00:00Z`);
  const asOf = Date.parse(`${AS_OF}T00:00:00Z`);
  return Math.max(0, Math.floor((asOf - listed) / 86400000));
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function quantile(sorted: number[], q: number): number {
  // Linear interpolation, numpy's default ("linear") method.
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Deterministic PRNG (mulberry32) — the bootstrap must agree byte for byte across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The house rules, applied to every row — not just the watchlist. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category === 'CEX') return false;
  if (VERSION_RE.test(p.name)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
  if (WORD_RE.test(p.name)) return false;
  return true;
}

export function boardProtocols(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter(isRankable);
}

export function reconciliation(protocols: SnapshotProtocol[], watchlist: Set<string>): {
  total: number; board: number; tokenBearing: number; excluded: number;
  excludedReasons: { reason: string; count: number }[];
} {
  let board = 0;
  let tokenBearing = 0;
  const reasons = new Map<string, number>();
  for (const p of protocols) {
    if (!isPreToken(p)) {
      tokenBearing += 1;
      continue;
    }
    if (isRankable(p)) {
      board += 1;
      continue;
    }
    let reason = 'other';
    if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) reason = `category: ${p.category}`;
    else if (VERSION_RE.test(p.name)) reason = 'versioned name';
    else if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) reason = 'exchange prefix';
    else if (WORD_RE.test(p.name)) reason = 'wrapped/staked/staking word';
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  void watchlist;
  return {
    total: protocols.length,
    board,
    tokenBearing,
    excluded: protocols.length - board - tokenBearing,
    excludedReasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : 1)),
  };
}

/** The 10-group ledger: every protocol in the snapshot in exactly one
 *  group, so the board can show that all 758 are accounted for. The
 *  excluded groups follow the same precedence as reconciliation():
 *  an excluded category first, then a versioned name, then an
 *  exchange prefix, then a wrapped/staked/staking word. */
export function ledgerGroups(protocols: SnapshotProtocol[], snapshot: Snapshot): LedgerGroup[] {
  const watchlist = new Set(snapshot.watchlist);
  const floor = snapshot.floor_usd;
  const groups: LedgerGroup[] = [
    { key: 'trades', label: 'Token trades', count: 0, tvl_usd: 0 },
    { key: 'recorded', label: 'Token recorded, no usable cap', count: 0, tvl_usd: 0 },
    { key: 'watchlist', label: 'Ranked · watchlist', count: 0, tvl_usd: 0 },
    { key: 'offlist', label: 'Ranked · off-list, above floor', count: 0, tvl_usd: 0 },
    { key: 'early', label: 'Ranked · early, below floor', count: 0, tvl_usd: 0 },
    { key: 'bridge', label: 'Out · bridge', count: 0, tvl_usd: 0 },
    { key: 'staking', label: 'Out · liquid staking', count: 0, tvl_usd: 0 },
    { key: 'exchange', label: 'Out · exchange', count: 0, tvl_usd: 0 },
    { key: 'versioned', label: 'Out · versioned', count: 0, tvl_usd: 0 },
    { key: 'wrapped', label: 'Out · wrapped', count: 0, tvl_usd: 0 },
  ];
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const add = (key: string, p: SnapshotProtocol): void => {
    const g = byKey.get(key) as LedgerGroup;
    g.count += 1;
    g.tvl_usd += p.tvl_usd;
  };
  for (const p of protocols) {
    if (!isPreToken(p)) {
      add(p.mcap_usd !== null && p.mcap_usd > 0 ? 'trades' : 'recorded', p);
      continue;
    }
    if (isRankable(p)) {
      if (watchlist.has(p.slug)) add('watchlist', p);
      else if (p.tvl_usd >= floor) add('offlist', p);
      else add('early', p);
      continue;
    }
    if (p.category === 'Bridge' || p.category === 'Canonical Bridge') add('bridge', p);
    else if (p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') add('staking', p);
    else if (p.category === 'CEX' || EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) add('exchange', p);
    else if (VERSION_RE.test(p.name)) add('versioned', p);
    else if (WORD_RE.test(p.name)) add('wrapped', p);
    else add('wrapped', p);
  }
  return groups;
}

// --- Price model: log-log OLS on TVL only ----------------------------------

export interface OlsFit { intercept: number; slope: number; r2: number; n: number }

export function calibrationSet(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

export function olsLogLog(rows: SnapshotProtocol[]): OlsFit {
  const xs = rows.map((p) => Math.log(p.tvl_usd));
  const ys = rows.map((p) => Math.log(p.mcap_usd as number));
  const n = rows.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) * (xs[i] - mx);
    sxy += (xs[i] - mx) * (ys[i] - my);
    ssTot += (ys[i] - my) * (ys[i] - my);
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i] - (intercept + slope * xs[i]);
    ssRes += r * r;
  }
  return { intercept, slope, r2: 1 - ssRes / ssTot, n };
}

function predictMcap(fit: OlsFit, tvl: number): number {
  return Math.exp(fit.intercept + fit.slope * Math.log(tvl));
}

function missFactor(pred: number[], actual: number[]): number {
  // Median |log(pred/actual)|, as a factor: exp(median |log err|).
  const errs = pred.map((p, i) => Math.abs(Math.log(p / actual[i]))).sort((a, b) => a - b);
  return Math.exp(median(errs));
}

export function looPrice(cal: SnapshotProtocol[]): { preds: number[]; actuals: number[]; logErrs: number[] } {
  const preds: number[] = [];
  const actuals: number[] = [];
  const logErrs: number[] = [];
  for (let i = 0; i < cal.length; i++) {
    const rest = cal.filter((_, j) => j !== i);
    const fit = olsLogLog(rest);
    const pred = predictMcap(fit, cal[i].tvl_usd);
    preds.push(pred);
    actuals.push(cal[i].mcap_usd as number);
    logErrs.push(Math.log((cal[i].mcap_usd as number) / pred));
  }
  return { preds, actuals, logErrs };
}

function flatPredict(train: SnapshotProtocol[], tvl: number): number {
  const ratios = train.map((p) => (p.mcap_usd as number) / p.tvl_usd);
  return median(ratios) * tvl;
}

export function looFlat(cal: SnapshotProtocol[]): { preds: number[]; actuals: number[] } {
  const preds: number[] = [];
  const actuals: number[] = [];
  for (let i = 0; i < cal.length; i++) {
    const rest = cal.filter((_, j) => j !== i);
    preds.push(flatPredict(rest, cal[i].tvl_usd));
    actuals.push(cal[i].mcap_usd as number);
  }
  return { preds, actuals };
}

export function walkForwardPrice(
  cal: SnapshotProtocol[],
  frac: number,
  predict: (train: SnapshotProtocol[], p: SnapshotProtocol) => number,
): { preds: number[]; actuals: number[] } | null {
  const dated = cal
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at as string) < (b.listed_at as string) ? -1 : 1);
  if (dated.length < 10) return null;
  const cut = Math.floor(dated.length * frac);
  const train = dated.slice(0, cut);
  const test = dated.slice(cut);
  return {
    preds: test.map((p) => predict(train, p)),
    actuals: test.map((p) => p.mcap_usd as number),
  };
}

export function rangeCalibration(logErrs: number[]): {
  withinX3: number; withinP25P75: number; withinP10P90: number;
  q25: number; q75: number; q10: number; q90: number;
} {
  const sorted = [...logErrs].sort((a, b) => a - b);
  const q25 = quantile(sorted, 0.25);
  const q75 = quantile(sorted, 0.75);
  const q10 = quantile(sorted, 0.1);
  const q90 = quantile(sorted, 0.9);
  const n = logErrs.length;
  return {
    withinX3: logErrs.filter((e) => Math.abs(e) <= Math.log(3)).length / n,
    withinP25P75: logErrs.filter((e) => e >= q25 && e <= q75).length / n,
    withinP10P90: logErrs.filter((e) => e >= q10 && e <= q90).length / n,
    q25, q75, q10, q90,
  };
}

// --- Token odds: IRLS logistic, age x size interaction ---------------------

function oddsFeatures(p: SnapshotProtocol): number[] {
  const ag = ageDays(p);
  const age = ag === null ? MED_AGE_DAYS : ag;
  const logAge = Math.log1p(age) / Math.log1p(AGE_CAP_DAYS);
  const logTvl = Math.log10(p.tvl_usd);
  const chRaw = p.change_7d === null ? MED_CHANGE : p.change_7d;
  const ch = Math.max(CHG_CLAMP_LO, Math.min(CHG_CLAMP_HI, chRaw)) / 100;
  return [1, logTvl, logAge, ch, logAge * logTvl];
}

function sigmoid(z: number): number {
  const c = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-c));
}

// Solve A x = b by Gaussian elimination with partial pivoting.
function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    }
    [m[col], m[piv]] = [m[piv], m[col]];
    const d = m[col][col] || 1e-12;
    for (let r = col + 1; r < n; r++) {
      const f = m[r][col] / d;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = m[i][n];
    for (let j = i + 1; j < n; j++) s -= m[i][j] * x[j];
    x[i] = s / (m[i][i] || 1e-12);
  }
  return x;
}

export function irls(X: number[][], y: number[], iters = 60, beta0?: number[]): number[] {
  const k = X[0].length;
  let beta = beta0 ? [...beta0] : new Array<number>(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const pr = X.map((row) => sigmoid(row.reduce((s, v, j) => s + v * beta[j], 0)));
    const w = pr.map((p) => p * (1 - p) + 1e-9);
    const xtwx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    const xtr: number[] = new Array<number>(k).fill(0);
    for (let i = 0; i < X.length; i++) {
      for (let a = 0; a < k; a++) {
        xtr[a] += X[i][a] * (y[i] - pr[i]);
        for (let b = 0; b < k; b++) xtwx[a][b] += X[i][a] * w[i] * X[i][b];
      }
    }
    for (let a = 0; a < k; a++) xtwx[a][a] += 1e-6;
    const step = solveLinear(xtwx, xtr);
    let maxStep = 0;
    for (let j = 0; j < k; j++) {
      beta[j] += step[j];
      maxStep = Math.max(maxStep, Math.abs(step[j]));
    }
    if (maxStep < 1e-8) break;
  }
  return beta;
}

export interface OddsFit { beta: number[]; brierInSample: number; baseRate: number }

export function fitOdds(protocols: SnapshotProtocol[]): OddsFit {
  const X = protocols.map(oddsFeatures);
  const y = protocols.map((p) => (isPreToken(p) ? 0 : 1));
  const beta = irls(X, y);
  const pr = X.map((row) => sigmoid(row.reduce((s, v, j) => s + v * beta[j], 0)));
  const brierInSample = y.reduce((s, v, i) => s + (v - pr[i]) * (v - pr[i]), 0) / y.length;
  return { beta, brierInSample, baseRate: y.reduce((a, b) => a + b, 0) / y.length };
}

export function oddsOf(p: SnapshotProtocol, beta: number[]): number {
  const row = oddsFeatures(p);
  return sigmoid(row.reduce((s, v, j) => s + v * beta[j], 0));
}

export function brierLoo(protocols: SnapshotProtocol[], fullBeta: number[]): number {
  const X = protocols.map(oddsFeatures);
  const y = protocols.map((p) => (isPreToken(p) ? 0 : 1));
  let sum = 0;
  for (let i = 0; i < protocols.length; i++) {
    const xm = X.filter((_, j) => j !== i);
    const ym = y.filter((_, j) => j !== i);
    const b = irls(xm, ym, 15, fullBeta);
    const pi = sigmoid(X[i].reduce((s, v, j) => s + v * b[j], 0));
    sum += (y[i] - pi) * (y[i] - pi);
  }
  return sum / protocols.length;
}

// --- Token odds v2: age-band shares -----------------------------------------
// The logistic above stays in the file as a tested definition (its Brier
// is still recomputed every run for the odds table). The shipped odds
// are the band shares: they win on both blind tests, and they are
// transparent — every row's odds is the recorded token rate of
// protocols its own age.

export interface AgeBand { key: string; label: string; loDays: number; hiDays: number }
export const AGE_BANDS: AgeBand[] = [
  { key: 'lt6m', label: '<6mo', loDays: 0, hiDays: 182 },
  { key: '6to12m', label: '6–12mo', loDays: 182, hiDays: 365 },
  { key: '1to1.5y', label: '1–1.5y', loDays: 365, hiDays: 547 },
  { key: '1.5to2y', label: '1.5–2y', loDays: 547, hiDays: 730 },
  { key: '2to3y', label: '2–3y', loDays: 730, hiDays: 1095 },
  { key: 'gte3y', label: '3y+', loDays: 1095, hiDays: Infinity },
  { key: 'nodate', label: 'no date', loDays: -1, hiDays: -1 },
];

export function bandOf(p: SnapshotProtocol): AgeBand {
  const ag = ageDays(p);
  if (ag === null) return AGE_BANDS[6];
  for (const b of AGE_BANDS) {
    if (b.loDays >= 0 && ag >= b.loDays && ag < b.hiDays) return b;
  }
  return AGE_BANDS[5];
}

export interface BandShare { band: AgeBand; n: number; y1: number; rate: number }

export function bandShares(protocols: SnapshotProtocol[]): BandShare[] {
  const acc: BandShare[] = AGE_BANDS.map((band) => ({ band, n: 0, y1: 0, rate: 0 }));
  for (const p of protocols) {
    const a = acc.find((x) => x.band.key === bandOf(p).key) as BandShare;
    a.n += 1;
    if (!isPreToken(p)) a.y1 += 1;
  }
  for (const a of acc) a.rate = a.n === 0 ? 0 : a.y1 / a.n;
  return acc;
}

export function bandOddsOf(p: SnapshotProtocol, bands: BandShare[]): number {
  return (bands.find((a) => a.band.key === bandOf(p).key) as BandShare).rate;
}

/** Leave-one-out Brier for the band-shares odds (each row's band rate without itself). */
export function brierLooBand(protocols: SnapshotProtocol[]): number {
  const bands = bandShares(protocols);
  const totalY1 = protocols.filter((p) => !isPreToken(p)).length;
  let sum = 0;
  for (let i = 0; i < protocols.length; i++) {
    const p = protocols[i];
    const b = bands.find((a) => a.band.key === bandOf(p).key) as BandShare;
    const y = isPreToken(p) ? 0 : 1;
    let pi: number;
    if (b.n - 1 > 0) pi = (b.y1 - y) / (b.n - 1);
    else pi = (totalY1 - y) / (protocols.length - 1);
    sum += (y - pi) * (y - pi);
  }
  return sum / protocols.length;
}

// --- Implied value and farm economics --------------------------------------

export function impliedIfLaunches(fit: OlsFit, tvlUsd: number): number {
  return Math.exp(fit.intercept) * Math.pow(tvlUsd, fit.slope);
}

function gasPerTx(chain: string): [number, number] {
  return GAS_PER_TX[chain] ?? GAS_DEFAULT_TX;
}

/** The chain that sets the plan's gas: the most expensive one. */
function mainChain(p: SnapshotProtocol): { chain: string; perTxHigh: number } {
  let best = p.chains[0] ?? 'Ethereum';
  let bestCost = -1;
  for (const c of p.chains) {
    const cost = gasPerTx(c)[1];
    if (cost > bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return { chain: best, perTxHigh: bestCost };
}

export function farmPlan(p: SnapshotProtocol, impliedUsd: number): FarmPlan {
  const main = mainChain(p);
  const gas = TX_COUNT * main.perTxHigh;
  const ev = impliedUsd * DROP_SHARE * (CAPITAL_USD / p.tvl_usd);
  const net = ev - gas;
  const netPerHour = net / HOURS_PER_PLAN;
  const verdict = net > 25 && netPerHour > 5 ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
  return { ev_gross_usd: ev, gas_usd: gas, net_usd: net, net_per_hour_usd: netPerHour, verdict, main_chain: main.chain, gas_per_tx_usd: main.perTxHigh };
}

// --- Farm steps: concrete, costed, timed -----------------------------------

function money(n: number): string {
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  if (n >= 1) return `$${n.toFixed(n < 10 ? 2 : 0)}`;
  return `$${n.toFixed(2)}`;
}

const CORE_ACTION: Record<string, string> = {
  Dexs: 'Supply {CAP} of liquidity to the deepest {NAME} pool on {CHAIN} (the USDC pair with the largest TVL).',
  Lending: 'Supply {CAP} in USDC to {NAME} on {CHAIN}, then borrow up to $1,000 against it and hold the loan in stables (keep LTV under 50%).',
  CDP: 'Lock {CAP} of collateral in {NAME} on {CHAIN} and mint up to $1,000 of its stablecoin, keeping the collateral ratio above 200%.',
  Bridge: 'Bridge $1,000 in USDC out of {CHAIN} through {NAME} and $1,000 back, then use $1,000 on the destination chain for a week.',
  'Canonical Bridge': 'Bridge $1,000 in USDC out of {CHAIN} through {NAME} and $1,000 back, then use $1,000 on the destination chain for a week.',
  'Risk Curators': 'Deposit {CAP} into the {NAME} vault on {CHAIN} with the fastest-growing TVL; re-check the vault choice every 2 weeks.',
  'Onchain Capital Allocator': 'Deposit {CAP} into the {NAME} allocation vault on {CHAIN} with the fastest-growing TVL; re-check the choice every 2 weeks.',
  Yield: 'Deposit {CAP} into the highest-yield {NAME} vault on {CHAIN}; re-check the vault choice every 2 weeks.',
  RWA: 'Buy {CAP} of the tokenised asset on {NAME} ({CHAIN}) and hold it to accrue yield; claim the yield monthly.',
  Restaking: 'Stake {CAP} of assets through {NAME} on {CHAIN} and restake the points or rewards every week.',
  'Liquid Staking': 'Stake {CAP} of assets through {NAME} on {CHAIN} and restake the points or rewards every week.',
  'Staking Pool': 'Stake {CAP} of assets through {NAME} on {CHAIN} and restake the points or rewards every week.',
  'Basis Trading': 'Deposit {CAP} into the {NAME} basis vault on {CHAIN}; check the funding rate weekly and exit if it stays negative for 2 weeks.',
  Derivatives: 'Open a small hedged position on {NAME} ({CHAIN}): {CAP} long with a matching short elsewhere; never use more than 2x leverage.',
  Perpetual: 'Open a small hedged position on {NAME} ({CHAIN}): {CAP} long with a matching short elsewhere; never use more than 2x leverage.',
  'Stablecoin Wrapper': 'Deposit {CAP} of USDC into {NAME} on {CHAIN} and hold the wrapped position; claim any yield weekly.',
  Stable: 'Deposit {CAP} of USDC into {NAME} on {CHAIN} and hold the position; claim any yield weekly.',
  Insurance: 'Buy {CAP} of cover from {NAME} on {CHAIN} for the protocol you use most; renew it if it lapses before the horizon ends.',
  Payments: 'Route {CAP} of real payments through {NAME} on {CHAIN} over the horizon (invoices or payroll), keeping receipts.',
  Prediction: 'Place small predictions on {NAME} ({CHAIN}) totalling {CAP} over the horizon, spread across at least 10 markets.',
  'Governance Incentives': 'Stake {CAP} in {NAME} governance on {CHAIN} and vote on every proposal during the horizon.',
  Chain: 'Bridge {CAP} to {NAME} ({CHAIN}) and use its core apps weekly — swaps, lending and staking — to build an on-chain footprint.',
  CeDeFi: 'Deposit {CAP} into the {NAME} vault on {CHAIN} and keep it there for the full 12 weeks; read the vault report monthly.',
  'Collateral Markets': 'Supply {CAP} of collateral to {NAME} on {CHAIN} and borrow up to $1,000 against it (keep LTV under 50%).',
};

export function farmSteps(p: SnapshotProtocol, plan: FarmPlan): string[] {
  const cap = money(CAPITAL_USD);
  const gasTx = money(plan.gas_per_tx_usd);
  const gasTotal = money(plan.gas_usd);
  const core = (CORE_ACTION[p.category ?? ''] ??
    'Deposit {CAP} into {NAME} on {CHAIN} and interact with its core feature every week for 12 weeks.')
    .replaceAll('{CAP}', cap).replaceAll('{NAME}', p.name).replaceAll('{CHAIN}', plan.main_chain);
  const steps = [
    `Open ${p.name} on ${plan.main_chain} with a fresh wallet and hold ${cap} in USDC ready to deploy. Set aside about ${gasTotal} for gas. (10 min)`,
    `${core} Gas about ${gasTx} per transaction, 15 to 20 minutes.`,
    'Claim any fees, points or rewards weekly and compound them back into the same position. Each claim costs about ' + gasTx + ' in gas and takes 5 minutes.',
    `Repeat the core action every 2 weeks so the position stays active across the 12-week horizon; budget about ${gasTotal} of gas in total.`,
    `Watch ${p.name}'s official announcements and points page weekly; save a screenshot of your balance each week as proof of activity. (10 min a week)`,
    'Two weeks before the horizon ends, stop adding funds and let the position season; closing early breaks the activity streak.',
    `Exit in one transaction: withdraw, repay or unstake, then bridge the funds back if needed. Gas about ${gasTx}. If a token launches, claim it only in the official app — never through links in messages. Modelled gross drop value for a ${cap} position: about ${money(plan.ev_gross_usd)} (net ${money(plan.net_usd)} after gas).`,
  ];
  return steps.map((s) => s.slice(0, 600));
}

// --- Build the board and the dashboard's data -------------------------------

export function buildRadar(snapshot: Snapshot, mainSha256: string): { board: BoardRow[]; radar: RadarData } {
  const protocols = snapshot.protocols;
  const watchlist = new Set(snapshot.watchlist);
  const cal = calibrationSet(protocols);
  const fit = olsLogLog(cal);

  // Headline validation, recomputed on every run from the snapshot.
  const loo = looPrice(cal);
  const looMiss = missFactor(loo.preds, loo.actuals);
  const wf50 = walkForwardPrice(cal, 0.5, (tr, p) => predictMcap(olsLogLog(tr), p.tvl_usd));
  const wf70 = walkForwardPrice(cal, 0.7, (tr, p) => predictMcap(olsLogLog(tr), p.tvl_usd));
  const wf50Miss = wf50 ? missFactor(wf50.preds, wf50.actuals) : 0;
  const wf70Miss = wf70 ? missFactor(wf70.preds, wf70.actuals) : 0;
  const looFlatRes = looFlat(cal);
  const flatLooMiss = missFactor(looFlatRes.preds, looFlatRes.actuals);
  const wfFlat50 = walkForwardPrice(cal, 0.5, (tr, p) => flatPredict(tr, p.tvl_usd));
  const wfFlat70 = walkForwardPrice(cal, 0.7, (tr, p) => flatPredict(tr, p.tvl_usd));
  const flatWf50Miss = wfFlat50 ? missFactor(wfFlat50.preds, wfFlat50.actuals) : 0;
  const flatWf70Miss = wfFlat70 ? missFactor(wfFlat70.preds, wfFlat70.actuals) : 0;
  const range = rangeCalibration(loo.logErrs);
  const oddsFit = fitOdds(protocols);
  const brierOddsLoo = brierLoo(protocols, oddsFit.beta);
  const bands = bandShares(protocols);
  const bandBrierLoo = brierLooBand(protocols);

  // Walk-forward honesty of the LOO intervals: how often the printed
  // P25–P75 / P10–P90 bands actually covered walk-forward tokens.
  // (The in-sample range_p25_p75 / range_p10_p90 are ~50% / ~80% by
  // construction; these are the honest out-of-sample numbers.)
  const wfCov = (wf: { preds: number[]; actuals: number[] } | null): [number, number] => {
    if (!wf || wf.preds.length === 0) return [0, 0];
    const errs = wf.preds.map((p, i) => Math.log((wf.actuals[i] as number) / p));
    const in2575 = errs.filter((e) => e >= range.q25 && e <= range.q75).length / errs.length;
    const in1090 = errs.filter((e) => e >= range.q10 && e <= range.q90).length / errs.length;
    return [in2575, in1090];
  };
  const [wf50Cov2575, wf50Cov1090] = wfCov(wf50);
  const [wf70Cov2575, wf70Cov1090] = wfCov(wf70);
  const medianPredActual = Math.exp(-median(loo.logErrs));

  const boardRows = boardProtocols(protocols);
  const rows: BoardRow[] = boardRows.map((p) => {
    const v2 = impliedIfLaunches(fit, p.tvl_usd);
    const odds = bandOddsOf(p, bands);
    const v3 = v2 * odds;
    const plan = farmPlan(p, v3);
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: ageDays(p),
      watchlist: watchlist.has(p.slug),
      rank: 0,
      rank_lo: 0,
      rank_hi: 0,
      token_odds: odds,
      token_odds_band: bandOf(p).label,
      implied_if_launches_usd: Math.round(v2),
      implied_value_usd: Math.max(1, Math.round(v3)),
      implied_range_p25_usd: Math.max(1, Math.round(v3 * Math.exp(range.q25))),
      implied_range_p75_usd: Math.max(1, Math.round(v3 * Math.exp(range.q75))),
      implied_range_p10_usd: Math.max(1, Math.round(v3 * Math.exp(range.q10))),
      implied_range_p90_usd: Math.max(1, Math.round(v3 * Math.exp(range.q90))),
      ev_gross_usd: plan.ev_gross_usd,
      gas_usd: plan.gas_usd,
      net_usd: plan.net_usd,
      net_per_hour_usd: plan.net_per_hour_usd,
      verdict: plan.verdict,
      farm_steps: farmSteps(p, plan),
    };
  });
  // Stable order: implied value desc, TVL desc, slug asc. Rounding is
  // monotone, so the rounded values never rise with rank either.
  rows.sort((a, b) =>
    b.implied_value_usd - a.implied_value_usd ||
    b.tvl_usd - a.tvl_usd ||
    (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => { r.rank = i + 1; });

  // Rank ranges: bootstrap the price fit (resample the calibration set,
  // refit OLS, re-rank by the same key) and record each row's P10–P90
  // rank. Odds are held fixed — the price fit is what moves ranks.
  // Deterministic seed, so two runs agree byte for byte.
  const BOOT_B = 200;
  const rankSamples: number[][] = rows.map(() => []);
  const rowIndex = new Map(rows.map((r, i) => [r.slug, i]));
  const baseTop10 = new Set(rows.slice(0, 10).map((r) => r.slug));
  let top10Stable = 0;
  const rng = mulberry32(20261126);
  for (let b = 0; b < BOOT_B; b++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < cal.length; i++) sample.push(cal[Math.floor(rng() * cal.length)] as SnapshotProtocol);
    const bFit = olsLogLog(sample);
    const scored = rows.map((r) => ({
      slug: r.slug,
      tvl: r.tvl_usd,
      v: Math.max(1, Math.round(Math.exp(bFit.intercept) * Math.pow(r.tvl_usd, bFit.slope) * r.token_odds)),
    }));
    scored.sort((a, b2) => b2.v - a.v || b2.tvl - a.tvl || (a.slug < b2.slug ? -1 : 1));
    scored.forEach((s, i) => { (rankSamples[rowIndex.get(s.slug) as number] as number[]).push(i + 1); });
    const top10 = new Set(scored.slice(0, 10).map((s) => s.slug));
    if ([...baseTop10].every((s) => top10.has(s))) top10Stable += 1;
  }
  rows.forEach((r, i) => {
    const s = [...(rankSamples[i] as number[])].sort((a, b) => a - b);
    // The P10–P90 interval is widened to contain the point rank: the
    // bootstrap distribution can sit slightly off the full-fit rank
    // (resampling bias), and a range that excludes its own rank is nonsense.
    r.rank_lo = Math.max(1, Math.min(Math.round(quantile(s, 0.1)), r.rank));
    r.rank_hi = Math.min(rows.length, Math.max(Math.round(quantile(s, 0.9)), r.rank));
  });
  const top10StablePct = top10Stable / BOOT_B;

  const rec = reconciliation(protocols, watchlist);
  // The Live list shows the token-bearing protocols that actually
  // record a market cap (128 of 416): a peer with no market cap
  // cannot price anything, and its ratio would be meaningless.
  const tokenBearing = protocols.filter((p) => !isPreToken(p));
  const live = protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      ratio: (p.mcap_usd as number) / p.tvl_usd,
    }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));

  const farmCounts = { FARM: 0, MARGINAL: 0, SKIP: 0 };
  for (const r of rows) farmCounts[r.verdict] += 1;
  const topRow = rows[0];
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const bittensor = bySlug.get('bittensor-dtao');
  const nonce = bySlug.get('nonce-capital');

  // Odds-table numbers for the two live definitions, recomputed here.
  const protoBySlug = new Map(protocols.map((p) => [p.slug, p]));
  const top4Watch = [...rows].filter((r) => r.watchlist).sort((a, b) => b.tvl_usd - a.tvl_usd).slice(0, 4);
  const bandTop4 = Math.max(...top4Watch.map((r) => r.token_odds));
  const bandYoung = Math.min(bittensor ? bittensor.token_odds : 1, nonce ? nonce.token_odds : 1);
  const logTop4 = Math.max(...top4Watch.map((r) => oddsOf(protoBySlug.get(r.slug) as SnapshotProtocol, oddsFit.beta)));
  const bitProto = protoBySlug.get('bittensor-dtao');
  const nonceProto = protoBySlug.get('nonce-capital');
  const logYoung = Math.min(
    bitProto ? oddsOf(bitProto, oddsFit.beta) : 1,
    nonceProto ? oddsOf(nonceProto, oddsFit.beta) : 1,
  );
  const oddsDefinitions = ODDS_DEFINITIONS.map((d) => {
    if (d.definition === 'age_band_shares') return { ...d, brier_loo: bandBrierLoo, top4_max: bandTop4, young_min: bandYoung };
    if (d.definition === 'logistic_interaction') return { ...d, brier_loo: brierOddsLoo, top4_max: logTop4, young_min: logYoung };
    return d;
  });

  const radar: RadarData = {
    model: {
      name: 'radar-v2',
      price: 'log-log OLS, TVL only',
      odds: 'age-band shares (7 bands)',
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      capital_usd: CAPITAL_USD,
      drop_share: DROP_SHARE,
      gas_level: 'high',
      hours_per_plan: HOURS_PER_PLAN,
      horizon_weeks: 12,
      main_sha256: mainSha256,
      ols_intercept: fit.intercept,
      ols_slope: fit.slope,
      ols_n: fit.n,
      ols_r2: fit.r2,
      odds_beta: oddsFit.beta,
      odds_bands: bands.map((a) => ({
        label: a.band.label,
        lo_days: a.band.loDays < 0 ? null : a.band.loDays,
        hi_days: a.band.hiDays === Infinity ? null : a.band.hiDays,
        n: a.n,
        rate: a.rate,
      })),
      odds_med_age_days: MED_AGE_DAYS,
      odds_med_change: MED_CHANGE,
    },
    totals: {
      protocols: protocols.length,
      board: rows.length,
      token_bearing: rec.tokenBearing,
      excluded: rec.excluded,
      watchlist: snapshot.watchlist.length,
      board_tvl_usd: rows.reduce((s, r) => s + r.tvl_usd, 0),
      total_implied_v2_usd: rows.reduce((s, r) => s + r.implied_if_launches_usd, 0),
      total_implied_v3_usd: rows.reduce((s, r) => s + r.implied_value_usd, 0),
      farm: farmCounts,
    },
    validation: {
      loo_miss: looMiss,
      wf50_miss: wf50Miss,
      wf70_miss: wf70Miss,
      flat_loo_miss: flatLooMiss,
      flat_wf50_miss: flatWf50Miss,
      flat_wf70_miss: flatWf70Miss,
      range_within_x3: range.withinX3,
      range_p25_p75: range.withinP25P75,
      range_p10_p90: range.withinP10P90,
      wf50_cov_p25_p75: wf50Cov2575,
      wf50_cov_p10_p90: wf50Cov1090,
      wf70_cov_p25_p75: wf70Cov2575,
      wf70_cov_p10_p90: wf70Cov1090,
      range_q25_log: range.q25,
      range_q75_log: range.q75,
      median_pred_actual: medianPredActual,
      top10_stable_pct: top10StablePct,
      brier_odds_loo: bandBrierLoo,
      brier_odds_in_sample: oddsFit.brierInSample,
      brier_base_rate: oddsFit.baseRate * (1 - oddsFit.baseRate),
      top_row_odds: topRow ? topRow.token_odds : 0,
      young_odds_bittensor: bittensor ? bittensor.token_odds : 0,
      young_odds_nonce: nonce ? nonce.token_odds : 0,
      price_variants_tested: PRICE_VARIANTS.length,
      price_variants_kept: PRICE_VARIANTS.filter((v) => v.kept).length,
      odds_definitions_tested: ODDS_DEFINITIONS.length,
      odds_definitions_kept: ODDS_DEFINITIONS.filter((v) => v.kept).length,
    },
    price_variants: PRICE_VARIANTS,
    odds_definitions: oddsDefinitions,
    ledger: ledgerGroups(protocols, snapshot),
    accounting: {
      segments: [
        { key: 'ranked', label: 'Ranked pre-token', count: rec.board, tvl_usd: rows.reduce((s, r) => s + r.tvl_usd, 0) },
        { key: 'token', label: 'Already has a token', count: rec.tokenBearing, tvl_usd: tokenBearing.reduce((s, p) => s + p.tvl_usd, 0) },
        { key: 'excluded', label: 'Pre-token, excluded by house rules', count: rec.excluded, tvl_usd: protocols.filter((p) => isPreToken(p) && !isRankable(p)).reduce((s, p) => s + p.tvl_usd, 0) },
      ],
      excluded_reasons: rec.excludedReasons,
    },
    board: rows,
    live,
  };
  return { board: rows, radar };
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/** The gate's own shape, checked before writing anything. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows`;
  const seen = new Set<string>();
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  for (let i = 0; i < board.length; i++) {
    const r = board[i];
    if (!slugs.has(r.slug)) return `row ${i} names an unknown slug ${r.slug}`;
    if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
    seen.add(r.slug);
    if (r.rank !== i + 1) return `row ${r.slug} has rank ${r.rank}, expected ${i + 1}`;
    if (i > 0 && board[i - 1].implied_value_usd < r.implied_value_usd) {
      return `implied value rises from rank ${i} to ${i + 1}`;
    }
    if (!r.name) return `row ${r.slug} has no name`;
    if (!(r.implied_value_usd > 0) || !Number.isInteger(r.implied_value_usd)) {
      return `row ${r.slug} has a bad implied value`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `row ${r.slug} has ${r.farm_steps.length} farm steps`;
    }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${r.slug} has a farm step of ${t.length} chars`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  if (board.every((r) => r.implied_value_usd === board[0].implied_value_usd)) {
    return 'all implied values are equal';
  }
  return null;
}
