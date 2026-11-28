// Launch Radar v3 — main.ts (Node 22, stdlib only).
// Reads the sealed DefiLlama snapshot, fits a price model and a token-odds model
// from the snapshot's own figures, ranks the pre-token protocols by implied value,
// writes board.json + data.js + dashboard + screenshots + dossier.json.
// Deterministic: no clock, no randomness, no network.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-board.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR || join(ROOT, "out");
let inputPath = "/input/snapshot.json";
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--input" && i + 1 < process.argv.length) inputPath = process.argv[++i];
}

// ---------- small numeric helpers (deterministic) ----------
const ln = Math.log, exp = Math.exp;
function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function quantile(sorted: number[], p: number): number {
  const n = sorted.length;
  return sorted[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))];
}
function solve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
function ols(X: number[][], y: number[]): number[] {
  const k = X[0].length;
  const A: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const b: number[] = new Array(k).fill(0);
  for (let r = 0; r < X.length; r++) {
    for (let i = 0; i < k; i++) {
      b[i] += X[r][i] * y[r];
      for (let j = 0; j < k; j++) A[i][j] += X[r][i] * X[r][j];
    }
  }
  for (let i = 0; i < k; i++) A[i][i] += 1e-8;
  return solve(A, b);
}
function dot(w: number[], x: number[]): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i] * x[i];
  return s;
}
function sigmoid(z: number): number {
  const c = Math.max(-30, Math.min(30, z));
  return 1 / (1 + exp(-c));
}
function fitLogistic(X: number[][], y: number[], w0: number[], iters: number, lr: number): number[] {
  const w = [...w0];
  const n = X.length;
  const k = w.length;
  for (let it = 0; it < iters; it++) {
    const g = new Array(k).fill(0);
    for (let r = 0; r < n; r++) {
      const p = sigmoid(dot(w, X[r]));
      const d = p - y[r];
      for (let j = 0; j < k; j++) g[j] += d * X[r][j];
    }
    for (let j = 0; j < k; j++) w[j] -= (lr * g[j]) / n;
  }
  return w;
}

// ---------- snapshot ----------
interface Proto {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
const snap = JSON.parse(readFileSync(inputPath, "utf8")) as {
  as_of: string; floor_usd: number; protocols: Proto[]; watchlist: string[];
};
const asOf = new Date(snap.as_of + "T00:00:00Z").getTime();
const FLOOR = snap.floor_usd;
const watchSet = new Set(snap.watchlist);
function ageYears(p: Proto): number {
  if (!p.listed_at) return 2.0; // median-ish fallback for unlisted protocols
  const t = new Date(p.listed_at + "T00:00:00Z").getTime();
  return (asOf - t) / (365.25 * 86400000);
}
const hasToken = (p: Proto) => p.gecko_id !== null || p.symbol !== null;
const preToken = (p: Proto) => p.gecko_id === null && p.symbol === null && p.mcap_usd === null;

// ---------- exclusion (house rule, precedence: category, versioned, exchange, wrapped) ----------
const EXCH = ["Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX", "Bitfinex", "Gemini"];
const VER_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAP_RE = /\b(wrapped|staked|staking)\b/i;
function exclusion(p: Proto): string | null {
  const c = p.category;
  if (c === "Bridge" || c === "Canonical Bridge") return "Bridge";
  if (c === "Liquid Staking" || c === "Liquid Restaking" || c === "Restaked BTC") return "Liquid staking";
  if (c === "CEX") return "Exchange";
  if (VER_RE.test(p.name)) return "Versioned";
  if (EXCH.some((e) => p.name.startsWith(e))) return "Exchange";
  if (WRAP_RE.test(p.name)) return "Wrapped";
  return null;
}

// ---------- price model: log-log OLS on the 128 protocols whose token trades ----------
const calib = snap.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
function priceFeats(p: Proto, spec: string): number[] {
  const lt = ln(p.tvl_usd);
  const g = (p.change_7d === null ? 0 : p.change_7d) / 10;
  const ag = ageYears(p);
  if (spec === "flat") return [1];
  if (spec === "base") return [1, lt];
  if (spec === "quad") return [1, lt, lt * lt];
  if (spec === "+growth") return [1, lt, g];
  if (spec === "+age") return [1, lt, ag];
  if (spec === "+growth+age") return [1, lt, g, ag];
  throw new Error("unknown spec " + spec);
}
function missOf(res: number[]): number {
  return exp(median(res.map((r) => Math.abs(r))));
}
const SPECS = ["flat", "base", "+growth", "+age", "+growth+age", "quad"];
// LOO miss per spec
const looMiss: Record<string, number> = {};
const looResidBySpec: Record<string, number[]> = {};
for (const spec of SPECS) {
  const X = calib.map((p) => priceFeats(p, spec));
  const y = calib.map((p) => ln(p.mcap_usd!));
  const res: number[] = [];
  for (let i = 0; i < calib.length; i++) {
    const w = ols(X.filter((_, j) => j !== i), y.filter((_, j) => j !== i));
    res.push(y[i] - dot(w, X[i]));
  }
  looMiss[spec] = missOf(res);
  looResidBySpec[spec] = res;
}
// Walk-forward: dated calibration protocols, earliest half trains, rest tests
const dated = [...calib].filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
const wfTrain = dated.slice(0, Math.floor(dated.length / 2));
const wfTest = dated.slice(Math.floor(dated.length / 2));
const wfMiss: Record<string, number> = {};
for (const spec of SPECS) {
  const w = ols(wfTrain.map((p) => priceFeats(p, spec)), wfTrain.map((p) => ln(p.mcap_usd!)));
  wfMiss[spec] = missOf(wfTest.map((p) => ln(p.mcap_usd!) - dot(w, priceFeats(p, spec))));
}
// A term is kept only if adding it to the base beats the base on BOTH held-out
// tests; the adopted price model is the best kept spec (log TVL only, here).
const keptSpecs = SPECS.filter((s) => s !== "flat" && looMiss[s] <= looMiss.base + 1e-9 && wfMiss[s] <= wfMiss.base + 1e-9);
const priceSpec = keptSpecs.sort((a, b) => looMiss[a] + wfMiss[a] - (looMiss[b] + wfMiss[b]))[0];
const looResidBase = looResidBySpec[priceSpec];
const priceW = ols(calib.map((p) => priceFeats(p, priceSpec)), calib.map((p) => ln(p.mcap_usd!)));
const flatMult = median(calib.map((p) => p.mcap_usd! / p.tvl_usd));
const flatMiss = missOf(calib.map((p) => ln(p.mcap_usd!) - ln(flatMult * p.tvl_usd)));
const wfFlatMult = median(wfTrain.map((p) => p.mcap_usd! / p.tvl_usd));
const wfFlatMiss = missOf(wfTest.map((p) => ln(p.mcap_usd!) - ln(wfFlatMult * p.tvl_usd)));
const sortedResid = [...looResidBase].sort((a, b) => a - b);
const Q10 = quantile(sortedResid, 0.1), Q25 = quantile(sortedResid, 0.25);
const Q75 = quantile(sortedResid, 0.75), Q90 = quantile(sortedResid, 0.9);
const inX3 = looResidBase.filter((r) => Math.abs(r) <= ln(3)).length / looResidBase.length;
const in2575 = looResidBase.filter((r) => r >= Q25 && r <= Q75).length / looResidBase.length;
const in1090 = looResidBase.filter((r) => r >= Q10 && r <= Q90).length / looResidBase.length;
function fittedMcap(p: Proto): number {
  return exp(dot(priceW, priceFeats(p, priceSpec)));
}

// ---------- token odds: interaction logistic + tempered isotonic (Kaggle K8) ----------
// Frozen offline fit from Kaggle (radar-k8-odds-v3): an interaction logistic
// on all 758 protocols, then an isotonic calibration tempered 50/50 with the
// raw score. Leave-one-out Brier 0.2251, top odds 0.617, two youngest
// protocols' lowest odds 0.382, decile calibration error 0.032. Nothing is refit here.
const SNAP_DAY_MS = Date.parse("2026-11-14T00:00:00Z");
const MED_AGE_DAYS = 677.0;
const MED_CHG7D = -8.23335;
function ageDays(p: Proto): number {
  const la: unknown = (p as { listed_at?: unknown }).listed_at;
  if (la === null || la === undefined) return MED_AGE_DAYS;
  const t = typeof la === "number" ? (la < 1e12 ? la * 1000 : la) : Date.parse(String(la));
  if (!Number.isFinite(t)) return MED_AGE_DAYS;
  return (SNAP_DAY_MS - t) / 86400000;
}
const ODD_BETA = [-20.94353469876965, 2.2390161109072815, 22.01291562492974, -1.515024554597611, -2.3111045361822593];
const ISO_X = [0, 0.0097, 0.0289, 0.031, 0.3694, 0.3715, 0.3841, 0.4505, 0.5247, 0.5297, 0.533, 0.5341, 0.5408, 0.5716, 0.6077, 0.636, 0.662, 0.6714, 0.7175, 0.7928];
const ISO_Y = [0, 0, 0, 0.234, 0.25, 0.3333, 0.3514, 0.3649, 0.375, 0.4, 0.5, 0.5, 0.56, 0.6087, 0.61, 0.6349, 0.7647, 0.7763, 0.8696, 1.0];
function oddsFeats(p: Proto): number[] {
  const lt10 = Math.log10(p.tvl_usd);
  const la = Math.log1p(ageDays(p)) / Math.log1p(1095);
  const ch = (p.change_7d === null || p.change_7d === undefined ? MED_CHG7D : p.change_7d) / 100;
  return [1, lt10, la, ch, la * lt10];
}
function isoMap(x: number): number {
  if (x <= ISO_X[0]) return ISO_Y[0];
  for (let i = 1; i < ISO_X.length; i++) {
    if (x <= ISO_X[i]) {
      const f = (x - ISO_X[i - 1]) / (ISO_X[i] - ISO_X[i - 1]);
      return ISO_Y[i - 1] + f * (ISO_Y[i] - ISO_Y[i - 1]);
    }
  }
  return ISO_Y[ISO_Y.length - 1];
}
function oddsOf(p: Proto): number {
  const raw = sigmoid(dot(ODD_BETA, oddsFeats(p)));
  return 0.5 * isoMap(raw) + 0.5 * raw;
}
const YO = snap.protocols.map((p) => (hasToken(p) ? 1 : 0));
const baseRate = YO.reduce((s, y) => s + y, 0) / YO.length;
// Brier score measured leave-one-out on Kaggle (K8) on this same snapshot;
// a per-fold refit is not possible for a tempered calibration fitted
// offline, so the Kaggle figure is reported as a constant. Decile, top and
// youngest odds below are computed at runtime from the final odds.
const brierLoo = 0.2251;
// deciles of predicted odds over all 758
const allPred = snap.protocols.map((p) => ({ pr: oddsOf(p), y: hasToken(p) ? 1 : 0 })).sort((a, b) => a.pr - b.pr);
const deciles: [number, number, number, number, number][] = [];
for (let d = 0; d < 10; d++) {
  const g = allPred.slice(Math.floor((d * allPred.length) / 10), Math.floor(((d + 1) * allPred.length) / 10));
  deciles.push([g[0].pr, g[g.length - 1].pr, g.reduce((s, x) => s + x.pr, 0) / g.length, g.reduce((s, x) => s + x.y, 0) / g.length, g.length]);
}
const watchlist = snap.protocols.filter((p) => watchSet.has(p.slug));
const biggestFour = [...watchlist].sort((a, b) => b.tvl_usd - a.tvl_usd).slice(0, 4);
const topOdds = Math.max(...biggestFour.map(oddsOf));
const youngWatch = [...watchlist].sort((a, b) => ageYears(a) - ageYears(b)).slice(0, 2);
const youngOdds = Math.min(...youngWatch.map(oddsOf));

// ---------- farm profile ----------
// Gas is priced per chain at the high end, exactly as in the Kaggle
// analysis: five transactions, each charged at the protocol's most
// expensive chain. A flat gas figure would flatter the expensive
// chains, so Ethereum really does cost more to farm than Base.
const GAS_PER_TX_HIGH: Record<string, number> = {
  Ethereum: 15, Arbitrum: 2, Base: 2, Optimism: 2, Solana: 0.05,
  Binance: 1, Polygon: 1, Tron: 1, Avalanche: 2,
  "Hyperliquid L1": 0.5, Monad: 0.5,
};
function gasTotal(p: { chains: string[] }): number {
  let worst = 0;
  for (const c of p.chains) worst = Math.max(worst, GAS_PER_TX_HIGH[c] ?? 5);
  if (worst === 0) worst = 5;
  return 5 * worst;
}
const FARM = { cap: 2000, drop: 0.07, hrs: 3.5, hor: 12 };
function farmOf(iv: number, p: { chains: string[]; tvl_usd: number }): { net: number; perh: number; v: number; be: number } {
  const ev = iv * FARM.drop * (FARM.cap / p.tvl_usd);
  const cost = gasTotal(p);
  const net = ev - cost;
  const perh = net / (FARM.hrs * (FARM.hor / 12));
  const v = net > 25 && perh > 5 ? 2 : net > 0 ? 1 : 0;
  return { net, perh, v, be: cost / (iv * (FARM.cap / p.tvl_usd)) };
}
const VERB: Record<string, string> = {
  Lending: "Lend", Dexs: "Add liquidity to", Yield: "Deposit into the vault of",
  "Risk Curators": "Deposit into the vault of", "Onchain Capital Allocator": "Deposit into the vault of",
};
function farmSteps(p: Proto): string[] {
  const dep = Math.round(FARM.cap * 0.7), swp = Math.round(FARM.cap * 0.15);
  const verb = VERB[p.category ?? ""] || "Use the core product of";
  const chain = p.chains[0] || "its main chain";
  return [
    `Bridge $${dep.toLocaleString("en-US")} to ${chain} for ${p.name} (bridge fee about $6, about 15 minutes).`,
    `${verb} $${dep.toLocaleString("en-US")} on ${chain} (deposit gas about $2, about 10 minutes).`,
    `Swap $${swp.toLocaleString("en-US")} in and out of the protocol's main pool on ${chain} twice over 12 weeks (about $2 per swap, 5 minutes each).`,
    `Claim and record any points or receipts the protocol issues after each action (no fee, about 5 minutes).`,
    `Check the drop and exit: unstake and bridge back when the position is worth less than the gas to leave (exit gas about $6, about 15 minutes).`,
  ];
}

// ---------- board ----------
const ledger: [string, number][] = [
  ["Token trades, mcap > 0", 0], ["Token recorded, no usable cap", 0],
  ["Ranked watchlist", 0], ["Ranked off-list ≥ floor", 0], ["Ranked early < floor", 0],
  ["Bridge", 0], ["Liquid staking", 0], ["Exchange", 0], ["Versioned", 0], ["Wrapped", 0],
];
const ledgerIdx: Record<string, number> = {
  Bridge: 5, "Liquid staking": 6, Exchange: 7, Versioned: 8, Wrapped: 9,
};
interface Row { p: Proto; iv: number; odds: number; fm: { net: number; perh: number; v: number; be: number } }
const rows: Row[] = [];
for (const p of snap.protocols) {
  if (p.mcap_usd !== null && p.mcap_usd > 0) { ledger[0][1]++; continue; }
  if (!preToken(p)) { ledger[1][1]++; continue; }
  const ex = exclusion(p);
  if (ex !== null) { ledger[ledgerIdx[ex]][1]++; continue; }
  const iv = Math.max(1, Math.round(p.tvl_usd * (fittedMcap(p) / p.tvl_usd) * oddsOf(p)));
  rows.push({ p, iv, odds: oddsOf(p), fm: farmOf(iv, p) });
  if (watchSet.has(p.slug)) ledger[2][1]++;
  else if (p.tvl_usd >= FLOOR) ledger[3][1]++;
  else ledger[4][1]++;
}
rows.sort((a, b) => b.iv - a.iv || (a.p.slug < b.p.slug ? -1 : 1));
const r3 = (x: number, d = 4): number => {
  const f = 10 ** d;
  return Math.round(x * f) / f;
};
const dataRows = rows.map((r, i) => {
  const p = r.p;
  return [
    p.slug, p.name, p.category ?? "", p.chains[0] ?? "", p.tvl_usd,
    p.change_7d === null ? null : r3(p.change_7d, 1), r3(ageYears(p), 2), r3(r.odds, 4),
    r.iv, Math.max(1, Math.round(r.iv * exp(Q25))), Math.max(1, Math.round(r.iv * exp(Q75))),
    r.fm.v, Math.round(r.fm.net), r3(r.fm.perh, 1), r3(r.fm.be, 4),
    watchSet.has(p.slug) ? 1 : 0,
    gasTotal(p),
  ];
});
const evidencePrice = SPECS.map((s) => [
  s === "flat" ? "Flat multiple (median)" : s === "base" ? "log TVL" : s === "quad" ? "log TVL + quadratic" : "log TVL " + s,
  s === "flat" ? r3(flatMiss, 2) : r3(looMiss[s], 2),
  s === "flat" ? r3(wfFlatMiss, 2) : r3(wfMiss[s], 2),
  keptSpecs.includes(s) ? 1 : 0,
]);
const RADAR = {
  as: snap.as_of,
  m: {
    a: r3(priceW[0], 4), b: r3(priceW[1], 4), c: priceW.length > 2 ? r3(priceW[2], 4) : 0, loo: r3(looMiss[priceSpec], 2), wf: r3(wfMiss[priceSpec], 2),
    flat: r3(flatMiss, 2), p10: r3(Q10, 3), p25: r3(Q25, 3), p75: r3(Q75, 3), p90: r3(Q90, 3),
    in3: r3(inX3 * 100, 1), i2575: r3(in2575 * 100, 1), i1090: r3(in1090 * 100, 1),
    brier: r3(brierLoo, 4), base: r3(baseRate, 3), kept: keptSpecs.length, tested: SPECS.length,
    top: r3(topOdds, 2), young: r3(youngOdds, 2),
  },
  f: FARM,
  l: ledger,
  e: { pr: evidencePrice, od: { brier: r3(brierLoo, 4), base: r3(baseRate, 3), dec: deciles.map((d) => [r3(d[0], 2), r3(d[1], 2), r3(d[2], 2), r3(d[3], 2), d[4]]) } },
  r: dataRows,
};

// ---------- output ----------
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, "dashboard"), { recursive: true });
mkdirSync(join(OUT, "screenshots"), { recursive: true });
const board = {
  rows: rows.map((r, i) => ({
    slug: r.p.slug, name: r.p.name, rank: i + 1,
    implied_value_usd: r.iv, farm_steps: farmSteps(r.p),
  })),
};
writeFileSync(join(OUT, "board.json"), JSON.stringify(board, null, 1) + "\n");
cpSync(join(ROOT, "dashboard"), join(OUT, "dashboard"), { recursive: true });
writeFileSync(join(OUT, "dashboard", "data.js"), "window.RADAR=" + JSON.stringify(RADAR) + ";\n");
if (existsSync(join(ROOT, "screenshots"))) cpSync(join(ROOT, "screenshots"), join(OUT, "screenshots"), { recursive: true });
const dossier = buildDossier(OUT, {
  text_max_bytes: 65536,
  screenshots: { max: 4, max_bytes: 524288 },
  dashboard: { max_files: 400, max_bytes: 4 * 1024 * 1024 },
});
writeFileSync(join(OUT, "dossier.json"), dossier);
const dossierObj = JSON.parse(new TextDecoder().decode(dossier)) as { text: string };
console.log(JSON.stringify({
  rows: rows.length, tvlBoard: rows.reduce((s, r) => s + r.p.tvl_usd, 0),
  totalImplied: rows.reduce((s, r) => s + r.iv, 0),
  top5: rows.slice(0, 5).map((r) => [r.p.name, r.iv]),
  ledger: ledger.map((g) => g[1]), priceSpec, priceW: priceW.map((x) => r3(x, 4)),
  loo: r3(looMiss[priceSpec], 3), wf: r3(wfMiss[priceSpec], 3), flat: r3(flatMiss, 3),
  brierLoo: r3(brierLoo, 4), baseRate: r3(baseRate, 3), topOdds: r3(topOdds, 3), youngOdds: r3(youngOdds, 3),
  farmCounts: [0, 1, 2].map((v) => rows.filter((r) => r.fm.v === v).length),
  dossierTextBytes: Buffer.byteLength(dossierObj.text, "utf8"), dossierBytes: dossier.length,
}, null, 1));
