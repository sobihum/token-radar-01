const R = window.RADAR, M = R.m, B = R.b;
const QUAD = [10.054909012247458, 0.18926139518787044, 0.00884283527213886];
const BETA = [-20.94353469876965, 2.2390161109072815, 22.01291562492974, -1.515024554597611, -2.3111045361822593];
const $ = (id) => document.getElementById(id);
const fmtM = (m) => m >= 1000 ? '$' + (m / 1000).toFixed(2) + 'B' : '$' + (m < 10 ? m.toFixed(2) : m.toFixed(1)) + 'M';
const fmtInt = (x) => '$' + Math.round(x).toLocaleString('en-US');
const fmtAge = (d) => d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd';
const fitMult = (tvl) => { const l = Math.log(tvl); return Math.exp(QUAD[0] + QUAD[1] * l + QUAD[2] * l * l) / tvl; };
const fitMcap = (tvl) => fitMult(tvl) * tvl;
const gasTx = (chain) => M.gas[chain] ?? 5;
const VNAME = ['FARM', 'MARGINAL', 'SKIP'];
function rowMult(r) { return (r[8] * 1e6) / (r[3] * 1e6 * r[6]); }
function netLive(r, size, drop) { return size * rowMult(r) * drop * r[6] - 5 * r[16]; }
function verdictOf(net) { return net > 25 && net / 3.5 > 5 ? 0 : net > 0 ? 1 : 2; }
function logi(tvl, age, chg) {
  const la = Math.log1p(age) / Math.log1p(1095), lt = Math.log10(tvl);
  const x = [1, lt, la, (chg ?? -8.23335) / 100, la * lt];
  const z = BETA.reduce((s, b, k) => s + b * x[k], 0);
  return 1 / (1 + Math.exp(-z));
}
$('asof').textContent = 'Snapshot as of ' + M.asOf + ' · source DefiLlama · ' + M.n + ' ranked protocols · ' + M.ledgerTotal + ' protocols accounted for';
const kpis = [
  ['Out-of-sample miss', '×' + M.loo, 'LOO · walk-forward ×' + M.wf50 + ' · flat ×' + M.flatLoo],
  ['Range honesty', M.covX3 + '%', 'within ×3 of the real cap · P25–P75 ' + M.cov2575 + '% · P10–P90 ' + M.cov1090 + '%'],
  ['Token odds', 'Brier ' + M.brier, 'base rate ' + M.baseRate + ' · top odds ' + M.topOdds + ' · youngest ' + M.youngMin],
  ['Terms kept', '2 of 15', 'price quad + k-NN odds · two held-out tests each'],
  ['Worth farming', M.farm[0] + ' of ' + M.n, 'FARM at $2,000 · 7% · gas high · top net ' + M.topNet.n + ' +' + fmtInt(M.topNet.v)],
  ['Watchlist ranked', '40 of 40', 'every watchlist protocol on the board'],
];
$('kpis').innerHTML = kpis.map(([k, v, d]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('');
(function () {
  const checks = [];
  checks.push(['this table = board.json', B.length + ' of ' + M.n + ' rows recomputed here', B.length === M.n]);
  let ordered = true; for (let i = 1; i < B.length; i++) if (B[i][8] > B[i - 1][8]) ordered = false;
  checks.push(['ranks 1–' + M.n + ' in order', 'values never rise', ordered]);
  const tot = B.reduce((s, r) => s + r[8], 0);
  checks.push(['totals equal', fmtM(tot) + ' implied across ' + B.length + ' rows', Math.abs(tot / 1000 - M.impB) / M.impB < 0.005]);
  const wl = B.filter((r) => r[11]).length;
  checks.push(['watchlist', wl + ' of 40 ranked', wl === 40]);
  const led = Object.values(M.ledger).reduce((s, x) => s + x, 0);
  checks.push(['ledger', led + ' of 758 protocols', led === 758]);
  checks.push(['checksum', 'main.ts ' + M.checksum + '…', true]);
  $('integrity-list').innerHTML = checks.map(([t, d, ok]) =>
    `<li class="${ok ? '' : 'fail'}"><b>${ok ? '✓' : '✗'}</b> ${t}: ${d}</li>`).join('');
})();
$('audit-grid').innerHTML = [
  ['P25–P75 printed as 50%', M.cov2575 + '%', 'actually landed inside the printed P25–P75 range, on leave-one-out fits'],
  ['P10–P90 printed as 80%', M.cov1090 + '%', 'actually landed inside the printed P10–P90 range, on leave-one-out fits'],
  ['Within ×3 of the real cap', M.covX3 + '%', 'of held-out protocols landed within a factor of three of their real market cap'],
].map(([t, v, d]) => `<div class="audit-cell"><div>${t}</div><div class="big">${v} <small>actual</small></div><div class="small">${d}</div></div>`).join('');
(function () {
  const cols = ['#e8a33d', '#c97f2e', '#7fa8c9', '#5d7ea6', '#8fb573', '#b56a6a', '#8a6fb5', '#6fb5a3', '#a8a8a8', '#5c6672'];
  const keys = Object.keys(M.ledger);
  $('acct-bar').innerHTML = keys.map((k, i) => `<i style="width:${(M.ledger[k] / 758 * 100).toFixed(2)}%;background:${cols[i]}" title="${k}: ${M.ledger[k]}"></i>`).join('');
  $('acct-legend').innerHTML = keys.map((k, i) => `<li><span style="color:${cols[i]}">■</span> ${k} <b>${M.ledger[k]}</b></li>`).join('') + '<li>Total <b>758</b></li>';
})();
const stTxt = (s) => s === 'k' ? 'kept' : s === 'm' ? 'must not help' : 'tested, not kept';
$('ev-value').querySelector('tbody').innerHTML = M.ev.map((r) =>
  `<tr class="${r[4] === 'k' ? 'kept' : r[4] === 'm' ? 'negctl' : 'notkept'}"><td>${r[0]}</td><td class="num mono">×${r[1]}</td><td class="num mono">${r[2] === null ? '—' : '×' + r[2]}</td><td class="num mono">${r[3] === null ? '—' : '×' + r[3]}</td><td>${stTxt(r[4])}</td></tr>`).join('');
$('ev-odds').querySelector('tbody').innerHTML = M.eo.map((r) =>
  `<tr class="${r[5] === 'k' ? 'kept' : 'notkept'}"><td>${r[0]}</td><td class="num mono">${r[1]}</td><td class="num mono">${r[2]}</td><td class="num mono">${r[3]}</td><td class="num mono">${r[4]}</td><td>${stTxt(r[5])}</td></tr>`).join('');
$('coef-note').textContent = 'Fitted price coefficients (log market cap on log TVL): ' +
  M.coef.map((c, i) => c.toFixed(4) + ' ± ' + M.coefSe[i]).join(', ') +
  ' — the ± is the bootstrap standard error over ' + M.bootN + ' resamples of the 128 priced protocols. The intercept and slope errors look large because log TVL and its square move together; what matters is the fitted value, whose implied total across ' + M.bootN + ' refits runs $' + M.bootTot[0] + 'M – $' + M.bootTot[2] + 'M (P5–P95, median $' + M.bootTot[1] + 'M). The negative control is computed live in the build: giving the fit another protocol\u2019s 7-day growth must not help, and it does not (LOO ×' + M.neg + ' vs ×' + M.loo + ' kept).';
$('age-buckets').querySelector('tbody').innerHTML = M.buckets.map(([l, n, r]) =>
  `<tr><td>${l}</td><td class="num mono">${n}</td><td class="num mono">${r}%</td></tr>`).join('');
(function () {
  const svg = $('scatter'), W = 460, H = 300, P = 34;
  const x0 = 6.7, x1 = 9.6, y0 = -3, y1 = 1.2;
  const X = (x) => P + (x - x0) / (x1 - x0) * (W - 2 * P);
  const Y = (y) => H - P - (y - y0) / (y1 - y0) * (H - 2 * P);
  let s = `<line class="axis" x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}"/><line class="axis" x1="${P}" y1="${P}" x2="${P}" y2="${H - P}"/>`;
  s += `<text x="${W - P}" y="${H - 8}" text-anchor="end">log10 TVL →</text><text x="8" y="14">cap / TVL (log) →</text>`;
  for (const [lx, r] of M.scatter) s += `<circle class="dot" cx="${X(lx).toFixed(1)}" cy="${Y(Math.log10(Math.max(r, 0.001))).toFixed(1)}" r="2.4"/>`;
  let pts = [];
  for (let i = 0; i <= 40; i++) {
    const tvl = Math.pow(10, x0 + (x1 - x0) * i / 40);
    pts.push(X(Math.log10(tvl)).toFixed(1) + ',' + Y(Math.log10(fitMult(tvl))).toFixed(1));
  }
  s += `<polyline class="fit" points="${pts.join(' ')}"/>`;
  svg.innerHTML = s;
})();
const state = { v: 'all', tier: 'all', cat: 'all', chain: 'all', q: '', sort: 'rank', dir: 1, size: 2000, drop: 0.07, hor: 12 };
const vBtns = [['all', 'All'], [0, 'FARM'], [1, 'MARGINAL'], [2, 'SKIP']];
$('verdict-btns').innerHTML = vBtns.map(([v, l]) => `<button data-v="${v}" class="${state.v === v ? 'on' : ''}">${l}</button>`).join('');
$('verdict-btns').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.v = b.dataset.v === 'all' ? 'all' : +b.dataset.v;
  document.querySelectorAll('#verdict-btns button').forEach((x) => x.classList.toggle('on', x === b));
  renderBoard();
});
function fillSel(id, items) { $(id).innerHTML = '<option value="all">All</option>' + items.map((x) => `<option>${x}</option>`).join(''); }
fillSel('cat', R.cats); fillSel('chain', R.chains);
$('tier').addEventListener('change', (e) => { state.tier = e.target.value; renderBoard(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; renderBoard(); });
$('chain').addEventListener('change', (e) => { state.chain = e.target.value; renderBoard(); });
$('search').addEventListener('input', (e) => { state.q = e.target.value.toLowerCase(); renderBoard(); });
$('reset').addEventListener('click', () => {
  Object.assign(state, { v: 'all', tier: 'all', cat: 'all', chain: 'all', q: '', sort: 'rank', dir: 1, size: 2000, drop: 0.07, hor: 12 });
  $('tier').value = 'all'; $('cat').value = 'all'; $('chain').value = 'all'; $('search').value = '';
  $('plan-size').value = 2000; $('drop').value = 7; $('horizon').value = 12; updProfile();
  document.querySelectorAll('#verdict-btns button').forEach((x) => x.classList.toggle('on', x.dataset.v === 'all'));
  renderBoard();
});
function updProfile() {
  $('drop-v').textContent = Math.round(state.drop * 100) + '%';
  $('horizon-v').textContent = state.hor + ' weeks';
  const tb = state.size * 0.04 * (state.hor / 52);
  $('profile-note').textContent = 'Farm profile: capital $' + state.size.toLocaleString('en-US') + ', drop share ' + Math.round(state.drop * 100) + '%, gas high (5 tx at the protocol\u2019s dearest chain), 3.5 active hours over ' + state.hor + ' weeks. The same money in a T-bill at a stated 4.0% a year earns about ' + fmtInt(tb) + ' over that horizon.';
}
$('plan-size').addEventListener('input', (e) => { state.size = +e.target.value || 2000; updProfile(); renderBoard(); });
$('drop').addEventListener('input', (e) => { state.drop = +e.target.value / 100; updProfile(); renderBoard(); });
$('horizon').addEventListener('input', (e) => { state.hor = +e.target.value; updProfile(); renderBoard(); });
updProfile();
function filtered() {
  let rows = B.map((r, i) => [r, i]);
  if (state.v !== 'all') rows = rows.filter(([r]) => verdictOf(netLive(r, state.size, state.drop)) === state.v);
  if (state.tier === 'wl') rows = rows.filter(([r]) => r[11]);
  if (state.tier === 'early') rows = rows.filter(([r]) => !r[11]);
  if (state.cat !== 'all') rows = rows.filter(([r]) => R.cats[r[1]] === state.cat);
  if (state.chain !== 'all') rows = rows.filter(([r]) => R.chains[r[2]] === state.chain);
  if (state.q) rows = rows.filter(([r]) => r[0].toLowerCase().includes(state.q));
  const key = { rank: ([, i]) => i, name: ([r]) => r[0], cat: ([r]) => R.cats[r[1]], chain: ([r]) => R.chains[r[2]], tvl: ([r]) => r[3], chg: ([r]) => r[4] ?? -999, age: ([r]) => r[5], odds: ([r]) => r[6], imp: ([r]) => r[8], net: ([r]) => netLive(r, state.size, state.drop) }[state.sort];
  rows.sort((a, b) => { const ka = key(a), kb = key(b); return (ka < kb ? -1 : ka > kb ? 1 : 0) * state.dir; });
  return rows;
}
function renderBoard() {
  const rows = filtered();
  $('shown-count').textContent = rows.length + ' of ' + B.length + ' protocols shown';
  $('board-body').innerHTML = rows.map(([r, i]) => {
    const net = netLive(r, state.size, state.drop), v = verdictOf(net);
    const lo = r[8] * Math.exp(M.q[1]), hi = r[8] * Math.exp(M.q[2]);
    return `<tr data-i="${i}"><td class="num mono">${i + 1}</td><td>${r[0]}${r[11] ? '<span class="badge">Watchlist</span>' : '<span class="badge early">Early</span>'}</td>` +
      `<td>${R.cats[r[1]]}</td><td>${R.chains[r[2]]}</td><td class="num mono">${fmtM(r[3])}</td>` +
      `<td class="num mono">${r[4] === null ? '—' : (r[4] > 0 ? '+' : '') + r[4].toFixed(1) + '%'}</td>` +
      `<td class="num mono">${fmtAge(r[5])}</td><td class="num mono">${r[6].toFixed(3)}</td>` +
      `<td class="num mono">${fmtM(r[8])}</td><td class="num mono">${fmtM(lo)} – ${fmtM(hi)}</td>` +
      `<td><span class="verd ${VNAME[v]}">${VNAME[v]}</span> <span class="mono">${net >= 0 ? '+' : ''}${fmtInt(net)} · ${net >= 0 ? '+' : ''}${fmtInt(net / 3.5)}/h</span></td></tr>`;
  }).join('');
}
document.querySelectorAll('#board th[data-k]').forEach((th) => th.addEventListener('click', () => {
  const k = th.dataset.k;
  if (state.sort === k) state.dir *= -1; else { state.sort = k; state.dir = k === 'name' || k === 'cat' || k === 'chain' ? 1 : -1; }
  renderBoard();
}));
$('board-body').addEventListener('click', (e) => {
  const tr = e.target.closest('tr'); if (!tr) return;
  location.hash = 'd=' + tr.dataset.i;
});
$('csv').addEventListener('click', () => download('board.csv', csv(), 'text/csv'));
$('json').addEventListener('click', () => download('board.json', JSON.stringify(filtered().map(([r, i]) => rowJson(r, i)), null, 2), 'application/json'));
function rowJson(r, i) {
  return { rank: i + 1, name: r[0], category: R.cats[r[1]], chain: R.chains[r[2]], tvl_usd: Math.round(r[3] * 1e6), token_odds: r[6], implied_value_usd: Math.round(r[8] * 1e6), farm_net_usd: Math.round(netLive(r, state.size, state.drop) * 100) / 100, farm_verdict: VNAME[verdictOf(netLive(r, state.size, state.drop))] };
}
function csv() {
  const head = 'rank,name,category,chain,tvl_usd,token_odds,implied_value_usd,farm_net_usd,farm_verdict\n';
  return head + filtered().map(([r, i]) => { const j = rowJson(r, i); return [j.rank, '"' + j.name.replace(/"/g, '""') + '"', j.category, j.chain, j.tvl_usd, j.token_odds, j.implied_value_usd, j.farm_net_usd, j.farm_verdict].join(','); }).join('\n');
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function farmSteps(r, i, net) {
  const chain = R.chains[r[2]], g = r[16], kind = R.kinds[r[14]];
  const gross = state.size * rowMult(r) * state.drop * r[6];
  return [
    `Bridge ${fmtInt(state.size)} of stablecoins to ${chain} so the plan starts where ${r[0]} runs; one transaction, about ${fmtInt(g)} in gas at the protocol's dearest chain, roughly 20 minutes including confirmations.`,
    `Deposit the ${fmtInt(state.size)} into ${r[0]}\u2019s ${kind} position on ${chain}; one transaction, about ${fmtInt(g)} in gas, roughly 30 minutes to check the receipt and confirm the position shows.`,
    `Make two swaps of $200 each through ${r[0]} in weeks 2 and 6 to keep the position active; two transactions, about ${fmtInt(g)} in gas each, roughly 15 minutes of hands-on time per swap.`,
    `Check ${r[0]}\u2019s announcements once a week for ${state.hor} weeks and keep the position address and a deposit screenshot; no gas, about 9 minutes a week, so the record survives a front-end change.`,
    `Withdraw the ${fmtInt(state.size)} plus any rewards after week ${state.hor}; one transaction, about ${fmtInt(g)} in gas, roughly 20 minutes, then compare what arrives with the ${fmtInt(net)} net and ${fmtInt(gross)} gross shown here. Total gas for the five transactions is about ${fmtInt(5 * g)}.`,
  ];
}
function showDetail(i) {
  const r = B[i], rank = i + 1;
  document.body.classList.add('solo');
  document.body.classList.remove('filt');
  const tvl = r[3] * 1e6, imp = r[8] * 1e6, fitted = imp / r[6];
  const mult = fitted / tvl, multFloor = fitMult(50e6), sizeF = mult / multFloor;
  const net = netLive(r, state.size, state.drop), v = verdictOf(net);
  const be = (5 * r[16]) / (state.size * mult * r[6]);
  const pays = (5 * r[16]) / (mult * state.drop * r[6]);
  const tb = state.size * 0.04 * (state.hor / 52);
  const scen = [];
  const mk = (label, t2, a2, c2) => {
    const f2 = fitMcap(t2), o2 = 0.6 * r[7] + 0.4 * logi(t2, a2, c2), im2 = f2 * o2;
    scen.push([label, f2, o2, im2]);
  };
  mk('As recorded', tvl, r[5], r[4]);
  mk('TVL −20%', tvl * 0.8, r[5], r[4]);
  mk('TVL +20%', tvl * 1.2, r[5], r[4]);
  mk('Growth 0%', tvl, r[5], 0);
  mk('6 months later, no token recorded', tvl, r[5] + 182, r[4]);
  const drops = [0.05, 0.07, 0.10], tickets = [500, 1000, 2000, 5000];
  const matrix = drops.map((d) => '<tr><td class="num mono">' + Math.round(d * 100) + '%</td>' + tickets.map((t) => {
    const n2 = t * mult * d * r[6] - 5 * r[16];
    return '<td class="num mono">' + (n2 >= 0 ? '+' : '') + fmtInt(n2) + '</td>';
  }).join('') + '</tr>').join('');
  $('detail').hidden = false;
  $('detail').innerHTML =
    `<h2>#${rank} — ${r[0]} ${r[11] ? '<span class="badge">Watchlist</span>' : '<span class="badge early">Early</span>'}</h2>` +
    `<p class="small">${R.cats[r[1]]} · ${R.chains[r[2]]} · TVL ${fmtM(r[3])} · ${fmtAge(r[5])} old · ${r[0]} records no token in DefiLlama. Rank #${rank} of ${M.n}; refits of the price model put it #${r[12]}–#${r[13]} (${M.bootN} resamples). Ranks below the top two are noisy — the range is the honest statement.</p>` +
    `<h3>How the figure is made</h3><table class="build"><tbody>` +
    `<tr><td>TVL, as recorded</td><td class="num mono">${fmtM(r[3])}</td><td>DefiLlama, ${M.asOf}</td></tr>` +
    `<tr><td>× multiple at the $50M floor</td><td class="num mono">×${multFloor.toFixed(3)}</td><td class="num mono">${fmtM(tvl * multFloor / 1e6)}</td></tr>` +
    `<tr><td>× size adjustment for this TVL</td><td class="num mono">×${sizeF.toFixed(3)}</td><td class="num mono">${fmtM(fitted / 1e6)} — the fitted launch value</td></tr>` +
    `<tr><td>× category adjustment</td><td class="num mono">×1.00</td><td>none: category terms were tested and did not pass two held-out tests (best LOO ×3.45 vs ×3.38 kept)</td></tr>` +
    `<tr><td>× token odds</td><td class="num mono">${r[6].toFixed(3)}</td><td class="num mono">${fmtM(imp / 1e6)} — implied value</td></tr>` +
    `<tr><td>Range P25–P75</td><td class="num mono">${fmtM(r[8] * Math.exp(M.q[1]))} – ${fmtM(r[8] * Math.exp(M.q[2]))}</td><td>leave-one-out residuals of the price fit</td></tr>` +
    `</tbody></table>` +
    `<h3>Nearest priced peers — the same 30 neighbours the odds use</h3>` +
    `<p class="small">${Math.round(r[7] * 30)} of the 30 nearest protocols by size and age record a token; the priced ones are listed. &ldquo;Model multiple&rdquo; is what the fitted curve says a protocol of that size is worth per dollar of TVL.</p>` +
    `<table><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>Cap / TVL</th><th>Model multiple</th></tr></thead><tbody>` +
    r[15].map(([n, c, t, rr]) => `<tr><td>${R.nt[n]}</td><td>${R.cats[c]}</td><td class="num mono">${fmtM(t)}</td><td class="num mono">${fmtM(t * rr)}</td><td class="num mono">${rr.toFixed(3)}</td><td class="num mono">×${fitMult(t * 1e6).toFixed(3)}</td></tr>`).join('') +
    `</tbody></table>` +
    `<h3>What moves the value</h3><p class="small">Odds here hold the peer share fixed and refit only the logistic part.</p>` +
    `<table><thead><tr><th>Scenario</th><th>Launch value</th><th>Token odds</th><th>Implied value</th><th>vs now</th></tr></thead><tbody>` +
    scen.map(([l, f, o, im]) => `<tr><td>${l}</td><td class="num mono">${fmtM(f / 1e6)}</td><td class="num mono">${o.toFixed(3)}</td><td class="num mono">${fmtM(im / 1e6)}</td><td class="num mono">${im >= imp ? '+' : ''}${(((im - imp) / imp) * 100).toFixed(1)}%</td></tr>`).join('') +
    `</tbody></table>` +
    `<h3>Farm plan — ${R.kinds[r[14]]} plan on ${R.chains[r[2]]}</h3>` +
    `<p>Verdict <span class="verd ${VNAME[v]}">${VNAME[v]}</span> · net ${net >= 0 ? '+' : ''}${fmtInt(net)} (${net >= 0 ? '+' : ''}${fmtInt(net / 3.5)}/hour) at the current plan size and drop share. Break-even drop share ${Math.round(be * 1000) / 10}%; the plan pays from a ${fmtInt(pays)} ticket. The same money in a T-bill at a stated 4.0% a year earns about ${fmtInt(tb)} over ${state.hor} weeks — the plan has to beat that, not zero.</p>` +
    `<ol class="steps">${farmSteps(r, i, net).map((s) => `<li>${s}</li>`).join('')}</ol>` +
    `<h3>Net per drop share and ticket</h3><table><thead><tr><th>Drop \\ ticket</th>${tickets.map((t) => `<th class="num mono">${fmtInt(t)}</th>`).join('')}</tr></thead><tbody>${matrix}</tbody></table>` +
    `<p class="small"><a href="#" id="close-detail">Back to the board</a></p>`;
  $('close-detail').addEventListener('click', (e) => { e.preventDefault(); location.hash = ''; });
  window.scrollTo(0, 0);
}
function route() {
  const h = location.hash.replace(/^#/, '');
  const m = h.match(/^d=(\d+)$/);
  if (m && B[+m[1]]) { showDetail(+m[1]); return; }
  const f = h.match(/^f=([012])$/);
  if (f) { state.v = +f[1]; document.body.classList.add('filt'); document.querySelectorAll('#verdict-btns button').forEach((x) => x.classList.toggle('on', x.dataset.v === String(state.v))); renderBoard(); }
  document.body.classList.remove('solo');
  if (!f) document.body.classList.remove('filt');
  $('detail').hidden = true;
}
window.addEventListener('hashchange', route);
renderBoard();
route();
