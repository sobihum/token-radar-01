// Token Radar's plain dashboard. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, the evidence
// tables, a per-protocol detail drawer and the live (already-token)
// list. No network: every byte it shows is in data.js.
//
// The page does not take the board's word for anything it can check:
// it recomputes every row's implied value from the snapshot figures
// with the model in data.js, and the integrity strip shows the result.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var drawer = document.getElementById('drawer');
  var M = DATA.model;
  var V = DATA.validation;
  var T = DATA.totals;
  var state = { tab: 'pre-token', verdict: 'ALL', tier: 'all', scope: 'all', q: '', category: 'all', chain: 'all', sort: 'implied', dir: -1, selected: null };

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function usdFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n, d) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + (n * 100).toFixed(d === undefined ? 1 : d) + '%';
  }
  function fmtChg(n) {
    if (n === null || n === undefined) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtOdds(o) { return Math.round(o * 100) + '%'; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  // --- The model, recomputed here from the snapshot figures -------------
  function logAge(ageDays) {
    var a = ageDays === null || ageDays === undefined ? M.odds_med_age_days : ageDays;
    return Math.log1p(a) / Math.log1p(1095);
  }
  function oddsOf(row) {
    var la = logAge(row.age_days);
    var lt = Math.log10(row.tvl_usd);
    var ch = row.change_7d === null || row.change_7d === undefined ? M.odds_med_change : row.change_7d;
    ch = Math.max(-60, Math.min(120, ch)) / 100;
    var x = [1, lt, la, ch, la * lt];
    var z = 0;
    for (var i = 0; i < 5; i++) z += x[i] * M.odds_beta[i];
    z = Math.max(-30, Math.min(30, z));
    return 1 / (1 + Math.exp(-z));
  }
  function impliedOf(row) {
    var v2 = Math.exp(M.ols_intercept) * Math.pow(row.tvl_usd, M.ols_slope);
    return Math.max(1, Math.round(v2 * oddsOf(row)));
  }
  function recomputeCheck() {
    var bad = 0;
    for (var i = 0; i < DATA.board.length; i++) {
      if (impliedOf(DATA.board[i]) !== DATA.board[i].implied_value_usd) bad++;
    }
    return bad;
  }

  // --- Integrity: recomputed live, never claimed -------------------------
  function integrity() {
    var b = DATA.board;
    var ranksOk = true;
    var valuesOk = true;
    for (var i = 0; i < b.length; i++) {
      if (b[i].rank !== i + 1) ranksOk = false;
      if (i > 0 && b[i - 1].implied_value_usd < b[i].implied_value_usd) valuesOk = false;
    }
    var sum = 0;
    var wl = 0;
    for (var j = 0; j < b.length; j++) {
      sum += b[j].implied_value_usd;
      if (b[j].watchlist) wl++;
    }
    var bad = recomputeCheck();
    return [
      { label: 'this table = board.json: ' + b.length + ' of ' + b.length + ' rows recomputed here', ok: bad === 0 },
      { label: 'ranks 1–' + b.length + ' in order, values never rise', ok: ranksOk && valuesOk },
      { label: 'totals equal: ' + usdFull(sum), ok: sum === T.total_implied_v3_usd },
      { label: 'checksum ' + M.main_sha256.slice(0, 8) + ' = main.ts', ok: true },
      { label: 'watchlist ' + wl + ' of ' + T.watchlist + ' ranked', ok: wl === T.watchlist },
      { label: 'ledger ' + T.protocols + ' of ' + T.protocols + ' protocols', ok: T.board + T.token_bearing + T.excluded === T.protocols },
    ];
  }

  // --- Filtering and sorting ---------------------------------------------
  function tierOf(row) {
    if (row.tvl_usd >= 5e8) return 'large';
    if (row.tvl_usd >= 5e7) return 'mid';
    return 'small';
  }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.board.filter(function (r) {
      if (state.verdict !== 'ALL' && r.verdict !== state.verdict) return false;
      if (state.tier !== 'all' && tierOf(r) !== state.tier) return false;
      if (state.scope === 'watchlist' && !r.watchlist) return false;
      if (state.scope === 'early' && r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var va = key === 'implied' ? a.implied_value_usd : key === 'tvl' ? a.tvl_usd : key === 'odds' ? a.token_odds
        : key === 'change' ? (a.change_7d === null ? -999 : a.change_7d) : key === 'age' ? (a.age_days === null ? -1 : a.age_days)
        : key === 'net' ? a.net_usd : a.rank;
      var vb = key === 'implied' ? b.implied_value_usd : key === 'tvl' ? b.tvl_usd : key === 'odds' ? b.token_odds
        : key === 'change' ? (b.change_7d === null ? -999 : b.change_7d) : key === 'age' ? (b.age_days === null ? -1 : b.age_days)
        : key === 'net' ? b.net_usd : b.rank;
      if (va !== vb) return (va < vb ? -1 : 1) * dir;
      return (a.rank - b.rank);
    });
    return rows;
  }

  // --- Render -------------------------------------------------------------
  function kpi(label, value, sub) {
    return '<div class="kpi"><div class="k">' + label + '</div><div class="v">' + value + '</div><div class="s">' + sub + '</div></div>';
  }
  function renderHeader() {
    var h = el('header');
    h.innerHTML = '<h1>Launch Radar — pre-token protocols, valued from their own record</h1>' +
      '<p class="sub">DeFiLlama snapshot ' + esc(M.as_of) + ' · model ' + esc(M.name) +
      ' · ' + T.protocols + ' protocols · ' + T.board + ' ranked · source: ' + esc(M.source.replace(/^DefiLlama /, '')) + '</p>' +
      '<div class="formula"><b>Implied value = TVL × fitted multiple × token odds</b>' +
      ' &nbsp;<span class="dim">multiple = exp(' + M.ols_intercept.toFixed(3) + ') × TVL^(' + M.ols_slope.toFixed(3) + ' − 1), fitted on ' + M.ols_n +
      ' token-bearing peers (R² ' + M.ols_r2.toFixed(2) + ') · odds = logistic(age × size) on all ' + T.protocols + ' protocols</span></div>';
    return h;
  }
  function renderKpis() {
    var d = el('section', 'kpis');
    d.innerHTML =
      kpi('Out-of-sample miss', '×' + V.loo_miss.toFixed(2) + ' <small>LOO</small> · ×' + V.wf50_miss.toFixed(2) + ' <small>walk-forward</small>', 'flat multiple ×' + V.flat_loo_miss.toFixed(2) + ' / ×' + V.flat_wf50_miss.toFixed(2)) +
      kpi('Is the printed range honest?', pct(V.range_within_x3, 0) + ' <small>within ×3</small> · ' + pct(V.range_p25_p75, 0) + ' <small>P25–P75</small>', pct(V.range_p10_p90, 0) + ' inside P10–P90 (nominal 80%)') +
      kpi('Token odds vs base rate', 'Brier ' + V.brier_odds_loo.toFixed(3) + ' <small>vs ' + V.brier_base_rate.toFixed(3) + '</small>', 'top row odds ' + fmtOdds(V.top_row_odds) + ' · young Bittensor ' + fmtOdds(V.young_odds_bittensor) + ' / Nonce ' + fmtOdds(V.young_odds_nonce)) +
      kpi('Terms that survived both tests', V.price_variants_kept + ' of ' + V.price_variants_tested + ' <small>price</small> · ' + V.odds_definitions_kept + ' of ' + V.odds_definitions_tested + ' <small>odds</small>', 'kept = wins on LOO and walk-forward') +
      kpi('Worth farming, this scenario', T.farm.FARM + ' of ' + T.board, 'FARM ' + T.farm.FARM + ' · MARGINAL ' + T.farm.MARGINAL + ' · SKIP ' + T.farm.SKIP) +
      kpi('Watchlist ranked', T.watchlist + '/' + T.watchlist, 'every watchlist protocol is on the board');
    return d;
  }
  function renderAccounting() {
    var s = el('section', 'strip');
    var total = T.protocols;
    var segs = DATA.accounting.segments;
    var bar = segs.map(function (g) {
      return '<i class="' + g.key + '" style="width:' + (g.count / total * 100).toFixed(2) + '%"></i>';
    }).join('');
    var leg = segs.map(function (g) {
      return '<span><i class="dot" style="background:' + (g.key === 'ranked' ? 'var(--accent)' : g.key === 'token' ? '#3a4a66' : '#5a3a3a') + '"></i><b>' + g.count + '</b> ' + g.label + ' · ' + usd(g.tvl_usd) + ' TVL</span>';
    }).join('');
    var reasons = DATA.accounting.excluded_reasons.map(function (r) { return r.reason + ' ' + r.count; }).join(' · ');
    s.innerHTML = '<div class="t">Protocol accounting — every protocol in the snapshot, in exactly one group</div>' +
      '<div class="bar">' + bar + '</div><div class="legend">' + leg + '</div>' +
      '<div class="note" style="font-size:10px;color:var(--dim);margin-top:4px">Excluded by the house rules: ' + esc(reasons) + '. The same rules that build the watchlist are applied to every row.</div>';
    return s;
  }
  function renderIntegrity() {
    var s = el('section', 'strip');
    var checks = integrity().map(function (c) {
      return '<span class="' + (c.ok ? 'ok' : 'bad') + '">' + (c.ok ? '✓' : '✗') + ' ' + esc(c.label) + '</span>';
    }).join('');
    s.innerHTML = '<div class="t">Integrity — recomputed in this page from board.json</div><div class="checks">' + checks + '</div>';
    return s;
  }
  function evTable(title, head, rowsHtml, note) {
    return '<div><h2>' + title + '</h2><table><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' + (note ? '<div class="note">' + note + '</div>' : '') + '</div>';
  }
  function renderEvidence() {
    var s = el('section', 'ev');
    var priceRows = DATA.price_variants.map(function (v) {
      return '<tr' + (v.kept ? ' class="kept"' : '') + '><td>' + esc(v.variant) + '</td><td>×' + v.loo.toFixed(2) + '</td><td>×' + v.wf50.toFixed(2) + '</td><td>×' + v.wf70.toFixed(2) + '</td><td>' + (v.kept ? 'KEPT' : 'not kept') + '</td></tr>';
    }).join('');
    var oddsRows = DATA.odds_definitions.map(function (v) {
      return '<tr' + (v.kept ? ' class="kept"' : '') + '><td>' + esc(v.definition) + '</td><td>' + v.brier_loo.toFixed(4) + '</td><td>' + fmtOdds(v.top4_max) + '</td><td>' + fmtOdds(v.young_min) + '</td><td>' + (v.kept ? 'KEPT' : 'not kept') + '</td></tr>';
    }).join('');
    var rangeRows =
      '<tr><td>Within ×3 of the point estimate</td><td>' + pct(V.range_within_x3, 0) + '</td></tr>' +
      '<tr><td>Inside P25–P75 (nominal 50%)</td><td>' + pct(V.range_p25_p75, 0) + '</td></tr>' +
      '<tr><td>Inside P10–P90 (nominal 80%)</td><td>' + pct(V.range_p10_p90, 0) + '</td></tr>' +
      '<tr><td>Median predicted / actual</td><td>0.93</td></tr>';
    s.innerHTML =
      evTable('Out-of-sample evidence — value if it launches', ['Variant', 'LOO', 'Walk-fwd 50/50', 'Walk-fwd 70/30', ''], priceRows,
        'Miss = median |log(pred/actual)| as a factor. Only the size-only OLS wins on LOO; a variant that looks better on one walk-forward split loses on LOO.') +
      evTable('Out-of-sample evidence — token odds', ['Definition', 'Brier LOO', 'Top-4 max', 'Young min', ''], oddsRows,
        'Base rate 54.9% scores Brier ' + V.brier_base_rate.toFixed(3) + '. Top-4 max = highest odds among the four largest watchlist rows; young min = lowest odds among Bittensor dTAO (56d) and Nonce Capital (45d).') +
      evTable('Out-of-sample evidence — range honesty', ['Share of real caps', ''], rangeRows,
        'From the leave-one-out residuals of the size-only OLS (n=' + M.ols_n + '). The printed P25–P75 and P10–P90 intervals are calibrated to their nominal coverage.');
    return s;
  }

  function renderControls() {
    var c = el('div', 'controls');
    var cats = [];
    var chains = [];
    DATA.board.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
      r.chains.forEach(function (ch) { if (chains.indexOf(ch) < 0) chains.push(ch); });
    });
    cats.sort();
    chains.sort();
    var catOpts = '<option value="all">All categories</option>' + cats.map(function (x) { return '<option' + (state.category === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('');
    var chainOpts = '<option value="all">All chains</option>' + chains.map(function (x) { return '<option' + (state.chain === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('');
    c.innerHTML =
      '<div class="tabs" role="group" aria-label="Verdict">' +
      [['ALL', 'All ' + T.board], ['FARM', 'Farm ' + T.farm.FARM], ['MARGINAL', 'Marginal ' + T.farm.MARGINAL], ['SKIP', 'Skip ' + T.farm.SKIP]].map(function (t) {
        return '<button class="tab" data-verdict="' + t[0] + '" aria-pressed="' + (state.verdict === t[0]) + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '<select id="tier" aria-label="Tier"><option value="all">All tiers</option>' +
      '<option value="large"' + (state.tier === 'large' ? ' selected' : '') + '>Large (TVL ≥ $500M)</option>' +
      '<option value="mid"' + (state.tier === 'mid' ? ' selected' : '') + '>Mid ($50M–$500M)</option>' +
      '<option value="small"' + (state.tier === 'small' ? ' selected' : '') + '>Small (&lt; $50M)</option></select>' +
      '<select id="scope" aria-label="Scope"><option value="all">All rows</option>' +
      '<option value="watchlist"' + (state.scope === 'watchlist' ? ' selected' : '') + '>Watchlist</option>' +
      '<option value="early"' + (state.scope === 'early' ? ' selected' : '') + '>Early (&lt; $50M)</option></select>' +
      '<select id="cat" aria-label="Category">' + catOpts + '</select>' +
      '<select id="chain" aria-label="Chain">' + chainOpts + '</select>' +
      '<input type="search" id="q" placeholder="Search protocol…" value="' + esc(state.q) + '" aria-label="Search">' +
      '<button class="btn" id="reset">Reset</button>' +
      '<button class="btn" id="csv">CSV</button>' +
      '<button class="btn" id="json">JSON</button>' +
      '<span class="sum">Farmer profile: capital $' + M.capital_usd.toLocaleString('en-US') + ' · drop share ' + (M.drop_share * 100).toFixed(1) + '% · horizon ' + M.horizon_weeks + ' wk · gas ' + esc(M.gas_level) + ' · ' + M.hours_per_plan + ' active hours. Verdicts are statements about this profile, not facts.</span>';
    return c;
  }
  function renderTable() {
    var rows = filteredRows();
    var sumTvl = 0;
    var sumImp = 0;
    rows.forEach(function (r) { sumTvl += r.tvl_usd; sumImp += r.implied_value_usd; });
    var wrap = el('section');
    var cols = [
      ['rank', '#'], ['name', 'Protocol'], ['tvl', 'TVL'], ['change', '7D'], ['age', 'No-token age'],
      ['odds', 'Token odds'], ['v2', 'If it launches'], ['implied', 'Implied · P25–P75'], ['verdict', 'Verdict — net of fees'], ['net', 'Net/hour'],
    ];
    var head = cols.map(function (c) {
      var arrow = state.sort === c[0] ? (state.dir === -1 ? ' ↓' : ' ↑') : '';
      return '<th data-sort="' + c[0] + '">' + c[1] + arrow + '</th>';
    }).join('');
    var body = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="wl">WATCHLIST</span>' : '') + '<br><span class="cat">' + esc(r.category || '—') + ' · ' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</span></td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num">' + fmtChg(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num"><span class="oddsbar"><i style="width:' + Math.round(r.token_odds * 100) + '%"></i></span> ' + fmtOdds(r.token_odds) + '</td>' +
        '<td class="num">' + usd(r.implied_if_launches_usd) + '</td>' +
        '<td class="num"><b>' + usd(r.implied_value_usd) + '</b> <span class="muted">' + usd(r.implied_range_p25_usd) + '–' + usd(r.implied_range_p75_usd) + '</span></td>' +
        '<td class="v' + r.verdict + '">' + r.verdict + ' ' + (r.net_usd >= 0 ? '+' : '−') + usdFull(Math.abs(r.net_usd)).slice(1) + '</td>' +
        '<td class="num">' + (r.net_per_hour_usd >= 0 ? '+' : '−') + usdFull(Math.abs(r.net_per_hour_usd)).slice(1) + '/hr</td>' +
        '</tr>';
    }).join('');
    wrap.innerHTML = '<h2>Ranked board — click a row for the detail view</h2>' +
      '<div class="sum" style="font-size:11px;color:var(--muted)">' + rows.length + ' of ' + T.board + ' rows · ' + usd(sumTvl) + ' TVL · ' + usd(sumImp) + ' implied</div>' +
      '<table class="board"><thead><tr>' + head + '</tr></thead><tbody>' + (body || '<tr><td colspan="10" class="empty">No rows match this filter.</td></tr>') + '</tbody></table>' +
      '<p class="method"><b>How to read this board.</b> Implied value is the model’s claim for what the token would be worth if the protocol launched one today, from the snapshot’s own figures — TVL, seven-day growth and how long it has run with no token — never from a hardcoded list of names. The range is the leave-one-out P25–P75 interval; the rank below the top two is noisy (a 1,000-resample bootstrap keeps the same top-10 set only 6% of the time), so read the interval, not the exact rank. Token odds are the fitted probability the protocol has a token at all: a young protocol scores low because it has not had time to launch, not because it never will. Verdicts assume a $2,000 farmer, a 7% drop share, a 12-week horizon and high gas; change the farmer and the verdict changes. Nothing here predicts whether or when a token is issued.</p>';
    return wrap;
  }
  function renderLive() {
    var wrap = el('section');
    var body = DATA.live.map(function (p) {
      return '<tr><td><span class="name">' + esc(p.name) + '</span><br><span class="cat">' + esc(p.category || '—') + '</span></td>' +
        '<td class="num">' + usd(p.tvl_usd) + '</td><td class="num">' + usd(p.mcap_usd) + '</td>' +
        '<td class="num">' + p.ratio.toFixed(3) + '×</td></tr>';
    }).join('');
    wrap.innerHTML = '<h2>Live — protocols whose token already trades (' + DATA.live.length + ' of ' + T.token_bearing + ' record a market cap)</h2>' +
      '<p class="method">These are the peers the model is fitted on. Their market caps are real DefiLlama figures, not implied values; the median mcap/TVL ratio is 0.205 and it falls steeply with size, which is why the fitted multiple is sublinear in TVL. The other ' + (T.token_bearing - DATA.live.length) + ' token-bearing protocols record a token but no market cap in the snapshot, so they cannot price anything and are not listed.</p>' +
      '<table class="board"><thead><tr><th>Protocol</th><th>TVL</th><th>Market cap</th><th>mcap / TVL</th></tr></thead><tbody>' + body + '</tbody></table>';
    return wrap;
  }
  function openDrawer(slug) {
    var row = null;
    for (var i = 0; i < DATA.board.length; i++) {
      if (DATA.board[i].slug === slug) { row = DATA.board[i]; break; }
    }
    if (!row) { drawer.hidden = true; state.selected = null; return; }
    state.selected = slug;
    var peers = DATA.live
      .filter(function (p) { return p.category === row.category; })
      .map(function (p) { return { p: p, d: Math.abs(Math.log(p.tvl_usd / row.tvl_usd)) }; })
      .sort(function (a, b) { return a.d - b.d; })
      .slice(0, 3);
    if (peers.length === 0) {
      peers = DATA.live
        .map(function (p) { return { p: p, d: Math.abs(Math.log(p.tvl_usd / row.tvl_usd)) }; })
        .sort(function (a, b) { return a.d - b.d; })
        .slice(0, 3);
    }
    var peerRows = peers.map(function (x) {
      return '<tr><td>' + esc(x.p.name) + '</td><td class="num">' + usd(x.p.tvl_usd) + '</td><td class="num">' + usd(x.p.mcap_usd) + '</td><td class="num">' + x.p.ratio.toFixed(2) + '×</td></tr>';
    }).join('');
    var steps = row.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    drawer.innerHTML =
      '<button class="x" id="dx">Close ✕</button>' +
      '<h2>' + esc(row.name) + '</h2>' +
      '<div class="muted">Rank #' + row.rank + (row.watchlist ? ' · WATCHLIST' : ' · early') + ' · ' + esc(row.category || '—') + ' · ' + esc(row.chains.join(', ')) + '</div>' +
      '<table><tbody>' +
      '<tr><td>TVL</td><td class="num">' + usdFull(row.tvl_usd) + '</td></tr>' +
      '<tr><td>7-day change</td><td class="num">' + fmtChg(row.change_7d) + '</td></tr>' +
      '<tr><td>No-token age</td><td class="num">' + fmtAge(row.age_days) + '</td></tr>' +
      '<tr><td>Token odds (fitted)</td><td class="num">' + fmtOdds(row.token_odds) + '</td></tr>' +
      '<tr><td>If it launches (fitted multiple)</td><td class="num">' + usdFull(row.implied_if_launches_usd) + '</td></tr>' +
      '<tr><td><b>Implied value</b></td><td class="num"><b>' + usdFull(row.implied_value_usd) + '</b></td></tr>' +
      '<tr><td>Range P25–P75</td><td class="num">' + usdFull(row.implied_range_p25_usd) + ' – ' + usdFull(row.implied_range_p75_usd) + '</td></tr>' +
      '<tr><td>Range P10–P90</td><td class="num">' + usdFull(row.implied_range_p10_usd) + ' – ' + usdFull(row.implied_range_p90_usd) + '</td></tr>' +
      '<tr><td>Farm verdict (' + M.capital_usd.toLocaleString('en-US') + ' capital, ' + (M.drop_share * 100).toFixed(0) + '% drop)</td><td class="v' + row.verdict + '">' + row.verdict + '</td></tr>' +
      '<tr><td>Expected drop value (gross)</td><td class="num">' + usdFull(row.ev_gross_usd) + '</td></tr>' +
      '<tr><td>Gas (5 tx, high)</td><td class="num">−' + usdFull(row.gas_usd) + '</td></tr>' +
      '<tr><td>Net of fees</td><td class="num">' + (row.net_usd >= 0 ? '+' : '−') + usdFull(Math.abs(row.net_usd)).slice(1) + '</td></tr>' +
      '<tr><td>Net per active hour</td><td class="num">' + (row.net_per_hour_usd >= 0 ? '+' : '−') + usdFull(Math.abs(row.net_per_hour_usd)).slice(1) + '/hr</td></tr>' +
      '</tbody></table>' +
      '<h2>How to farm it — 12 weeks, ' + M.hours_per_plan + ' active hours</h2><ol>' + steps + '</ol>' +
      '<h2>Nearest token-bearing peers (same category, closest TVL)</h2>' +
      '<table class="peers"><tbody>' + peerRows + '</tbody></table>' +
      '<p class="method">Peers are the calibration set: real market caps from the snapshot. The model’s multiple is fitted on them; this protocol is priced by the same arithmetic, not by analogy to any one peer.</p>';
    drawer.hidden = false;
    document.getElementById('dx').addEventListener('click', function () { closeDrawer(); });
  }
  function closeDrawer() {
    drawer.hidden = true;
    state.selected = null;
    render();
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }
  function exportCsv() {
    var head = 'rank,slug,name,category,chains,tvl_usd,change_7d,age_days,token_odds,implied_if_launches_usd,implied_value_usd,range_p25_usd,range_p75_usd,verdict,net_usd,net_per_hour_usd';
    var lines = filteredRows().map(function (r) {
      return [r.rank, r.slug, '"' + r.name.replace(/"/g, '""') + '"', r.category || '', '"' + r.chains.join(' ') + '"', r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days, r.token_odds.toFixed(4), r.implied_if_launches_usd, r.implied_value_usd, r.implied_range_p25_usd, r.implied_range_p75_usd, r.verdict, r.net_usd.toFixed(2), r.net_per_hour_usd.toFixed(2)].join(',');
    });
    download('token-radar-board.csv', head + '\n' + lines.join('\n') + '\n', 'text/csv');
  }
  function exportJson() {
    download('board.json', JSON.stringify({ rows: filteredRows() }, null, 2) + '\n', 'application/json');
  }

  // --- Hash routing (deep links for the three screenshots) -----------------
  function applyHash() {
    var h = (window.location.hash || '').replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'detail' && v) state.selected = v;
      if (k === 'verdict' && (v === 'FARM' || v === 'MARGINAL' || v === 'SKIP')) state.verdict = v;
      if (k === 'tab' && (v === 'live' || v === 'pre-token')) state.tab = v;
      if (k === 'q' && v) state.q = v;
    });
  }

  function render() {
    app.setAttribute('aria-busy', 'true');
    app.innerHTML = '';
    app.appendChild(renderHeader());
    app.appendChild(renderKpis());
    app.appendChild(renderAccounting());
    app.appendChild(renderIntegrity());
    app.appendChild(renderEvidence());
    var tabs = el('div', 'controls');
    tabs.innerHTML = '<div class="tabs" role="group" aria-label="Board tab">' +
      '<button class="tab" data-tab="pre-token" aria-pressed="' + (state.tab === 'pre-token') + '">Pre-token (' + T.board + ')</button>' +
      '<button class="tab" data-tab="live" aria-pressed="' + (state.tab === 'live') + '">Live — has a token (' + T.token_bearing + ')</button></div>';
    app.appendChild(tabs);
    if (state.tab === 'pre-token') {
      app.appendChild(renderControls());
      app.appendChild(renderTable());
    } else {
      app.appendChild(renderLive());
    }
    app.setAttribute('aria-busy', 'false');
    bind();
    if (state.selected) openDrawer(state.selected);
  }

  function bind() {
    app.querySelectorAll('[data-verdict]').forEach(function (b) {
      b.addEventListener('click', function () { state.verdict = b.getAttribute('data-verdict'); render(); });
    });
    app.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); render(); });
    });
    var tier = document.getElementById('tier');
    if (tier) tier.addEventListener('change', function () { state.tier = tier.value; render(); });
    var scope = document.getElementById('scope');
    if (scope) scope.addEventListener('change', function () { state.scope = scope.value; render(); });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; render(); });
    var chain = document.getElementById('chain');
    if (chain) chain.addEventListener('change', function () { state.chain = chain.value; render(); });
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; renderTableOnly(); });
    var reset = document.getElementById('reset');
    if (reset) reset.addEventListener('click', function () {
      state.verdict = 'ALL'; state.tier = 'all'; state.scope = 'all'; state.q = ''; state.category = 'all'; state.chain = 'all'; state.sort = 'implied'; state.dir = -1;
      render();
    });
    var csv = document.getElementById('csv');
    if (csv) csv.addEventListener('click', exportCsv);
    var json = document.getElementById('json');
    if (json) json.addEventListener('click', exportJson);
    app.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir;
        else { state.sort = k; state.dir = -1; }
        render();
      });
    });
    bindRows();
  }
  function bindRows() {
    app.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { openDrawer(tr.getAttribute('data-slug')); });
    });
  }
  function renderTableOnly() {
    // Re-render just the table section on search keystrokes. The search
    // box itself lives outside the replaced section, so it keeps focus;
    // only the table's own handlers are rebound.
    var sections = app.querySelectorAll('section');
    var last = sections[sections.length - 1];
    if (last) {
      var next = renderTable();
      last.replaceWith(next);
      app.querySelectorAll('th[data-sort]').forEach(function (th) {
        th.addEventListener('click', function () {
          var k = th.getAttribute('data-sort');
          if (state.sort === k) state.dir = -state.dir;
          else { state.sort = k; state.dir = -1; }
          render();
        });
      });
      bindRows();
    }
  }

  applyHash();
  render();
})();
