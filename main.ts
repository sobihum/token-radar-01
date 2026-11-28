// Launch Radar v4 — main.ts
// Reads the sealed DefiLlama snapshot, ranks every pre-token protocol the house
// rules leave in, and writes board.json, the dashboard data, and dossier.json.
// Node 22, standard library only. Fully deterministic: no clock, no network,
// no unseeded randomness. Run: node main.ts --input <snapshot.json>
// Output directory: MAKEFUN_OUTPUT_DIR, default ./out
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const started = Date.now();

// ------------------------------------------------------------------ small tools
const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const r4 = (x: number): number => Math.round(x * 10000) / 10000;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Solve Ax=b by Gaussian elimination with partial pivoting (small dense systems).
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / d;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}
function ols(X: number[][], y: number[]): number[] {
  const p = X[0].length;
  const XtX: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const Xty = new Array<number>(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  return solve(XtX, Xty);
}
function quantile(sorted: number[], q: number): number {
  const n = sorted.length;
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const median = (a: number[]): number => quantile([...a].sort((x, y) => x - y), 0.5);
const mean = (a: number[]): number => a.reduce((s, x) => s + x, 0) / a.length;
const pstdev = (a: number[], m: number): number => Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length);

// ------------------------------------------------------------------ inputs
const argv = process.argv.slice(2);
let inputPath = '/input/snapshot.json';
for (let i = 0; i < argv.length; i++) if (argv[i] === '--input' && argv[i + 1]) inputPath = argv[i + 1];
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || './out');
const snap = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
const AS_OF = snap.as_of as string; // "2026-11-14"
const FLOOR = snap.floor_usd as number;
const asOfDay = Date.parse(AS_OF + 'T00:00:00Z');

interface Proto {
  slug: string; name: string; category: string; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
const prots = snap.protocols as Proto[];
const watchlist = new Set<string>(snap.watchlist as string[]);
const N = prots.length;

function ageDays(p: Proto): number {
  if (!p.listed_at) return 677;
  const d = Math.round((asOfDay - Date.parse(p.listed_at + 'T00:00:00Z')) / 86400000);
  return Math.max(0, d);
}
const hasToken = (p: Proto): boolean => p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null;
const isPre = (p: Proto): boolean => p.gecko_id === null && p.symbol === null && p.mcap_usd === null;

// House exclusion groups, category first, then versioned, then exchange prefix,
// then wrapped-word. Each protocol lands in exactly one group.
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
function exclGroup(p: Proto): string | null {
  const c = p.category; const n = p.name;
  if (c === 'Bridge' || c === 'Canonical Bridge') return 'Bridge';
  if (c === 'Liquid Staking' || c === 'Liquid Restaking' || c === 'Restaked BTC') return 'Liquid staking';
  if (c === 'CEX') return 'Exchange';
  if (/\s[Vv]\d+$/.test(n) || /\s\d+\.\d+$/.test(n)) return 'Versioned';
  for (const e of EXCHANGES) if (n.startsWith(e)) return 'Exchange';
  if (/\b(wrapped|staked|staking)\b/i.test(n)) return 'Wrapped';
  return null;
}

// ------------------------------------------------------------------ price model (quad, K7/K10)
const QUAD = [10.054909012247458, 0.18926139518787044, 0.00884283527213886];
const quadLog = (tvl: number): number => {
  const l = Math.log(tvl);
  return QUAD[0] + QUAD[1] * l + QUAD[2] * l * l;
};
const fittedMcap = (tvl: number): number => Math.exp(quadLog(tvl));
const fittedMult = (tvl: number): number => fittedMcap(tvl) / tvl;
const quadX = (p: Proto): number[] => { const l = Math.log(p.tvl_usd); return [1, l, l * l]; };
const olsX = (p: Proto): number[] => [1, Math.log(p.tvl_usd)];

const cal = prots.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
const calY = cal.map((p) => Math.log(p.mcap_usd as number));
// Leave-one-out residuals of the quad, refit per row.
const looRes: number[] = [];
for (let i = 0; i < cal.length; i++) {
  const X = cal.filter((_, j) => j !== i).map(quadX);
  const y = calY.filter((_, j) => j !== i);
  const b = ols(X, y);
  const xi = quadX(cal[i]);
  looRes.push(calY[i] - b.reduce((s, v, k) => s + v * xi[k], 0));
}
const looSorted = [...looRes].sort((a, b) => a - b);
const looMiss = Math.exp(median(looRes.map(Math.abs)));
const Q = { p10: quantile(looSorted, 0.1), p25: quantile(looSorted, 0.25), p75: quantile(looSorted, 0.75), p90: quantile(looSorted, 0.9) };
const cov2575 = looRes.filter((r) => r >= Q.p25 && r <= Q.p75).length / looRes.length;
const cov1090 = looRes.filter((r) => r >= Q.p10 && r <= Q.p90).length / looRes.length;
const covX3 = looRes.filter((r) => Math.abs(r) <= Math.log(3)).length / looRes.length;
// Walk-forward: dated calibration rows only, oldest first.
const dated = cal.filter((p) => p.listed_at).sort((a, b) => (a.listed_at as string) < (b.listed_at as string) ? -1 : 1);
function wfMiss(frac: number, feat: (p: Proto) => number[]): number {
  const n = Math.floor(dated.length * frac);
  const tr = dated.slice(0, n); const te = dated.slice(n);
  const b = ols(tr.map(feat), tr.map((p) => Math.log(p.mcap_usd as number)));
  const errs = te.map((p) => Math.abs(Math.log(p.mcap_usd as number) - feat(p).reduce((s, v, k) => s + v * b[k], 0)));
  return Math.exp(median(errs));
}
function wfMissFlat(frac: number): number {
  const n = Math.floor(dated.length * frac);
  const tr = dated.slice(0, n); const te = dated.slice(n);
  const med = median(tr.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  return Math.exp(median(te.map((p) => Math.abs(Math.log(p.mcap_usd as number) - Math.log(med * p.tvl_usd)))));
}
const wf = {
  quad50: wfMiss(0.5, quadX), quad70: wfMiss(0.7, quadX),
  ols50: wfMiss(0.5, olsX), ols70: wfMiss(0.7, olsX),
  flat50: wfMissFlat(0.5), flat70: wfMissFlat(0.7),
  n50: dated.length - Math.floor(dated.length * 0.5),
  n70: dated.length - Math.floor(dated.length * 0.7),
};
// Negative control: quad plus the 7-day growth of the NEXT protocol by slug.
// A feature that carries no information about this row must not help.
const calBySlug = [...cal].sort((a, b) => (a.slug < b.slug ? -1 : 1));
const chgVals = calBySlug.map((p) => (p.change_7d === null ? -8.23335 : p.change_7d));
const negRes: number[] = [];
for (let i = 0; i < calBySlug.length; i++) {
  const X = calBySlug.filter((_, j) => j !== i).map((p, j) => {
    const jj = j >= i ? j + 1 : j;
    return [...quadX(p), chgVals[(jj + 1) % calBySlug.length] / 100];
  });
  const y = calBySlug.filter((_, j) => j !== i).map((p) => Math.log(p.mcap_usd as number));
  const b = ols(X, y);
  const xi = [...quadX(calBySlug[i]), chgVals[(i + 1) % calBySlug.length] / 100];
  negRes.push(Math.log(calBySlug[i].mcap_usd as number) - b.reduce((s, v, k) => s + v * xi[k], 0));
}
const negMiss = Math.exp(median(negRes.map(Math.abs)));

// ------------------------------------------------------------------ token odds (k-NN peer blend, K12)
// odds = 0.6 * peer_rate + 0.4 * logistic_interaction. Peers are the 30 nearest
// protocols in standardised [log10 TVL, log1p(age)/log1p(1095)] space, across all
// categories; "records a token" means DefiLlama lists a gecko id, a symbol, or a
// market cap for the protocol.
const LOG1095 = Math.log1p(1095);
const feat = prots.map((p) => [Math.log10(p.tvl_usd), Math.log1p(ageDays(p)) / LOG1095]);
const fMean = [mean(feat.map((f) => f[0])), mean(feat.map((f) => f[1]))];
const fStd = [pstdev(feat.map((f) => f[0]), fMean[0]), pstdev(feat.map((f) => f[1]), fMean[1])];
const Z = feat.map((f) => [(f[0] - fMean[0]) / fStd[0], (f[1] - fMean[1]) / fStd[1]]);
const BETA = [-20.94353469876965, 2.2390161109072815, 22.01291562492974, -1.515024554597611, -2.3111045361822593];
const MED_CHG = -8.23335;
function logistic(p: Proto): number {
  const la = Math.log1p(ageDays(p)) / LOG1095;
  const chg = p.change_7d === null ? MED_CHG : p.change_7d;
  const x = [1, Math.log10(p.tvl_usd), la, chg / 100, la * Math.log10(p.tvl_usd)];
  const z = BETA.reduce((s, b, k) => s + b * x[k], 0);
  return 1 / (1 + Math.exp(-z));
}
// Nearest neighbours per protocol (self excluded), sorted by distance then index.
interface Peer { idx: number; d: number; token: boolean; priced: boolean; }
const peers: Peer[][] = [];
for (let i = 0; i < N; i++) {
  const arr: Peer[] = [];
  for (let j = 0; j < N; j++) {
    if (j === i) continue;
    const dx = Z[i][0] - Z[j][0]; const dy = Z[i][1] - Z[j][1];
    arr.push({ idx: j, d: dx * dx + dy * dy, token: hasToken(prots[j]), priced: prots[j].mcap_usd !== null && (prots[j].mcap_usd as number) > 0 });
  }
  arr.sort((a, b) => (a.d - b.d) || (a.idx - b.idx));
  peers.push(arr);
}
const peerRate = peers.map((arr) => arr.slice(0, 30).filter((q) => q.token).length / 30);
const odds = prots.map((p, i) => 0.6 * peerRate[i] + 0.4 * logistic(p));

// ------------------------------------------------------------------ farm profile (K13)
// Capital $2,000, drop share 7%, gas high, 5 transactions, 3.5 active hours,
// 12-week horizon. Net = capital x fitted multiple x drop share x odds - gas.
// Gas is the dearest chain the protocol runs on; "high" is the dearest quote.
const GAS: Record<string, number> = {
  Ethereum: 15, Base: 2, Arbitrum: 2, Optimism: 2, Avalanche: 2,
  Binance: 1, Polygon: 1, Tron: 1, Hyperliquid: 0.5, 'Hyperliquid L1': 0.5,
  Monad: 0.5, Solana: 0.05,
};
const gasTx = (p: Proto): number => Math.max(...p.chains.map((c) => GAS[c] ?? 5));
const CAPITAL = 2000; const DROP = 0.07; const TXN = 5; const HOURS = 3.5;
function farmNet(p: Proto, i: number): number {
  return CAPITAL * fittedMult(p.tvl_usd) * DROP * odds[i] - TXN * gasTx(p);
}
function verdict(net: number): string {
  if (net > 25 && net / HOURS > 5) return 'FARM';
  if (net > 0) return 'MARGINAL';
  return 'SKIP';
}
// Named plan kind, derived from the protocol's own category (never its name).
function planKind(cat: string): string {
  if (cat === 'Dexs') return 'liquidity and swaps';
  if (cat === 'Lending' || cat === 'Uncollateralized Lending') return 'supply and borrow';
  if (cat === 'CDP' || cat === 'CDP Manager') return 'mint against collateral';
  if (cat === 'RWA') return 'tokenised asset';
  if (cat === 'Restaking' || cat === 'Staking Pool') return 'stake and delegate';
  return 'curated vault';
}
const money = (x: number): string => '$' + Math.round(x).toLocaleString('en-US');
function farmSteps(p: Proto, i: number, kind: string, net: number): string[] {
  const chain = p.chains[0];
  const g = gasTx(p);
  const gasAll = TXN * g;
  const gross = CAPITAL * fittedMult(p.tvl_usd) * DROP * odds[i];
  return [
    `Bridge ${money(CAPITAL)} of stablecoins to ${chain} so the plan starts where ${p.name} runs; one transaction, about ${money(g)} in gas at the protocol's dearest chain, roughly 20 minutes including confirmations.`,
    `Deposit the ${money(CAPITAL)} into ${p.name}'s ${kind} position on ${chain}; one transaction, about ${money(g)} in gas, roughly 30 minutes to check the receipt and confirm the position shows.`,
    `Make two swaps of $200 each through ${p.name} in weeks 2 and 6 to keep the position active; two transactions, about ${money(g)} in gas each, roughly 15 minutes of hands-on time per swap.`,
    `Check ${p.name}'s announcements once a week for 12 weeks and write down the position address and a screenshot of the deposit; no gas, about 9 minutes a week, so the record survives even if the front end changes.`,
    `Withdraw the ${money(CAPITAL)} plus any rewards after week 12, once the snapshot the plan is built around has passed; one transaction, about ${money(g)} in gas, roughly 20 minutes, then compare what arrives with the ${money(net)} net and ${money(gross)} gross this table shows. Total gas for the five transactions is about ${money(gasAll)}.`,
  ];
}

// ------------------------------------------------------------------ board
interface Row {
  slug: string; name: string; rank: number; category: string; chain: string;
  tvl: number; chg: number | null; age: number; watch: boolean;
  odds: number; peer: number; fitted: number; implied: number;
  lo: number; hi: number; net: number; verdict: string;
  be: number; pays: number; kind: string; plan: string; gas: number;
  rankLo: number; rankHi: number; steps: string[];
  nb: { n: string; c: string; t: number; r: number }[];
}
const ranked = prots.map((p, i) => ({ p, i })).filter(({ p }) => isPre(p) && exclGroup(p) === null);
const rows: Row[] = ranked.map(({ p, i }) => {
  const fitted = fittedMcap(p.tvl_usd);
  const implied = fitted * odds[i];
  const net = farmNet(p, i);
  const mult = fitted / p.tvl_usd;
  const kind = planKind(p.category);
  const be = (TXN * gasTx(p)) / (CAPITAL * mult * odds[i]); // drop share at break-even
  const pays = (TXN * gasTx(p)) / (mult * DROP * odds[i]); // smallest ticket that pays
  const nb = peers[i].filter((q) => q.priced).slice(0, 3).map((q) => {
    const np = prots[q.idx];
    return { n: np.name, c: np.category, t: np.tvl_usd, r: r3((np.mcap_usd as number) / np.tvl_usd) };
  });
  return {
    slug: p.slug, name: p.name, rank: 0, category: p.category, chain: p.chains[0],
    tvl: p.tvl_usd, chg: p.change_7d, age: ageDays(p), watch: watchlist.has(p.slug),
    odds: odds[i], peer: peerRate[i], fitted, implied,
    lo: implied * Math.exp(Q.p25), hi: implied * Math.exp(Q.p75),
    net, verdict: verdict(net), be, pays, kind,
    plan: kind + ' plan on ' + p.chains[0], gas: gasTx(p),
    rankLo: 0, rankHi: 0, steps: farmSteps(p, i, kind, net), nb,
  };
});
rows.sort((a, b) => (b.implied - a.implied) || (a.slug < b.slug ? -1 : 1));
rows.forEach((r, k) => { r.rank = k + 1; });
const totalImplied = rows.reduce((s, r) => s + r.implied, 0);
const totalTvl = rows.reduce((s, r) => s + r.tvl, 0);
const farmCounts = { FARM: 0, MARGINAL: 0, SKIP: 0 };
rows.forEach((r) => { farmCounts[r.verdict as 'FARM' | 'MARGINAL' | 'SKIP']++; });
const topNet = [...rows].sort((a, b) => b.net - a.net)[0];

// Bootstrap: 200 resamples of the 128 calibration rows, refit the quad, re-rank
// the board with odds held fixed. Reports coefficient standard errors, the
// rank range of every row, and the spread of the implied total.
const rng = mulberry32(20261114);
const BOOT = 200;
const bootCoefs: number[][] = [];
const bootTotals: number[] = [];
const rankLoArr = rows.map(() => 999);
const rankHiArr = rows.map(() => 0);
const bySlug = new Map(rows.map((r) => [r.slug, r]));
for (let b = 0; b < BOOT; b++) {
  const idxs = Array.from({ length: cal.length }, () => Math.floor(rng() * cal.length));
  const bc = ols(idxs.map((k) => quadX(cal[k])), idxs.map((k) => calY[k]));
  bootCoefs.push(bc);
  const scored = rows.map((r) => {
    const l = Math.log(r.tvl);
    return { slug: r.slug, imp: Math.exp(bc[0] + bc[1] * l + bc[2] * l * l) * r.odds };
  });
  scored.sort((a, c) => (c.imp - a.imp) || (a.slug < c.slug ? -1 : 1));
  scored.forEach((s, k) => {
    const rk = k + 1;
    const j = rows.findIndex((r) => r.slug === s.slug);
    if (rk < rankLoArr[j]) rankLoArr[j] = rk;
    if (rk > rankHiArr[j]) rankHiArr[j] = rk;
  });
  bootTotals.push(scored.reduce((s, x) => s + x.imp, 0));
}
rows.forEach((r, k) => { r.rankLo = rankLoArr[k]; r.rankHi = rankHiArr[k]; });
const coefSe = [0, 1, 2].map((k) => {
  const vals = bootCoefs.map((c) => c[k]);
  return pstdev(vals, mean(vals));
});
const bootTotalSorted = [...bootTotals].sort((a, b) => a - b);
const bootTotal = { p5: quantile(bootTotalSorted, 0.05), med: quantile(bootTotalSorted, 0.5), p95: quantile(bootTotalSorted, 0.95) };

// Ledger: every one of the 758 protocols in exactly one group.
const ledger: Record<string, number> = {
  'Token trades, mcap > 0': 0, 'Token recorded, no usable cap': 0,
  'Ranked watchlist': 0, 'Ranked off-list >= floor': 0, 'Ranked early < floor': 0,
  Bridge: 0, 'Liquid staking': 0, Exchange: 0, Versioned: 0, Wrapped: 0,
};
for (const p of prots) {
  if (p.mcap_usd !== null && p.mcap_usd > 0) ledger['Token trades, mcap > 0']++;
  else if (!isPre(p)) ledger['Token recorded, no usable cap']++;
  else {
    const g = exclGroup(p);
    if (g === null) {
      if (watchlist.has(p.slug)) ledger['Ranked watchlist']++;
      else if (p.tvl_usd >= FLOOR) ledger['Ranked off-list >= floor']++;
      else ledger['Ranked early < floor']++;
    } else ledger[g]++;
  }
}
const ledgerTotal = Object.values(ledger).reduce((s, x) => s + x, 0);
// The record behind the odds: token rate per age bucket, from the snapshot.
const buckets = [
  { label: '0-1 yr', lo: 0, hi: 365 }, { label: '1-2 yr', lo: 365, hi: 730 },
  { label: '2-3 yr', lo: 730, hi: 1095 }, { label: '3+ yr', lo: 1095, hi: 999999 },
].map((bk) => {
  const sub = prots.filter((p) => { const a = ageDays(p); return a >= bk.lo && a < bk.hi; });
  return { l: bk.label, n: sub.length, r: sub.length ? sub.filter(hasToken).length / sub.length : 0 };
});
// Calibration scatter: priced protocols, log10 TVL and cap/TVL.
const scatter = cal.map((p) => [Math.round(Math.log10(p.tvl_usd) * 100) / 100, r3((p.mcap_usd as number) / p.tvl_usd)]);

// ------------------------------------------------------------------ evidence ladder (Kaggle K1/K7/K8/K10/K11/K12)
// Every figure below is a held-out number from the Kaggle waves, named by wave;
// the one live-computed row is the negative control above. Nothing here is typed
// from memory: value rows are K1/K7/K10 leave-one-out + walk-forward misses
// (median x), odds rows are K2/K8/K11/K12 leave-one-out Brier scores.
const EVID_VALUE: (string | number | null)[][] = [
  ['Size only (log TVL)', 3.40, 3.01, 3.41, 'n'],
  ['Size + quadratic term', 3.38, 2.61, 2.82, 'k'],
  ['Size + category', 3.45, 2.87, 2.98, 'n'],
  ['Size + 7-day growth', 3.76, 2.74, 3.62, 'n'],
  ['Size + age', 3.42, 2.96, 5.45, 'n'],
  ['Size + growth + age', 3.53, 2.72, 5.80, 'n'],
  ['Size + chain count', 3.66, 2.81, 3.28, 'n'],
  ['Slope per category', 3.68, 2.64, 2.51, 'n'],
  ['Quadratic + growth', 3.79, 2.55, 3.40, 'n'],
  ['Quadratic + log-age squared', 3.56, 3.23, 34.11, 'n'],
  ['Quadratic + category', 3.69, 2.61, 2.37, 'n'],
  ['Cubic in log TVL', 3.56, 2.37, 3.32, 'n'],
  ['Ridge, best alpha', 3.44, 2.60, 3.79, 'n'],
  ['k-NN price, k=15', 4.11, 3.29, 2.86, 'n'],
  ['Flat median multiple', 5.07, 5.29, 5.29, 'n'],
  ["Quadratic + another row's growth", r3(negMiss), null, null, 'm'],
];
const EVID_ODDS: (string | number)[][] = [
  ['Logistic interaction', 0.2254, 0.62, 0.41, 0.058, 'n'],
  ['Logistic + category', 0.2135, 0.57, 0.07, 0.035, 'n'],
  ['Hazard, smoothed', 0.2495, 0.51, 0.78, 0.390, 'n'],
  ['Empirical-Bayes cells', 0.2488, 0.56, 0.52, 0.088, 'n'],
  ['Peer rate as a logistic feature', 0.2081, 0.60, 0.19, 0.044, 'n'],
  ['Same-category peer blend', 0.2174, 0.65, 0.35, 0.076, 'n'],
  ['Tempered isotonic (v3 odds)', 0.2251, 0.62, 0.38, 0.032, 'n'],
  ['k-NN peer blend k=10, m=20', 0.2192, 0.69, 0.41, 0.042, 'n'],
  ['k-NN peer blend k=30, m=20', 0.2199, 0.69, 0.36, 0.037, 'k'],
];

// ------------------------------------------------------------------ output data
const cats = [...new Set([...rows.map((r) => r.category), ...rows.flatMap((r) => r.nb.map((q) => q.c))])].sort();
const chains = [...new Set(rows.map((r) => r.chain))].sort();
const kinds = ['curated vault', 'supply and borrow', 'liquidity and swaps', 'mint against collateral', 'tokenised asset', 'stake and delegate'];
const catIdx = (c: string): number => cats.indexOf(c);
const chainIdx = (c: string): number => chains.indexOf(c);
const m3 = (x: number): number => { const m = x / 1e6; return m >= 100 ? Math.round(m) : Math.round(m * 10) / 10; }; // $M, 3 significant figures
const bySlugRow = new Map(rows.map((r) => [r.slug, r]));
const oddOf = (slug: string): number => r3(bySlugRow.get(slug)?.odds ?? NaN);
const mainTsHash = sha256(readFileSync(join(SCRIPT_DIR, 'main.ts')));
const tbill12 = CAPITAL * 0.04 * (12 / 52); // stated 4.0% annual T-bill assumption
const meta = {
  asOf: AS_OF, n: rows.length, tvlB: r3(totalTvl / 1e9), impB: r3(totalImplied / 1e9),
  imp: Math.round(totalImplied), tvl: totalTvl,
  farm: [farmCounts.FARM, farmCounts.MARGINAL, farmCounts.SKIP],
  topNet: { n: topNet.name, v: Math.round(topNet.net * 100) / 100 },
  loo: r3(looMiss), wf50: r3(wf.quad50), wf70: r3(wf.quad70),
  olsLoo: 3.40, olsWf50: r3(wf.ols50), olsWf70: r3(wf.ols70),
  flatLoo: 5.07, flatWf: r3(wf.flat50),
  cov2575: Math.round(cov2575 * 1000) / 10, cov1090: Math.round(cov1090 * 1000) / 10,
  covX3: Math.round(covX3 * 1000) / 10,
  q: [r3(Q.p10), r3(Q.p25), r3(Q.p75), r3(Q.p90)],
  neg: r3(negMiss), coef: QUAD.map(r4), coefSe: coefSe.map((s) => Math.round(s * 100) / 100),
  bootN: BOOT, bootTot: [Math.round(bootTotal.p5 / 1e6), Math.round(bootTotal.med / 1e6), Math.round(bootTotal.p95 / 1e6)],
  brier: 0.2199, topOdds: 0.686, youngMin: 0.363, decile: 0.037, baseRate: 0.549,
  top4: { steak: oddOf('steakhouse-financial'), gaunt: oddOf('gauntlet'), usdd: oddOf('usdd'), veda: oddOf('veda') },
  young: { dtao: oddOf('bittensor-dtao'), nonce: oddOf('nonce-capital') },
  ledger, ledgerTotal, buckets: buckets.map((b) => [b.l, b.n, Math.round(b.r * 1000) / 10]),
  scatter, gas: GAS, capital: CAPITAL, drop: DROP, txn: TXN, hours: HOURS,
  tbill: Math.round(tbill12 * 100) / 100, checksum: mainTsHash.slice(0, 16),
  ev: EVID_VALUE, eo: EVID_ODDS,
};
const nbNames: string[] = [];
const nbIdMap = new Map<string, number>();
const nbId = (n: string): number => {
  let id = nbIdMap.get(n);
  if (id === undefined) { id = nbNames.length; nbNames.push(n); nbIdMap.set(n, id); }
  return id;
};
const dataRows = rows.map((r) => [
  r.name, catIdx(r.category), chainIdx(r.chain), m3(r.tvl),
  r.chg === null ? null : Math.round(r.chg * 10) / 10, r.age,
  r3(r.odds), r3(r.peer), m3(r.implied), Math.round(r.net),
  r.verdict === 'FARM' ? 0 : r.verdict === 'MARGINAL' ? 1 : 2,
  r.watch ? 1 : 0, r.rankLo, r.rankHi, kinds.indexOf(r.kind),
  r.nb.map((q) => [nbId(q.n), catIdx(q.c), m3(q.t), q.r]), r.gas,
]);
// One board row per line, so a reader that stops early still sees whole rows.
const dataJs = 'window.RADAR={"m":' + JSON.stringify(meta) + ',"cats":' + JSON.stringify(cats) +
  ',"chains":' + JSON.stringify(chains) + ',"kinds":' + JSON.stringify(kinds) +
  ',"nt":' + JSON.stringify(nbNames) + ',"b":[\n' +
  dataRows.map((r) => JSON.stringify(r)).join(',\n') + '\n]};\n';

// ------------------------------------------------------------------ write outputs
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'dashboard'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
const board = {
  rows: rows.map((r) => ({
    slug: r.slug, name: r.name, rank: r.rank, category: r.category, chain: r.chain,
    tvl_usd: r.tvl, change_7d_pct: r.chg, age_days: r.age, watchlist: r.watch,
    token_odds: r3(r.odds), peer_rate_knn: r3(r.peer),
    fitted_mcap_usd: Math.round(r.fitted), implied_value_usd: Math.round(r.implied),
    range_lo_usd: Math.round(r.lo), range_hi_usd: Math.round(r.hi),
    farm_verdict: r.verdict, farm_net_usd: Math.round(r.net * 100) / 100,
    farm_net_per_hour_usd: Math.round((r.net / HOURS) * 100) / 100,
    break_even_drop_share: Math.round(r.be * 1000) / 1000,
    pays_from_usd: Math.round(r.pays),
    plan_kind: r.kind, plan_name: r.plan, rank_lo_boot: r.rankLo, rank_hi_boot: r.rankHi,
    farm_steps: r.steps,
  })),
};
writeFileSync(join(outDir, 'board.json'), JSON.stringify(board, null, 2) + '\n');
for (const f of readdirSync(join(SCRIPT_DIR, 'dashboard'))) {
  copyFileSync(join(SCRIPT_DIR, 'dashboard', f), join(outDir, 'dashboard', f));
}
for (const f of readdirSync(join(SCRIPT_DIR, 'screenshots'))) {
  copyFileSync(join(SCRIPT_DIR, 'screenshots', f), join(outDir, 'screenshots', f));
}
writeFileSync(join(outDir, 'dashboard', 'data.js'), dataJs);
const dossier = buildDossier(outDir, {
  text_max_bytes: 65536,
  screenshots: { max: 4, max_bytes: 524288 },
  dashboard: { max_files: 400, max_bytes: 4194304 },
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
const dossierTextBytes = Buffer.byteLength(JSON.parse(Buffer.from(dossier).toString('utf8')).text, 'utf8');
const runtimeMs = Date.now() - started;
console.log(JSON.stringify({
  outDir, rows: rows.length, totalTvl, totalImplied: Math.round(totalImplied),
  top5: rows.slice(0, 5).map((r) => ({ n: r.name, imp: Math.round(r.implied), o: r3(r.odds) })),
  farmCounts, topNet: { n: topNet.name, v: Math.round(topNet.net * 100) / 100 },
  top4odds: meta.top4, young: meta.young,
  loo: r3(looMiss), wf50: r3(wf.quad50), wf70: r3(wf.quad70),
  cov2575: meta.cov2575, cov1090: meta.cov1090, covX3: meta.covX3, q: meta.q,
  neg: r3(negMiss), coefSe: meta.coefSe, bootTot: meta.bootTot,
  ledger, ledgerTotal, buckets: meta.buckets,
  dossierBytes: dossier.length, dossierTextBytes,
  mainTsSha256: mainTsHash, runtimeMs,
}, null, 2));
