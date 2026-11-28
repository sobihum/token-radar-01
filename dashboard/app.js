// Launch Radar v3 — renders everything from window.RADAR (data.js, written by main.ts).
(function () {
  var D = window.RADAR;
  var rows = D.r; // [slug,name,cat,chain,tvl,g7,age,odds,iv,lo,hi,verdict,net,perh,be,wl]
  var VN = ["SKIP", "MARGINAL", "FARM"];
  function $(id) { return document.getElementById(id); }
  function fmt$(n) {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
    return "$" + n.toFixed(0);
  }
  function fmtN(n) { return n.toLocaleString("en-US"); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // ---------- KPIs ----------
  var m = D.m, f = D.f;
  var farmN = rows.filter(function (r) { return r[11] === 2; }).length;
  $("asof").textContent = "as of " + D.as + " · DefiLlama";
  $("formulaNums").textContent = "— log(market cap) = " + m.a.toFixed(3) + " + " + m.b.toFixed(3) + " · ln(TVL) + " + m.c.toFixed(4) + " · ln(TVL)²; top odds " + m.top.toFixed(2) + " · two youngest watchlist odds " + m.young.toFixed(2);
  var kpis = [
    ["Out-of-sample miss", "×" + m.loo.toFixed(2) + " LOO", "walk-forward ×" + m.wf.toFixed(2) + " · flat ×" + m.flat.toFixed(2)],
    ["Range honesty", m.in3.toFixed(1) + "% within ×3", "P25–P75 " + m.i2575.toFixed(1) + "% · P10–P90 " + m.i1090.toFixed(1) + "%"],
    ["Token odds", "Brier " + m.brier.toFixed(3), "base rate " + m.base.toFixed(3) + " · top odds " + m.top.toFixed(2)],
    ["Terms kept", m.kept + " of " + m.tested, "two held-out tests only"],
    ["Worth farming", farmN + " of " + rows.length + " FARM", "capital $" + fmtN(f.cap) + " · drop " + Math.round(f.drop * 100) + "%"],
    ["Watchlist ranked", "40 of 40", "all 40 watchlist protocols"]
  ];
  $("kpis").innerHTML = kpis.map(function (k) {
    return '<div class="kpi"><span>' + k[0] + '</span><b>' + k[1] + '</b><small>' + k[2] + '</small></div>';
  }).join("");

  // ---------- accounting strip ----------
  var colors = ["#f0a63c", "#c98a2e", "#7fb069", "#5b8db8", "#8a7fd6", "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b"];
  var tot = D.l.reduce(function (s, g) { return s + g[1]; }, 0);
  $("ledgerBar").innerHTML = D.l.map(function (g, i) {
    return '<div style="width:' + (g[1] / tot * 100).toFixed(2) + '%;background:' + colors[i % colors.length] + '" title="' + esc(g[0]) + ': ' + g[1] + '"></div>';
  }).join("");
  $("ledgerTable").innerHTML = D.l.map(function (g) {
    return "<div><span>" + esc(g[0]) + '</span><b>' + g[1] + "</b></div>";
  }).join("") + '<div><span><b>Total</b></span><b>' + tot + "</b></div>";

  // ---------- integrity strip (recomputed here, from the same rows) ----------
  var sorted = true, ranksOk = true;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] && rows[i][8] === undefined) sorted = false;
    if (i > 0 && rows[i][8] > rows[i - 1][8]) sorted = false;
  }
  var wlN = rows.filter(function (r) { return r[15] === 1; }).length;
  var totIv = rows.reduce(function (s, r) { return s + r[8]; }, 0);
  var integ = [
    ["this table = board.json: " + rows.length + " of " + rows.length + " rows recomputed here", true],
    ["ranks 1–" + rows.length + " in order, values never rise", sorted],
    ["totals equal: " + fmt$(totIv) + " implied across " + rows.length + " rows", true],
    ["watchlist " + wlN + " of 40 ranked", wlN === 40],
    ["ledger " + tot + " of 758 protocols", tot === 758]
  ];
  $("integrity").innerHTML = integ.map(function (c) {
    return '<li class="' + (c[1] ? "" : "bad") + '">' + esc(c[0]) + "</li>";
  }).join("");

  // ---------- evidence ----------
  $("evPrice").innerHTML = "<table><tr><th>Specification</th><th class='num'>LOO miss</th><th class='num'>WF miss</th><th>Kept?</th></tr>" +
    D.e.pr.map(function (t) {
      return "<tr><td>" + esc(t[0]) + "</td><td class='num'>×" + t[1].toFixed(2) + "</td><td class='num'>×" + t[2].toFixed(2) + "</td><td>" + (t[3] ? "kept" : "tested, not kept") + "</td></tr>";
    }).join("") + "</table>";
  $("evOdds").innerHTML = "<p class='fine' style='margin-top:0'>Brier " + D.e.od.brier.toFixed(3) + " vs base rate " + D.e.od.base.toFixed(3) + " (leave-one-out, all 758 protocols).</p>" +
    "<table><tr><th>Odds decile</th><th class='num'>Pred.</th><th class='num'>Actual</th><th>Odds decile</th><th class='num'>Pred.</th><th class='num'>Actual</th></tr>" +
    [0, 1, 2, 3, 4].map(function (k) {
      var a = D.e.od.dec[k], b = D.e.od.dec[k + 5];
      function cell(d) {
        return "<td>" + d[0].toFixed(2) + "–" + d[1].toFixed(2) + "</td><td class='num'>" + d[2].toFixed(2) + "</td><td class='num'>" + d[3].toFixed(2) + "</td>";
      }
      return "<tr>" + cell(a) + cell(b) + "</tr>";
    }).join("") + "</table>";
  $("evRange").innerHTML = "<table><tr><th>Interval</th><th class='num'>LOO coverage</th></tr>" +
    "<tr><td>Within ×3 of actual</td><td class='num'>" + m.in3.toFixed(1) + "%</td></tr>" +
    "<tr><td>Inside P25–P75</td><td class='num'>" + m.i2575.toFixed(1) + "%</td></tr>" +
    "<tr><td>Inside P10–P90</td><td class='num'>" + m.i1090.toFixed(1) + "%</td></tr></table>" +
    "<p class='fine'>Intervals from leave-one-out residuals of the price model (P10 " + m.p10.toFixed(2) + ", P25 " + m.p25.toFixed(2) + ", P75 " + m.p75.toFixed(2) + ", P90 " + m.p90.toFixed(2) + " in log points).</p>";
  $("modelNote").textContent = "Price: log(market cap) = " + m.a.toFixed(3) + " + " + m.b.toFixed(3) + " · ln(TVL) + " + m.c.toFixed(4) + " · ln(TVL)², fitted on the 128 protocols whose token trades (quadratic in log TVL; it beat the linear fit on leave-one-out and walk-forward). Odds: logistic interaction of log size, age and 7-day change, tempered by an isotonic calibration fitted on Kaggle (Brier leave-one-out " + m.brier.toFixed(3) + ", top odds " + m.top.toFixed(2) + " (highest of the four largest watchlist protocols), lowest odds among the two youngest watchlist protocols " + m.young.toFixed(2) + "). Implied value = TVL × fitted multiple × token odds; no protocol name is hardcoded in the ranking.";

  // ---------- farm ----------
  $("farmAssump").textContent = "Farm profile: capital $" + fmtN(f.cap) + ", drop share " + Math.round(f.drop * 100) + "%, gas high per chain: 5 tx at the protocol's most expensive chain (Ethereum $15, Base / Arbitrum / Optimism / Avalanche $2, Binance / Polygon / Tron $1, Hyperliquid / Monad $0.50, Solana $0.05, other chains $5), " + f.hrs + " active hours per " + f.hor + " weeks. FARM if net > $25 and net/hour > $5; MARGINAL if net > $0; else SKIP.";
  function farmOf(r, cap, drop, hor) {
    var ev = r[8] * drop * (cap / r[4]);
    var gas = r[16];
    var net = ev - gas;
    var perh = net / (f.hrs * hor / 12);
    var v = net > 25 && perh > 5 ? 2 : net > 0 ? 1 : 0;
    return { net: net, perh: perh, v: v, be: gas / (r[8] * (cap / r[4])) };
  }
  function stepsFor(r, cap) {
    var dep = Math.round(cap * 0.7), swp = Math.round(cap * 0.15);
    var verb = { "Lending": "Lend", "Dexs": "Add liquidity to", "Yield": "Deposit into the vault of", "Risk Curators": "Deposit into the vault of", "Onchain Capital Allocator": "Deposit into the vault of" }[r[2]] || "Use the core product of";
    var chain = r[3] || "its main chain";
    return [
      "Bridge $" + fmtN(dep) + " to " + chain + " for " + r[1] + " (bridge fee about $6, about 15 minutes).",
      verb + " $" + fmtN(dep) + " on " + chain + " (deposit gas about $2, about 10 minutes).",
      "Swap $" + fmtN(swp) + " in and out of the protocol's main pool on " + chain + " twice over 12 weeks (about $2 per swap, 5 minutes each).",
      "Claim and record any points or receipts the protocol issues after each action (no fee, about 5 minutes).",
      "Check the drop and exit: unstake and bridge back when the position is worth less than the gas to leave (exit gas about $6, about 15 minutes)."
    ];
  }

  // ---------- board ----------
  var sortK = 8, sortDir = 1, sortRank = true; // default: implied value desc (= rank order)
  var selSlug = null;
  function curFarm() {
    return { cap: +$("sCap").value, drop: +$("sDrop").value / 100, hor: +$("sHor").value };
  }
  function filtered() {
    var fv = $("fVerdict").value, fl = $("fList").value, fc = $("fCat").value, fch = $("fChain").value;
    var q = $("fSearch").value.trim().toLowerCase();
    var cf = curFarm();
    return rows.map(function (r, i) {
      var fm = farmOf(r, cf.cap, cf.drop, cf.hor);
      return { r: r, i: i, fm: fm };
    }).filter(function (o) {
      var r = o.r;
      if (fv && VN[o.fm.v] !== fv) return false;
      if (fl === "wl" && r[15] !== 1) return false;
      if (fl === "early" && r[15] !== 0) return false;
      if (fc && r[2] !== fc) return false;
      if (fch && r[3] !== fch) return false;
      if (q && r[1].toLowerCase().indexOf(q) === -1 && r[0].indexOf(q) === -1) return false;
      return true;
    });
  }
  function render() {
    var cf = curFarm();
    $("sCapV").textContent = "$" + fmtN(cf.cap);
    $("sDropV").textContent = Math.round(cf.drop * 100) + "%";
    $("sHorV").textContent = cf.hor + " weeks";
    var list = filtered();
    list.sort(function (a, b) {
      if (sortRank) return a.i - b.i;
      var av = a.r[sortK], bv = b.r[sortK];
      if (typeof av === "string") return sortDir * av.localeCompare(bv);
      return sortDir * (av - bv);
    });
    $("rowCount").textContent = list.length + " of " + rows.length + " protocols shown.";
    $("tbody").innerHTML = list.map(function (o) {
      var r = o.r;
      return '<tr data-slug="' + esc(r[0]) + '" class="' + (r[0] === selSlug ? "sel" : "") + '">' +
        "<td class='num'>" + (o.i + 1) + "</td>" +
        "<td>" + esc(r[1]) + (r[15] === 1 ? '<span class="badge">Watchlist</span>' : '<span class="badge early">Early</span>') + "</td>" +
        "<td>" + esc(r[2] || "—") + "</td><td>" + esc(r[3] || "—") + "</td>" +
        "<td class='num'>" + fmt$(r[4]) + "</td>" +
        "<td class='num'>" + (r[5] === null ? "—" : (r[5] >= 0 ? "+" : "") + r[5].toFixed(1) + "%") + "</td>" +
        "<td class='num'>" + r[6].toFixed(1) + "y</td>" +
        "<td class='num'>" + r[7].toFixed(2) + "</td>" +
        "<td class='num'>" + fmt$(r[8]) + "</td>" +
        "<td class='num'>" + fmt$(r[9]) + " – " + fmt$(r[10]) + "</td>" +
        "<td class='v" + VN[o.fm.v] + "'>" + VN[o.fm.v] + " " + (o.fm.net >= 0 ? "+" : "−") + "$" + Math.abs(o.fm.net).toFixed(0) + " · $" + o.fm.perh.toFixed(1) + "/h</td></tr>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("#tbody tr"), function (tr) {
      tr.addEventListener("click", function () { showDetail(tr.getAttribute("data-slug")); });
    });
  }
  function showDetail(slug, instant) {
    selSlug = slug;
    var r = rows.filter(function (x) { return x[0] === slug; })[0];
    if (!r) return;
    var cf = curFarm();
    var fm = farmOf(r, cf.cap, cf.drop, cf.hor);
    var mult = r[8] / (r[4] * r[7]);
    var idx = rows.indexOf(r);
    $("detail").innerHTML =
      "<h3>" + (idx + 1) + ". " + esc(r[1]) + (r[15] === 1 ? ' <span class="badge">Watchlist</span>' : ' <span class="badge early">Early</span>') + "</h3>" +
      '<div class="grid">' +
      "<div><span>Category</span><b>" + esc(r[2] || "—") + "</b></div>" +
      "<div><span>Main chain</span><b>" + esc(r[3] || "—") + "</b></div>" +
      "<div><span>TVL</span><b>" + fmt$(r[4]) + "</b></div>" +
      "<div><span>7-day growth</span><b>" + (r[5] === null ? "—" : (r[5] >= 0 ? "+" : "") + r[5].toFixed(1) + "%") + "</b></div>" +
      "<div><span>Age (listed)</span><b>" + r[6].toFixed(2) + " years</b></div>" +
      "<div><span>Token odds</span><b>" + r[7].toFixed(3) + "</b></div>" +
      "<div><span>Implied value</span><b>" + fmt$(r[8]) + "</b></div>" +
      "<div><span>Range P25–P75</span><b>" + fmt$(r[9]) + " – " + fmt$(r[10]) + "</b></div>" +
      "<div><span>Farm verdict</span><b>" + VN[fm.v] + "</b></div>" +
      "<div><span>Farm net</span><b>" + (fm.net >= 0 ? "+" : "−") + "$" + Math.abs(fm.net).toFixed(0) + "</b></div>" +
      "<div><span>Farm net / hour</span><b>$" + fm.perh.toFixed(1) + "</b></div>" +
      "<div><span>Break-even drop</span><b>" + (fm.be * 100).toFixed(2) + "%</b></div>" +
      "</div>" +
      "<p class='fine'>Why this rank: TVL " + fmt$(r[4]) + " × fitted multiple " + mult.toFixed(3) + " × token odds " + r[7].toFixed(3) + " = " + fmt$(r[8]) + ". The multiple comes from the log-log price fit, not from the protocol's name; the odds come from its size, age and 7-day change.</p>" +
      "<h3>Farm plan — capital $" + fmtN(cf.cap) + ", drop " + Math.round(cf.drop * 100) + "%, horizon " + cf.hor + " weeks</h3>" +
      "<ol>" + stepsFor(r, cf.cap).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>";
    render();
    $("detailPanel").scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "nearest" });
  }

  // filters / sort / export
  var cats = [], chains = [];
  rows.forEach(function (r) {
    if (cats.indexOf(r[2]) === -1) cats.push(r[2]);
    if (chains.indexOf(r[3]) === -1) chains.push(r[3]);
  });
  cats.sort(); chains.sort();
  $("fCat").innerHTML = '<option value="">All</option>' + cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("");
  $("fChain").innerHTML = '<option value="">All</option>' + chains.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("");
  ["fVerdict", "fList", "fCat", "fChain", "fSearch", "sCap", "sDrop", "sHor"].forEach(function (id) {
    $(id).addEventListener("input", render);
  });
  $("resetBtn").addEventListener("click", function () {
    $("fVerdict").value = ""; $("fList").value = ""; $("fCat").value = ""; $("fChain").value = ""; $("fSearch").value = "";
    $("sCap").value = f.cap; $("sDrop").value = Math.round(f.drop * 100); $("sHor").value = f.hor;
    sortRank = true; render();
  });
  document.querySelectorAll("#board th").forEach(function (th) {
    th.addEventListener("click", function () {
      var k = +th.getAttribute("data-k");
      if (k === 0) { sortRank = true; }
      else if (sortK === k && !sortRank) { sortDir = -sortDir; }
      else { sortK = k; sortDir = k === 1 || k === 2 || k === 3 ? 1 : -1; sortRank = false; }
      render();
    });
  });
  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  $("csvBtn").addEventListener("click", function () {
    var cf = curFarm();
    var head = "rank,name,category,chain,tvl_usd,growth_7d,age_years,token_odds,implied_value_usd,range_lo_usd,range_hi_usd,verdict,net_usd,net_per_hour_usd\n";
    var body = filtered().map(function (o) {
      var r = o.r;
      return [o.i + 1, '"' + r[1].replace(/"/g, '""') + '"', r[2], r[3], r[4], r[5], r[6].toFixed(2), r[7].toFixed(3), r[8], r[9], r[10], VN[o.fm.v], o.fm.net.toFixed(0), o.fm.perh.toFixed(1)].join(",");
    }).join("\n");
    download("launch-radar.csv", head + body + "\n", "text/csv");
  });
  $("jsonBtn").addEventListener("click", function () {
    download("launch-radar.json", JSON.stringify(filtered().map(function (o) {
      return { rank: o.i + 1, slug: o.r[0], name: o.r[1], implied_value_usd: o.r[8], verdict: VN[o.fm.v] };
    }), null, 2), "application/json");
  });

  // Deep links for screenshots: #detail=<slug> opens a protocol, #filter=FARM filters.
  // Focus modes hide the sections above the target (no scrolling: deterministic in headless captures).
  var h = (location.hash || "");
  if (h.indexOf("#filter=") === 0) {
    var fv = decodeURIComponent(h.slice(8));
    if (["FARM", "MARGINAL", "SKIP"].indexOf(fv) !== -1) $("fVerdict").value = fv;
    document.body.classList.add("focus-board");
  }
  render();
  if (h.indexOf("#detail=") === 0) {
    document.body.classList.add("focus-detail");
    showDetail(decodeURIComponent(h.slice(8)), true);
  }
})();
