/* Pantalla del Gerente: los dos monitores de su escritorio y el panel de datos completo (segundo toque o botón "Abrir pantalla").
   Lee D.metricas (metricas.csv), D.mensajes (mensajes.csv, sin notas), D.plan (plan.csv), D.informes_gerente, D.tiendas,
   D.actividad, D.dolar, D.productos y el ranking del Analista. Todo es dato real: la ganancia es potencial hasta que haya ventas. */
(function () {
  const MET = (D.metricas || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const MSJ = D.mensajes || [], PLAN = D.plan || [], INF = (D.informes_gerente || []).slice().reverse();
  const n = v => v === "" || v == null || isNaN(+v) ? null : +v;
  const dm = f => `${String(f).slice(8, 10)}/${String(f).slice(5, 7)}`;
  const LIMITE = 10;
  const MSJ_DESDE = MSJ.length ? MSJ.map(m => m.fecha).sort()[0] : null;   // antes de esta fecha no había registro de mensajes
  const AGN = { nube: "Informe diario", ebay: "Rastreador eBay", wa: "WhatsApp", mkt: "Marketplace", ana: "Analista", pedidos: "Pedidos", fin: "Finanzas", dem: "Demanda", gerente: "Gerente" };
  const QN = Object.assign({}, AGN, { santi: "Santi", local: "Ronda local / Oficina", gerente: "Gerente" });
  const C = { cyan: "#4FD1E8", green: "#5CD69A", amber: "#F2A541", red: "#F07A7A", blue: "#6C8CF5", violet: "#C46FD8", gold: "#D9A441", muted: "#92959A", ink: "#E3E4E6", line: "#333437" };
  const EST_COL = { propuesto: C.amber, aprobado: C.cyan, hecho: C.green, rechazado: C.red };

  /* ---------- Cálculos ---------- */
  function msjDia(f) { return MSJ.filter(m => m.fecha === f); }
  function embudo7(f) {
    const d = new Date(f + "T12:00:00"); d.setDate(d.getDate() - 6); const desde = d.toISOString().slice(0, 10);
    const sem = MSJ.filter(m => m.fecha >= desde && m.fecha <= f);
    const cont = new Set(sem.filter(m => m.direccion === "enviado").map(m => m.tienda));
    const resp = new Set(sem.filter(m => m.direccion === "recibido" && m.tipo !== "automatica").map(m => m.tienda).filter(t => cont.has(t)));
    const prec = new Set(sem.filter(m => m.direccion === "recibido" && m.con_precio === "sí").map(m => m.tienda).filter(t => cont.has(t)));
    return [{ label: "Contactadas", value: cont.size, color: C.cyan }, { label: "Respondieron", value: resp.size, color: C.amber }, { label: "Dieron precio", value: prec.size, color: C.green }];
  }
  function grupoTienda(e) {
    e = (e || "").toLowerCase();
    return /respondi/.test(e) ? "Respondió" : /esperando/.test(e) ? "Esperando" : /no vende|sin stock|no contactar|no busca|cerrad/.test(e) ? "Cerrada" : /sin whatsapp/.test(e) ? "Sin WhatsApp" : /por contactar/.test(e) ? "Por contactar" : "Otro";
  }
  const GT_COL = { "Respondió": C.green, "Esperando": C.amber, "Cerrada": C.red, "Sin WhatsApp": "#5E6064", "Por contactar": C.cyan, "Otro": C.muted };
  function tiendasPorEstado() {
    const c = {}; (D.tiendas || []).forEach(t => { const g = grupoTienda(t.estado); c[g] = (c[g] || 0) + 1; });
    return Object.keys(GT_COL).filter(k => c[k]).map(k => ({ label: k, value: c[k], color: GT_COL[k] }));
  }
  const rank = () => (typeof ranking !== "undefined" ? ranking : []);

  /* ---------- Gráficos SVG ---------- */
  const niceMax = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), k = v / p; return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 5 ? 5 : 10) * p; };
  function svgWrap(W, H, body, label) { return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label || "")}" preserveAspectRatio="xMidYMid meet">${body}</svg>`; }
  function axes(W, H, L, T, R, B, max, fmtY) {
    let s = "";
    for (let i = 0; i <= 4; i++) {
      const y = T + (H - T - B) * (1 - i / 4), v = max * i / 4;
      s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${C.line}" stroke-width="1"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" class="ax">${fmtY ? fmtY(v) : Math.round(v * 10) / 10}</text>`;
    }
    return s;
  }
  // barras agrupadas por día; nulls se dibujan como "sin registro"
  function bars(labels, series, o) {
    o = o || {}; const W = o.w || 640, H = o.h || 240, L = 40, R = 12, T = 14, B = 34;
    const vals = series.flatMap(s => s.values).filter(v => v != null);
    const max = niceMax(Math.max(o.limit || 0, ...vals, 1));
    const gw = (W - L - R) / Math.max(1, labels.length), bw = Math.min(26, (gw - 10) / series.length);
    let s = axes(W, H, L, T, R, B, max);
    labels.forEach((lab, i) => {
      const x0 = L + i * gw + (gw - bw * series.length) / 2;
      series.forEach((se, k) => {
        const v = se.values[i];
        if (v == null) { if (k === 0 && series.every(se2 => se2.values[i] == null)) s += `<text x="${L + i * gw + gw / 2}" y="${H - B - 8}" text-anchor="middle" class="ax">sin registro</text>`; return; }
        const h = (H - T - B) * v / max, y = H - B - h;
        s += `<rect x="${x0 + k * bw}" y="${y}" width="${bw - 3}" height="${Math.max(h, v ? 1.5 : 0)}" rx="2" fill="${se.color}"><title>${esc(se.name)} · ${dm(lab)}: ${v}</title></rect>`;
        if (labels.length <= 10 && v) s += `<text x="${x0 + k * bw + (bw - 3) / 2}" y="${y - 4}" text-anchor="middle" class="vl">${v}</text>`;
      });
      s += `<text x="${L + i * gw + gw / 2}" y="${H - 12}" text-anchor="middle" class="ax">${dm(lab)}</text>`;
    });
    if (o.limit) { const y = H - B - (H - T - B) * o.limit / max; s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${C.red}" stroke-dasharray="6 5" stroke-width="1.5"/><text x="${W - R}" y="${y - 5}" text-anchor="end" class="ax" fill="${C.red}">límite ${o.limit}/día</text>`; }
    return svgWrap(W, H, s, o.label);
  }
  function lines(labels, series, o) {
    o = o || {}; const W = o.w || 640, H = o.h || 220, L = 52, R = 14, T = 14, B = 30;
    const vals = series.flatMap(s => s.values).filter(v => v != null);
    if (!vals.length) return `<p class="gp-empty">Sin datos todavía.</p>`;
    let lo = o.min != null ? o.min : Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.12; lo = o.min != null ? lo : lo - pad; hi += pad;
    const X = i => L + (labels.length < 2 ? (W - L - R) / 2 : i * (W - L - R) / (labels.length - 1)), Y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    let s = "";
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, y = Y(v); s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${C.line}"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" class="ax">${(o.fmtY || (x => x.toFixed(2)))(v)}</text>`; }
    const step = Math.ceil(labels.length / 10);
    labels.forEach((lab, i) => { if (i % step === 0 || i === labels.length - 1) s += `<text x="${X(i)}" y="${H - 10}" text-anchor="middle" class="ax">${dm(lab)}</text>`; });
    series.forEach(se => {
      const pts = se.values.map((v, i) => v == null ? null : [X(i), Y(v)]);
      let d = "", pen = false; pts.forEach(p => { if (!p) { pen = false; return; } d += (pen ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); pen = true; });
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2.5" stroke-linejoin="round"${se.dash ? ' stroke-dasharray="6 5"' : ""}/>`;
      pts.forEach((p, i) => { if (p) s += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${se.color}"><title>${esc(se.name)} · ${dm(labels[i])}: ${se.values[i]}</title></circle>`; });
    });
    return svgWrap(W, H, s, o.label);
  }
  function donut(parts, center, sub) {
    const tot = parts.reduce((a, p) => a + p.value, 0) || 1, R = 70, r = 46, cx = 90, cy = 90;
    let a0 = -Math.PI / 2, s = "";
    parts.forEach(p => {
      const a1 = a0 + 2 * Math.PI * p.value / tot, big = a1 - a0 > Math.PI ? 1 : 0;
      const P = (a, rr) => `${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
      if (p.value === tot) s += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${p.color}" stroke-width="${R - r}"><title>${esc(p.label)}: ${p.value}</title></circle>`;
      else s += `<path d="M${P(a0, R)}A${R} ${R} 0 ${big} 1 ${P(a1, R)}L${P(a1, r)}A${r} ${r} 0 ${big} 0 ${P(a0, r)}Z" fill="${p.color}"><title>${esc(p.label)}: ${p.value}</title></path>`;
      a0 = a1;
    });
    s += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" class="big">${esc(center)}</text><text x="${cx}" y="${cy + 24}" text-anchor="middle" class="ax">${esc(sub || "")}</text>`;
    return `<div class="gp-donut">${svgWrap(180, 180, s, sub)}<ul>${parts.map(p => `<li><i style="background:${p.color}"></i>${esc(p.label)}<b>${p.value}</b></li>`).join("")}</ul></div>`;
  }
  function funnel(steps) {
    const max = Math.max(1, ...steps.map(s => s.value));
    return `<div class="gp-funnel">${steps.map((s, i) => `<div class="fr"><span>${esc(s.label)}</span><div class="fb"><i style="width:${Math.max(2, s.value / max * 100)}%;background:${s.color}"></i></div><b>${s.value}</b><small>${i && steps[0].value ? Math.round(s.value / steps[0].value * 100) + " %" : ""}</small></div>`).join("")}</div>`;
  }
  function hbars(items, o) {
    o = o || {}; if (!items.length) return `<p class="gp-empty">${esc(o.empty || "Sin datos todavía.")}</p>`;
    const max = Math.max(...items.map(i => Math.abs(i.value)), 1e-9);
    return `<div class="gp-hb">${items.map(i => `<div class="hr"><span title="${esc(i.label)}">${esc(i.label)}</span><div class="hb${i.value < 0 ? " neg" : ""}"><i style="width:${Math.max(1.5, Math.abs(i.value) / max * 100)}%;background:${i.color}"></i></div><b style="color:${i.color}">${esc(i.text)}</b></div>`).join("")}</div>`;
  }
  function spark(vals, color) {
    const v = vals.filter(x => x != null); if (v.length < 2) return "";
    const lo = Math.min(...v), hi = Math.max(...v), W = 110, H = 30;
    const pts = vals.map((x, i) => x == null ? null : `${(i * W / (vals.length - 1)).toFixed(1)},${(H - 3 - (hi - lo ? (x - lo) / (hi - lo) : .5) * (H - 6)).toFixed(1)}`).filter(Boolean);
    return `<svg class="sp" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
  }
  function heat(agents, days, get) {
    const max = Math.max(1, ...agents.flatMap(a => days.map(d => get(a, d) || 0)));
    return `<div class="gp-heat" style="grid-template-columns:130px repeat(${days.length},minmax(28px,1fr))"><span></span>${days.map(d => `<span class="hd">${dm(d)}</span>`).join("")}
      ${agents.map(a => `<span class="hn">${esc(AGN[a] || a)}</span>${days.map(d => { const v = get(a, d) || 0; return `<span class="hc" style="background:${v ? `rgba(79,209,232,${(0.18 + 0.82 * v / max).toFixed(2)})` : "#1B1B1C"}" title="${esc(AGN[a])} · ${dm(d)}: ${v} acciones">${v || ""}</span>`; }).join("")}`).join("")}</div>`;
  }

  /* ---------- Panel ---------- */
  const st = document.createElement("style");
  st.textContent = `
.gpanel[hidden]{display:none}
.gpanel{position:fixed;inset:0;z-index:50;background:rgba(10,10,10,.72);display:grid;place-items:center;padding:3vh 3vw;color-scheme:dark}
.gp-card{width:min(1320px,100%);height:min(860px,94vh);background:var(--o-bg);color:var(--o-ink);border:1px solid var(--o-line);border-radius:14px;display:grid;grid-template-rows:auto auto minmax(0,1fr);overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55)}
.gp-head{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--o-line);background:var(--o-panel)}
.gp-head b{font:800 20px var(--f-display);font-stretch:82%;margin-right:10px}
.gp-head span{font:500 12px var(--f-mono);color:var(--o-muted)}
.gp-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.gp-tools .seg button{background:#1B1B1C;color:var(--o-ink);font-size:13px}
.gp-tools .seg button[aria-pressed="true"]{background:var(--o-amber);color:var(--o-bg)}
.gp-tools select{font:500 13px var(--f-mono);background:#1B1B1C;color:var(--o-ink);border:1px solid var(--o-line);border-radius:6px;padding:6px 8px}
.gp-tabs{display:flex;gap:2px;overflow-x:auto;padding:0 10px;border-bottom:1px solid var(--o-line);background:#19191A}
.gp-tabs button{font:600 13px var(--f-mono);color:var(--o-muted);background:transparent;border:0;border-bottom:2px solid transparent;padding:11px 14px;cursor:pointer;white-space:nowrap}
.gp-tabs button[aria-selected="true"]{color:var(--o-ink);border-bottom-color:var(--o-amber)}
.gp-body{overflow:auto;padding:16px;display:grid;gap:14px;align-content:start;grid-template-columns:repeat(12,minmax(0,1fr))}
.gp-box{grid-column:span 6;background:#1B1B1C;border:1px solid var(--o-line);border-radius:12px;padding:14px;min-width:0;display:grid;gap:10px;align-content:start}
.gp-box.w12{grid-column:1/-1}.gp-box.w4{grid-column:span 4}.gp-box.w8{grid-column:span 8}
.gp-box h4{margin:0;font:700 12px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--o-muted)}
.gp-box svg{width:100%;height:auto;display:block}
.gp-box .ax{font:500 11px var(--f-mono);fill:var(--o-muted)}.gp-box .vl{font:600 11px var(--f-mono);fill:var(--o-ink)}.gp-box .big{font:800 26px var(--f-display);fill:var(--o-ink)}
.gp-note{margin:0;font:500 12px/1.5 var(--f-mono);color:var(--o-muted)}
.gp-empty{margin:0;color:var(--o-muted);font-size:14px}
.gp-leg{display:flex;flex-wrap:wrap;gap:6px 16px;font:500 12px var(--f-mono);color:var(--o-muted)}.gp-leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.gp-kpis{grid-column:1/-1;display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.gp-kpi{background:#1B1B1C;border:1px solid var(--o-line);border-radius:12px;padding:12px 14px;display:grid;gap:2px}
.gp-kpi span{font:600 11px var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--o-muted)}
.gp-kpi b{font:800 30px var(--f-display);font-stretch:85%;line-height:1.1}
.gp-kpi small{font:500 12px var(--f-mono);color:var(--o-muted)}.gp-kpi .up{color:${C.green}}.gp-kpi .dn{color:${C.red}}
.gp-kpi .sp{width:110px;height:30px;margin-top:4px}
.gp-donut{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.gp-donut svg{width:170px;flex:none}
.gp-donut ul{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:14px;flex:1;min-width:150px}.gp-donut li{display:flex;align-items:center;gap:8px}.gp-donut li b{margin-left:auto;font-family:var(--f-mono)}.gp-donut i{width:11px;height:11px;border-radius:3px;flex:none}
.gp-funnel{display:grid;gap:10px}.gp-funnel .fr{display:grid;grid-template-columns:120px 1fr 40px 46px;gap:10px;align-items:center;font-size:14px}
.gp-funnel .fb,.gp-hb .hb{height:22px;background:#141516;border-radius:5px;overflow:hidden}.gp-funnel i,.gp-hb i{display:block;height:100%;border-radius:5px}
.gp-funnel b{font:700 16px var(--f-mono);text-align:right}.gp-funnel small{font:500 12px var(--f-mono);color:var(--o-muted)}
.gp-hb{display:grid;gap:8px}.gp-hb .hr{display:grid;grid-template-columns:minmax(0,190px) 1fr 150px;gap:10px;align-items:center;font-size:13.5px}
.gp-hb .hr span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gp-hb b{font:600 13px var(--f-mono);text-align:right;white-space:nowrap}
.gp-heat{display:grid;gap:3px;font:500 12px var(--f-mono);overflow-x:auto}.gp-heat .hd{text-align:center;color:var(--o-muted)}.gp-heat .hn{color:var(--o-ink);white-space:nowrap;align-self:center}
.gp-heat .hc{height:28px;border-radius:4px;display:grid;place-items:center;color:#101011;font-weight:700}
.gp-tbl{overflow:auto}.gp-tbl table{width:100%;border-collapse:collapse;font-size:13.5px}
.gp-tbl th{font:600 11px var(--f-mono);letter-spacing:.05em;text-transform:uppercase;color:var(--o-muted);text-align:left;padding:7px 8px;border-bottom:1px solid var(--o-line);white-space:nowrap}
.gp-tbl td{padding:7px 8px;border-bottom:1px solid #262729;vertical-align:top}
.gp-tbl th,.gp-tbl td,.gp-tbl tr{background:transparent!important;color:var(--o-ink);position:static!important;text-align:left!important;white-space:normal!important;font-family:var(--f-body)!important}.gp-tbl th{color:var(--o-muted)}
.gp-tag{display:inline-block;font:700 10.5px var(--f-mono);letter-spacing:.04em;text-transform:uppercase;border-radius:4px;padding:2px 6px;color:#101011}
.gp-alert{display:grid;gap:8px;margin:0;padding:0;list-style:none}.gp-alert li{border-left:3px solid ${C.red};background:#1C1D1E;padding:8px 10px;border-radius:0 8px 8px 0;font-size:14px}
.gp-alert li.ok{border-left-color:${C.green};background:#0F2420}
.gp-agents{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.gp-ag{border:1px solid var(--o-line);border-radius:10px;padding:10px;display:grid;gap:4px;font-size:13px}.gp-ag b{display:flex;align-items:center;gap:8px;font-size:14px}.gp-ag b i{width:9px;height:9px;border-radius:50%}
.gp-ag time{font:500 11.5px var(--f-mono);color:var(--o-muted)}
.gp-cov{display:grid;gap:4px}.gp-cov .cr{display:grid;grid-template-columns:minmax(0,1fr) repeat(3,64px);gap:8px;align-items:center;font-size:13px;padding:4px 0;border-bottom:1px solid #262729}
.gp-cov .cr.h{font:600 11px var(--f-mono);color:var(--o-muted);text-transform:uppercase}.gp-cov .cr>span:not(:first-child){text-align:center;font-family:var(--f-mono)}
.gp-links a{color:${C.cyan}}
.gd-desk{grid-column:1/-1;min-height:520px;border-radius:12px;border:1px solid var(--o-line);padding:22px;display:grid;grid-template-rows:1fr auto;gap:16px;
  background:radial-gradient(1200px 500px at 70% 0%,rgba(79,209,232,.10),transparent 60%),linear-gradient(160deg,#161617,#1E1F20 55%,#121314)}
.gd-icons{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:18px;align-content:start}
.gd-ic{display:grid;justify-items:center;gap:8px;background:transparent;border:1px solid transparent;border-radius:12px;padding:12px 6px;color:var(--o-ink);cursor:pointer;font:600 13px var(--f-body);position:relative}
.gd-ic:hover,.gd-ic:focus-visible{background:rgba(216,232,242,.06);border-color:var(--o-line)}
.gd-ic i{width:58px;height:58px;border-radius:14px;display:grid;place-items:center;font:800 24px var(--f-display);color:#101011;box-shadow:0 8px 20px rgba(0,0,0,.35)}
.gd-ic em{position:absolute;top:6px;right:22px;min-width:20px;height:20px;border-radius:10px;background:${C.red};color:#fff;font:700 11px/20px var(--f-mono);font-style:normal;padding:0 5px}
.gd-bar{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:space-between;background:rgba(13,13,13,.75);border:1px solid var(--o-line);border-radius:10px;padding:8px 14px;font:500 12.5px var(--f-mono);color:var(--o-muted)}
.gd-bar b{color:var(--o-ink)}
.gd-widgets{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));margin-top:6px}
.gd-w{background:rgba(27,27,28,.85);border:1px solid var(--o-line);border-radius:12px;padding:12px;display:grid;gap:6px;font-size:13.5px}
.gd-w h5{margin:0;font:700 11px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--o-muted)}
.gd-back{justify-self:start;background:#1B1B1C;color:var(--o-ink);border:1px solid var(--o-line);border-radius:8px;padding:6px 12px;font:600 12.5px var(--f-mono);cursor:pointer}
.wa{grid-column:1/-1;display:grid;grid-template-columns:minmax(260px,34%) minmax(0,1fr);height:100%;min-height:440px;background:#0b141a;color:#e9edef;font:400 14.5px/1.35 var(--f-body)}
.os-win[data-w="chat"] .os-wb{padding:0;display:block;overflow:hidden}
.os-win[data-w="chat"] .os-wb>.wa{height:100%}
.wa-side{display:grid;grid-template-rows:auto auto auto minmax(0,1fr);background:#111b21;border-right:1px solid #222d34;min-height:0}
.wa-top{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px}
.wa-top b{font:700 20px var(--f-body);letter-spacing:.2px}
.wa-top small{color:#8696a0;font:500 12px var(--f-mono)}
.wa-q{margin:4px 12px 8px;display:flex;align-items:center;gap:10px;background:#202c33;border-radius:20px;padding:7px 14px;color:#8696a0}
.wa-q input{flex:1;min-width:0;background:transparent;border:0;color:#e9edef;font:400 14px var(--f-body);outline:none}
.wa-chips{display:flex;gap:6px;padding:0 12px 8px;flex-wrap:wrap}
.wa-chips button{background:#202c33;color:#aebac1;border:0;border-radius:16px;padding:5px 12px;font:500 13px var(--f-body);cursor:pointer}
.wa-chips button[aria-pressed="true"]{background:#0a332c;color:#25d366}
.wa-list{overflow:auto;min-height:0}
.wa-it{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:2px 12px;align-items:center;width:100%;text-align:left;background:transparent;border:0;color:inherit;padding:9px 14px;cursor:pointer;font:inherit}
.wa-it:hover{background:#202c33}
.wa-it[aria-pressed="true"]{background:#2a3942}
.wa-it .av{grid-row:1/3}
.wa-it .nm{font:500 16px var(--f-body);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-it .tm{font:400 12px var(--f-body);color:#8696a0;justify-self:end}
.wa-it.nuevo .tm{color:#25d366}
.wa-it .pv{grid-column:2;color:#8696a0;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-bottom:9px;border-bottom:1px solid #222d34}
.wa-it .bd{grid-column:3;grid-row:2;justify-self:end;align-self:start;min-width:20px;height:20px;border-radius:10px;background:#25d366;color:#111b21;font:700 12px/20px var(--f-body);text-align:center;padding:0 6px}
.av{position:relative;flex:none;width:var(--s,48px);height:var(--s,48px);border-radius:50%;overflow:hidden;display:grid;place-items:center;background:radial-gradient(circle at 50% 30%,var(--c2),var(--c1) 70%);box-shadow:inset 0 0 0 1.5px rgba(201,164,92,.55)}
.av img{width:100%;height:100%;object-fit:cover;transform:scale(1.04)}
.av b{font:700 calc(var(--s,48px)*.36) var(--f-mono);color:#f3e6c8;letter-spacing:.5px;text-shadow:0 1px 2px rgba(0,0,0,.35)}
.av i{position:absolute;right:-1px;bottom:-1px;width:calc(var(--s,48px)*.38);height:calc(var(--s,48px)*.38);border-radius:50%;background:#111b21;color:#C9A45C;display:grid;place-items:center;font:700 calc(var(--s,48px)*.2) var(--f-mono);font-style:normal;box-shadow:0 0 0 2px #111b21}
.wa-main{display:grid;grid-template-rows:auto minmax(0,1fr) auto;min-height:0;background:#0b141a}
.wa-hd{display:flex;align-items:center;gap:12px;padding:9px 16px;background:#202c33;min-height:58px}
.wa-hd .nm{font:500 16px var(--f-body)}
.wa-hd small{display:block;color:#8696a0;font:400 13px var(--f-body);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-hd .gcb{display:none;background:transparent;border:0;color:#aebac1;font-size:20px;cursor:pointer;padding:0 4px}
.wa-msgs{overflow:auto;padding:14px 7% 18px;display:flex;flex-direction:column;gap:2px;background-color:#0b141a;background-image:var(--wall);background-size:260px}
.wa-day{align-self:center;margin:10px 0 8px;background:#182229;color:#8696a0;border-radius:8px;padding:5px 12px;font:500 12.5px var(--f-body);box-shadow:0 1px .5px rgba(0,0,0,.13)}
.wa-sys{align-self:center;max-width:86%;margin:4px 0 10px;background:#182229;color:#e2c27d;border-radius:8px;padding:7px 12px;font:400 12.5px/1.4 var(--f-body);text-align:center}
.wa-b{position:relative;max-width:min(78%,620px);padding:6px 9px 8px;border-radius:8px;background:#202c33;align-self:flex-start;box-shadow:0 1px .5px rgba(0,0,0,.13);margin-top:2px;white-space:pre-wrap;overflow-wrap:anywhere}
.wa-b.yo{align-self:flex-end;background:#005c4b}
.wa-b.ini{margin-top:8px}
.wa-b.ini::before{content:"";position:absolute;top:0;left:-8px;border:8px solid transparent;border-top-color:#202c33;border-right-color:#202c33;border-width:0 8px 10px 0}
.wa-b.yo.ini::before{left:auto;right:-8px;border-color:transparent;border-top-color:#005c4b;border-left-color:#005c4b;border-width:0 0 10px 8px}
.wa-b.ini{border-top-left-radius:0}.wa-b.yo.ini{border-top-left-radius:8px;border-top-right-radius:0}
.wa-b .de{display:block;font:500 13px var(--f-body);margin-bottom:2px}
.wa-b .mt{float:right;margin:6px 0 -4px 12px;font:400 11px var(--f-body);color:rgba(233,237,239,.6);white-space:nowrap}
.wa-b .mt .ck{color:#53bdeb;margin-left:3px}
.wa-b .mt .ck.no{color:rgba(233,237,239,.6)}
.wa-b .pa{display:block;font:400 11.5px var(--f-body);color:rgba(233,237,239,.55);margin-top:2px}
.wa-vacio{align-self:center;margin:auto;max-width:360px;text-align:center;color:#8696a0;font-size:14px;line-height:1.5}
.wa-vacio .av{margin:0 auto 12px}
.wa-ft{display:flex;align-items:center;gap:10px;padding:8px 14px;background:#202c33}
.wa-ft span{color:#8696a0;font-size:22px;line-height:1}
.wa-ft input{flex:1;min-width:0;background:#2a3942;border:0;border-radius:22px;padding:10px 16px;color:#e9edef;font:400 15px var(--f-body);outline:none}
.wa-ft input::placeholder{color:#8696a0}
.wa-ft button{flex:none;width:42px;height:42px;border-radius:50%;border:0;background:#00a884;color:#111b21;display:grid;place-items:center;cursor:pointer}
.wa-ft button:disabled{background:#2a3942;color:#8696a0;cursor:not-allowed}
.wa-ok{position:absolute;left:50%;bottom:70px;transform:translateX(-50%);background:#e2c27d;color:#111b21;border-radius:8px;padding:6px 12px;font:600 12.5px var(--f-body);box-shadow:0 4px 14px rgba(0,0,0,.4)}
@media (max-width:760px){.wa{grid-template-columns:1fr}.wa.en-chat .wa-side{display:none}.wa:not(.en-chat) .wa-main{display:none}.wa-hd .gcb{display:block}.wa-msgs{padding:12px 10px}}
.gc-form button,.gt-form button{background:var(--o-amber);color:#101011;border:0;border-radius:8px;font:700 13px var(--f-mono);padding:8px 14px;cursor:pointer}
.gc-form button:disabled,.gt-form button:disabled{opacity:.45;cursor:not-allowed}
.gt-form{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.gt-form select,.gt-form input{font:500 14px var(--f-body);background:#1B1B1C;color:var(--o-ink);border:1px solid var(--o-line);border-radius:8px;padding:8px 10px}
.gt-form input{flex:1;min-width:220px}
.gp-ok{margin:0;font:500 12.5px var(--f-mono);color:${C.green}}
@media (max-width:860px){
.gp-box,.gp-box.w4,.gp-box.w8{grid-column:1/-1}.gp-hb .hr{grid-template-columns:110px 1fr 92px}.gp-funnel .fr{grid-template-columns:96px 1fr 34px 40px}.gpanel{padding:0}.gp-card{height:100vh;border-radius:0}}
/* Escritorio tipo PC (Santi, 28/10): fondo "Noche" con el logo, barra de tareas clásica abajo y apps en ventanas */
.gp-card.os{position:relative;display:block;padding:0;border:8px solid #0a0b0d;border-radius:16px;background:#101215}
.os-desk{position:absolute;inset:0 0 46px 0;overflow:hidden;background:#101215}
.os-wall{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(#1a1d21 1px,transparent 1px),linear-gradient(90deg,#1a1d21 1px,transparent 1px);background-size:25% 25%;display:grid;place-items:center;align-content:center;gap:22px}
.os-wall .cbmark{opacity:.42}.os-wall b{font:500 18px var(--f-display);letter-spacing:.6em;color:#6f767e;padding-left:.6em}
.os-icons{position:absolute;left:12px;top:12px;bottom:12px;display:grid;grid-auto-flow:column;grid-template-rows:repeat(auto-fill,96px);grid-auto-columns:94px;gap:4px 6px;align-content:start}
.os-icons .gd-ic{padding:8px 4px;gap:6px;font-size:12.5px;text-shadow:0 1px 3px #000;line-height:1.2;text-align:center}
.os-icons .gd-ic i{width:46px;height:46px;font-size:20px;border-radius:11px}
.os-icons .gd-ic em{right:12px;top:2px}
.os-icons .gd-ic.sel{background:rgba(201,164,92,.16);border-color:rgba(201,164,92,.5)}
.os-widgets{position:absolute;right:12px;top:12px;width:290px;max-height:calc(100% - 24px);overflow:auto;display:grid;gap:10px;align-content:start}
.os-widgets .gd-w{background:rgba(22,24,27,.9)}
.os-wins{position:absolute;inset:0 0 46px 0;pointer-events:none;overflow:hidden}
.os-win{position:absolute;pointer-events:auto;display:grid;grid-template-rows:auto minmax(0,1fr);background:var(--o-bg);border:1px solid #3a3e44;border-radius:10px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.55);resize:both;min-width:320px;min-height:220px}
.os-win[hidden]{display:none}
.os-win.max{left:0!important;top:0!important;width:100%!important;height:100%!important;border-radius:0;resize:none;border:0}
.os-tt{display:flex;align-items:center;gap:8px;padding-left:10px;height:36px;background:#24272b;font:600 13px var(--f-body);color:var(--o-ink);user-select:none;touch-action:none}
.os-win:not(.act) .os-tt{background:#1a1c1f;color:var(--o-muted)}
.os-tt i{width:20px;height:20px;border-radius:5px;display:grid;place-items:center;font:800 12px var(--f-display);color:#101011;font-style:normal;flex:none}
.os-tt span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.os-tt button{width:44px;height:36px;border:0;background:transparent;color:inherit;font:400 15px var(--f-body);cursor:pointer;flex:none}
.os-tt button:hover{background:#33373c}.os-tt button.x:hover{background:#c42b1c;color:#fff}
.os-wb{overflow:auto}
.os-win .gd-back[data-t="escritorio"]{display:none}
.os-bar{position:absolute;left:0;right:0;bottom:0;height:46px;background:#0b0c0e;border-top:1px solid #24272b;display:flex;align-items:center;gap:6px;padding:0 6px;z-index:3}
.os-st{width:40px;height:38px;border-radius:6px;border:0;background:transparent;cursor:pointer;display:grid;place-items:center;flex:none}
.os-st:hover,.os-st[aria-expanded="true"]{background:#1e2125}
.os-q{display:flex;align-items:center;gap:6px;background:#1a1c1f;border:1px solid #2e3237;border-radius:6px;padding:0 10px;height:32px;width:210px;color:var(--o-muted);flex:none}
.os-q input{background:transparent;border:0;color:var(--o-ink);font:500 13px var(--f-body);width:100%;outline:none}
.os-apps{display:flex;gap:2px;flex:1;min-width:0;overflow-x:auto;height:100%;align-items:center}
.os-tb{position:relative;width:44px;height:40px;border:0;border-radius:6px;background:transparent;cursor:pointer;display:grid;place-items:center;flex:none}
.os-tb:hover{background:#1e2125}
.os-tb i{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;font:800 14px var(--f-display);color:#101011;font-style:normal}
.os-tb.run::after{content:"";position:absolute;bottom:2px;left:50%;width:6px;height:3px;margin-left:-3px;border-radius:2px;background:#8D949C}
.os-tb.act{background:#1e2125}.os-tb.act::after{width:16px;margin-left:-8px;background:#C9A45C}
.os-tb em{position:absolute;top:1px;right:2px;min-width:16px;height:16px;border-radius:8px;background:${C.red};color:#fff;font:700 10px/16px var(--f-mono);font-style:normal;padding:0 4px}
.os-tray{display:flex;align-items:center;gap:8px;font:500 12px var(--f-mono);color:var(--o-ink);flex:none}
.os-tray select{font:500 12px var(--f-mono);background:#1a1c1f;color:var(--o-ink);border:1px solid #2e3237;border-radius:6px;padding:4px 6px}
.os-tray .seg button{background:#1a1c1f;color:var(--o-ink);font-size:12px;padding:4px 8px}
.os-tray .seg button[aria-pressed="true"]{background:var(--o-amber);color:var(--o-bg)}
.os-clk{text-align:right;line-height:1.25;padding:0 4px;white-space:nowrap}
.os-off{width:34px;height:34px;border:0;border-radius:6px;background:transparent;color:var(--o-muted);font-size:16px;cursor:pointer}.os-off:hover{background:#c42b1c;color:#fff}
.os-start{position:absolute;left:6px;bottom:52px;width:350px;max-width:calc(100% - 12px);max-height:calc(100% - 64px);overflow:auto;background:#17191c;border:1px solid #33373c;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.6);padding:14px;z-index:4;display:grid;gap:10px}
.os-start[hidden]{display:none}
.os-start h5{margin:0;font:700 11px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--o-muted)}
.os-start .ap{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
.os-start .ap button{display:grid;justify-items:center;gap:6px;padding:10px 4px;border:0;border-radius:8px;background:transparent;color:var(--o-ink);font:600 12px var(--f-body);cursor:pointer;text-align:center}
.os-start .ap button:hover,.os-start .ap button:focus-visible{background:#24272b}
.os-start .ap i{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font:800 16px var(--f-display);color:#101011;font-style:normal}
.os-start .ft{display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid #2a2d31;padding-top:10px;font:500 12px var(--f-mono);color:var(--o-muted)}
.os-start .ft button{background:transparent;border:1px solid #33373c;border-radius:6px;color:var(--o-ink);padding:5px 10px;cursor:pointer;font:600 12px var(--f-mono)}
@media (max-width:1100px){.os-q{width:140px}.os-tray .seg button{padding:4px 6px}}
@media (max-width:760px){.os-q,.os-widgets,.os-tray .seg,.os-tray select{display:none}.os-win{min-width:0}.gp-card.os{border-width:0;border-radius:0}}
`;
  document.head.appendChild(st);

  const TABS = [["escritorio", "Escritorio"], ["chat", "Chat del equipo"], ["tareas", "Tareas y metas"], ["propuestas", "Propuestas"], ["memoria", "Libreta"], ["resumen", "Resumen"], ["contacto", "Contacto con tiendas"], ["precios", "Precios y dólar"], ["oport", "Oportunidades"], ["equipo", "Equipo"], ["salud", "Salud del equipo"], ["plan", "Plan e informes"]];
  let tab = "escritorio", rango = "7", dia = MET.length ? MET[MET.length - 1].fecha : "";
  const box = document.createElement("div");
  box.className = "gpanel"; box.hidden = true; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Panel de datos del Gerente");
  const logoCB = sz => typeof cbSvg === "function" ? cbSvg(sz, false, "#C9A45C") : `<b style="color:#C9A45C;font:800 ${Math.round(sz / 2)}px var(--f-display)">CB</b>`;
  box.innerHTML = `<div class="gp-card os">
    <div class="os-desk" id="gpB"></div>
    <div class="os-wins" id="osW"></div>
    <div class="os-start" id="osS" hidden role="menu" aria-label="Inicio"></div>
    <div class="os-bar">
      <button type="button" class="os-st" id="osSt" aria-label="Inicio" aria-expanded="false">${logoCB(24)}</button>
      <label class="os-q"><span aria-hidden="true">⌕</span><input id="osQ" placeholder="Buscar" aria-label="Buscar aplicaciones" autocomplete="off"></label>
      <div class="os-apps" id="osA"></div>
      <div class="os-tray"><select id="gpD" aria-label="Día de los datos"></select>
        <div class="seg" id="gpR"><button type="button" data-r="7" aria-pressed="true">7 días</button><button type="button" data-r="30" aria-pressed="false">30 días</button><button type="button" data-r="todo" aria-pressed="false">Todo</button></div>
        <span class="os-clk" id="osC"></span><button type="button" class="os-off" id="gpX" aria-label="Cerrar el escritorio" title="Cerrar el escritorio">⏻</button></div>
    </div></div>`;
  document.body.appendChild(box);
  const $g = id => box.querySelector("#" + id);
  $g("gpD").innerHTML = MET.slice().reverse().map(m => `<option value="${m.fecha}">${dm(m.fecha)}/${m.fecha.slice(0, 4)}</option>`).join("") || `<option>sin datos</option>`;

  function enRango() {
    const hasta = MET.filter(m => m.fecha <= dia);
    return rango === "todo" ? hasta : hasta.slice(-(+rango));
  }
  const delta = (a, b, pct) => {
    if (a == null || b == null) return "";
    const d = a - b; if (Math.abs(d) < 1e-9) return `<small>= que el día anterior</small>`;
    return `<small class="${d > 0 ? "up" : "dn"}">${d > 0 ? "▲" : "▼"} ${pct ? Math.abs(d * 100).toFixed(1) + " pts" : Math.abs(Math.round(d * 100) / 100)} vs día anterior</small>`;
  };
  function kpi(lab, val, sub, dl, sp) { return `<div class="gp-kpi"><span>${esc(lab)}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ""}${dl || ""}${sp || ""}</div>`; }
  const leg = items => `<div class="gp-leg">${items.map(([t, c]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join("")}</div>`;
  const sinReg = f => MSJ_DESDE && f < MSJ_DESDE;

  function vResumen() {
    const R = enRango(), m = MET.find(x => x.fecha === dia) || {}, i = MET.findIndex(x => x.fecha === dia), p = i > 0 ? MET[i - 1] : null;
    const col = k => R.map(r => n(r[k]));
    const cobertura = n(m.productos_con_precio_local), total = n(m.productos_total);
    const alertas = (m.alertas || "").split(" | ").filter(Boolean);
    const best = rank()[0];
    return `<div class="gp-kpis">
      ${kpi("Chats nuevos", `${n(m.chats_nuevos) ?? "—"}<small style="font-size:16px"> / ${LIMITE}</small>`, sinReg(dia) ? "sin registro ese día" : `${n(m.seguimientos) || 0} seguimientos`, sinReg(dia) || !p || sinReg(p.fecha) ? "" : delta(n(m.chats_nuevos), n(p.chats_nuevos)), spark(col("chats_nuevos"), C.cyan))}
      ${kpi("Respuestas", n(m.respuestas) ?? "—", `${n(m.respuestas_con_precio) || 0} con precio · ${n(m.automaticas) || 0} automáticas`, sinReg(dia) || !p || sinReg(p.fecha) ? "" : delta(n(m.respuestas), n(p.respuestas)), spark(col("respuestas"), C.amber))}
      ${kpi("Precios locales nuevos", n(m.precios_locales_nuevos) ?? "—", "tiendas + Marketplace", p ? delta(n(m.precios_locales_nuevos), n(p.precios_locales_nuevos)) : "", spark(col("precios_locales_nuevos"), C.green))}
      ${kpi("Precios eBay nuevos", n(m.precios_ebay_nuevos) ?? "—", "API oficial", p ? delta(n(m.precios_ebay_nuevos), n(p.precios_ebay_nuevos)) : "", spark(col("precios_ebay_nuevos"), "#E8923E"))}
      ${kpi("Tasa de respuesta 7 días", n(m.tasa_respuesta_7d) != null ? (n(m.tasa_respuesta_7d) * 100).toFixed(0) + " %" : "—", `${n(m.tiendas_respondieron_7d) || 0} de ${n(m.tiendas_contactadas_7d) || 0} tiendas contactadas`, "", spark(col("tasa_respuesta_7d"), C.violet))}
      ${kpi("Productos con precio local", cobertura != null ? `${cobertura}<small style="font-size:16px"> / ${total}</small>` : "—", total ? `${Math.round(cobertura / total * 100)} % cubierto` : "", p ? delta(cobertura, n(p.productos_con_precio_local)) : "", spark(col("productos_con_precio_local"), C.cyan))}
      ${kpi("Conviene traer", n(m.convienen) ?? "—", `${n(m.justos) || 0} justos · mejor ${esc(m.mejor_producto || "—")}${n(m.mejor_margen) != null ? " " + (n(m.mejor_margen) * 100).toFixed(0) + " %" : ""}`, p ? delta(n(m.convienen), n(p.convienen)) : "", spark(col("convienen"), C.green))}
      ${kpi("Dólar en cálculos", n(m.dolar_calculos) != null ? n(m.dolar_calculos).toFixed(2) : "—", `BCB ${m.dolar_bcb || "—"} · paralelo ${m.dolar_paralelo || "—"}`, p ? delta(n(m.dolar_calculos), n(p.dolar_calculos)) : "", spark(col("dolar_calculos"), C.gold))}
    </div>
    <div class="gp-box"><h4>Alertas del ${dm(dia)}</h4><ul class="gp-alert">${alertas.length ? alertas.map(a => `<li>${esc(a)}</li>`).join("") : `<li class="ok">Sin alertas: el equipo cumplió las reglas.</li>`}</ul>
      <p class="gp-note">Tiendas esperando respuesta: ${n(m.tiendas_esperando) ?? "—"} · sin respuesta hace 3 días o más: ${n(m.tiendas_sin_respuesta_3d) ?? "—"} · cerradas: ${n(m.tiendas_cerradas) ?? "—"}</p></div>
    <div class="gp-box"><h4>Mejor oportunidad (ganancia potencial)</h4>
      ${best ? `<p style="margin:0;font:800 24px var(--f-display);font-stretch:85%">${esc(best.p.name)}</p><p class="gp-note">Margen ${(best.c.margin * 100).toFixed(1)} % · Bs ${fmt(best.c.gain)} por unidad con los supuestos de la tabla de abajo. Es potencial: todavía no hay ventas.</p>` : `<p class="gp-empty">Sin cálculo todavía.</p>`}
      <h4>Pedidos</h4><p class="gp-note">${n(m.pedidos_activos) || 0} del negocio en camino · ${n(m.pedidos_entregados) || 0} entregados · ${n(m.pedidos_prueba_activos) || 0} de prueba (no cuentan)</p></div>
    <div class="gp-box w12"><h4>Movimiento del equipo por día</h4>${bars(R.map(r => r.fecha), [
      { name: "Chats nuevos", color: C.cyan, values: R.map(r => sinReg(r.fecha) ? null : n(r.chats_nuevos)) },
      { name: "Respuestas", color: C.amber, values: R.map(r => sinReg(r.fecha) ? null : n(r.respuestas)) },
      { name: "Precios locales", color: C.green, values: R.map(r => n(r.precios_locales_nuevos)) },
      { name: "Precios eBay", color: "#E8923E", values: R.map(r => n(r.precios_ebay_nuevos)) }], { label: "Movimiento por día", h: 250, w: 1240 })}
      ${leg([["Chats nuevos", C.cyan], ["Respuestas", C.amber], ["Precios locales nuevos", C.green], ["Precios eBay nuevos", "#E8923E"]])}
      ${MSJ_DESDE && R.some(r => sinReg(r.fecha)) ? `<p class="gp-note">El registro de mensajes empezó el ${dm(MSJ_DESDE)}: antes de esa fecha los chats no se contaban.</p>` : ""}</div>`;
  }

  function vContacto() {
    const R = enRango().filter(r => !sinReg(r.fecha)), md = msjDia(dia);
    const canal = c => MSJ.filter(m => m.canal === c && m.direccion === "enviado").length;
    const tipoCol = { nuevo: C.cyan, seguimiento: C.violet, respuesta: C.amber, automatica: C.muted };
    return `<div class="gp-box w8"><h4>Mensajes por día</h4>${R.length ? bars(R.map(r => r.fecha), [
        { name: "Chats nuevos", color: C.cyan, values: R.map(r => n(r.chats_nuevos)) },
        { name: "Seguimientos", color: C.violet, values: R.map(r => n(r.seguimientos)) },
        { name: "Respuestas", color: C.amber, values: R.map(r => n(r.respuestas)) },
        { name: "Automáticas", color: C.muted, values: R.map(r => n(r.automaticas)) }], { limit: LIMITE, label: "Mensajes por día", w: 820, h: 280 }) : `<p class="gp-empty">Todavía no hay mensajes registrados en este rango.</p>`}
      ${leg([["Chats nuevos", C.cyan], ["Seguimientos", C.violet], ["Respuestas", C.amber], ["Automáticas", C.muted]])}</div>
    <div class="gp-box w4"><h4>Embudo · últimos 7 días</h4>${funnel(embudo7(dia))}
      <p class="gp-note">De las tiendas a las que escribimos en la semana, cuántas contestaron con una persona y cuántas pasaron precio.</p>
      <h4>Por canal (enviados)</h4><p class="gp-note">WhatsApp ${canal("whatsapp")} · Messenger ${canal("messenger")}</p></div>
    <div class="gp-box"><h4>Tiendas por estado</h4>${donut(tiendasPorEstado(), String((D.tiendas || []).length), "tiendas")}</div>
    <div class="gp-box"><h4>Esperando respuesta</h4>${hbars((D.tiendas || []).filter(t => /esperando/i.test(t.estado)).map(t => {
        const dias = t.ultima ? Math.round((new Date(dia + "T12:00:00") - new Date(t.ultima + "T12:00:00")) / 864e5) : null;
        return { label: t.tienda, value: Math.max(0.2, dias || 0), color: dias >= 3 ? C.red : dias >= 1 ? C.amber : C.green, text: dias == null ? "—" : dias === 0 ? "hoy" : `${dias} día${dias === 1 ? "" : "s"}` };
      }).sort((a, b) => b.value - a.value).slice(0, 12), { empty: "Ninguna tienda esperando." })}
      <p class="gp-note">Días desde el último mensaje (rojo: 3 o más, toca seguimiento con aprobación).</p></div>
    <div class="gp-box w12"><h4>Mensajes del ${dm(dia)} · ${md.length}</h4>${md.length ? `<div class="gp-tbl"><table><thead><tr><th>Hora</th><th>Canal</th><th>Tienda</th><th>Dirección</th><th>Tipo</th><th>Con precio</th></tr></thead><tbody>
      ${md.slice().sort((a, b) => a.hora.localeCompare(b.hora)).map(m => `<tr><td>${esc(m.hora)}</td><td>${esc(m.canal)}</td><td>${esc(m.tienda)}</td><td>${m.direccion === "enviado" ? "→ enviado" : "← recibido"}</td><td><span class="gp-tag" style="background:${tipoCol[m.tipo] || C.muted}">${esc(m.tipo)}</span></td><td>${esc(m.con_precio || "—")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="gp-empty">${sinReg(dia) ? "Ese día todavía no existía el registro de mensajes." : "Sin mensajes ese día."}</p>`}
      <p class="gp-note">Sin textos ni números de teléfono: la página es pública.</p></div>`;
  }

  function vPrecios() {
    const R = enRango(), fx = (D.dolar || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    const fxR = rango === "todo" ? fx.filter(f => f.fecha <= dia) : fx.filter(f => f.fecha <= dia).slice(-(+rango));
    const par = f => f.paralelo_compra && f.paralelo_venta ? Math.round((+f.paralelo_compra + +f.paralelo_venta) / 2 * 1000) / 1000 : null;
    const prods = D.productos || [];
    return `<div class="gp-box"><h4>Precios nuevos por día</h4>${bars(R.map(r => r.fecha), [
        { name: "Locales (Cochabamba)", color: C.green, values: R.map(r => n(r.precios_locales_nuevos)) },
        { name: "eBay EE.UU.", color: "#E8923E", values: R.map(r => n(r.precios_ebay_nuevos)) }], { label: "Precios nuevos por día" })}
      ${leg([["Locales (tiendas + Marketplace)", C.green], ["eBay (API)", "#E8923E"]])}</div>
    <div class="gp-box"><h4>Dólar (Bs por USD)</h4>${lines(fxR.map(f => f.fecha), [
        { name: "Oficial BCB", color: C.muted, values: fxR.map(f => n(f.oficial)), dash: true },
        { name: "Paralelo (promedio)", color: C.gold, values: fxR.map(par) },
        { name: "Usado en cálculos", color: C.cyan, values: fxR.map(f => n(f.usado)) }], { label: "Dólar" })}
      ${leg([["Oficial BCB", C.muted], ["Paralelo", C.gold], ["Usado en cálculos", C.cyan]])}</div>
    <div class="gp-box"><h4>Cobertura de precios locales</h4>${lines(R.map(r => r.fecha), [{ name: "Productos con precio local", color: C.cyan, values: R.map(r => n(r.productos_con_precio_local)) }], { min: 0, fmtY: v => v.toFixed(0), label: "Cobertura" })}
      <p class="gp-note">Cuántos de los ${prods.length} productos vigilados ya tienen al menos un precio real en Cochabamba.</p></div>
    <div class="gp-box"><h4>Qué tenemos de cada producto</h4><div class="gp-cov"><div class="cr h"><span>Producto</span><span>eBay nuevo</span><span>eBay usado</span><span>Local</span></div>
      ${prods.map(p => { const loc = (p.local || []).filter(l => l.ref).length; return `<div class="cr"><span>${esc(p.name)}</span><span style="color:${p.nw ? C.green : C.red}">${p.nw ? "$" + Math.round(p.nw.usd + p.nw.ship) : "—"}</span><span style="color:${p.us ? C.green : C.muted}">${p.us ? "$" + Math.round(p.us.usd + p.us.ship) : "—"}</span><span style="color:${loc ? C.green : C.red}">${loc || "falta"}</span></div>`; }).join("")}</div></div>`;
  }

  function vOport() {
    const R = enRango(), rk = rank();
    return `<div class="gp-box w8"><h4>Margen por producto (ganancia potencial)</h4>${hbars(rk.map(r => ({ label: r.p.name, value: r.c.margin, color: r.c.margin >= .15 ? C.green : r.c.margin >= .05 ? C.amber : C.red, text: `${r.c.margin >= 0 ? "+" : "−"}${Math.abs(r.c.margin * 100).toFixed(0)} % · Bs ${fmt(r.c.gain)}` })), { empty: "Sin cálculo todavía." })}
      <p class="gp-note">Con los supuestos de la tabla de abajo (precio de eBay, unidades por caja y dólar). Verde ≥ 15 %, ámbar 5–15 %, rojo &lt; 5 %. Es potencial hasta que haya ventas.</p></div>
    <div class="gp-box w4"><h4>Conviene / justos por día</h4>${bars(R.map(r => r.fecha), [{ name: "Conviene", color: C.green, values: R.map(r => n(r.convienen)) }, { name: "Justo", color: C.amber, values: R.map(r => n(r.justos)) }], { label: "Oportunidades por día", h: 260 })}
      ${leg([["Conviene", C.green], ["Justo", C.amber]])}</div>
    <div class="gp-box w12"><h4>Mejor producto de cada día</h4><div class="gp-tbl"><table><thead><tr><th>Día</th><th>Producto</th><th>Margen</th><th>Conviene</th><th>Justos</th></tr></thead><tbody>
      ${R.slice().reverse().map(r => `<tr><td>${dm(r.fecha)}</td><td>${esc(r.mejor_producto || "—")}</td><td>${n(r.mejor_margen) != null ? (n(r.mejor_margen) * 100).toFixed(1) + " %" : "—"}</td><td>${r.convienen}</td><td>${r.justos}</td></tr>`).join("")}</tbody></table></div></div>`;
  }

  function vEquipo() {
    const R = enRango(), ags = Object.keys(AGN);
    const ult = a => { const x = (D.actividad || []).filter(r => r.agente === a); return x[x.length - 1]; };
    const stOf = a => { const g = (typeof AG !== "undefined" ? AG : []).find(x => x.id === a); return g && typeof STATES !== "undefined" ? STATES[g.state] : null; };
    return `<div class="gp-box w12"><h4>Acciones por agente y día</h4>${heat(ags, R.map(r => r.fecha), (a, d) => n((MET.find(m => m.fecha === d) || {})["act_" + a]))}
      <p class="gp-note">Filas anotadas en actividad.csv. Un cuadro vacío en día hábil es una alerta: el agente no trabajó o no anotó lo que hizo.</p></div>
    <div class="gp-box w12"><h4>Última acción de cada agente</h4><div class="gp-agents">${ags.map(a => { const u = ult(a), s = stOf(a); return `<div class="gp-ag"><b><i style="background:${s ? s.c : C.muted}"></i>${esc(AGN[a])}</b><time>${u ? `${dm(u.fecha)} ${esc(u.hora || "")}` : "sin actividad"}${s ? " · " + esc(s.t) : ""}</time><span>${u ? esc(u.texto.length > 160 ? u.texto.slice(0, 159) + "…" : u.texto) : ""}</span></div>`; }).join("")}</div></div>
    <div class="gp-box w12"><h4>Alertas por día</h4>${bars(R.map(r => r.fecha), [{ name: "Alertas", color: C.red, values: R.map(r => (r.alertas || "").split(" | ").filter(Boolean).length) }], { label: "Alertas por día", h: 200, w: 1240 })}</div>`;
  }

  function vPlan() {
    const fechas = [...new Set(PLAN.map(p => p.fecha_para))].sort().reverse();
    const cnt = e => PLAN.filter(p => p.estado === e).length;
    const decididas = cnt("aprobado") + cnt("hecho") + cnt("rechazado");
    return `<div class="gp-kpis">${kpi("Tareas propuestas", PLAN.length, "por el Gerente")}${kpi("Esperando tu OK", cnt("propuesto"), "confírmalas en el Doc o en el chat")}${kpi("Aprobadas", cnt("aprobado") + cnt("hecho"), `${cnt("rechazado")} rechazadas`)}${kpi("Cumplidas", cnt("hecho"), decididas ? `${Math.round(cnt("hecho") / Math.max(1, cnt("aprobado") + cnt("hecho")) * 100)} % de las aprobadas` : "todavía sin decisiones")}</div>
    ${fechas.length ? fechas.map(f => `<div class="gp-box w12"><h4>Plan para el ${dm(f)}</h4><div class="gp-tbl"><table><thead><tr><th>Estado</th><th>Agente</th><th>Tarea</th><th>Por qué</th><th>Decisión</th></tr></thead><tbody>
      ${PLAN.filter(p => p.fecha_para === f).map(p => `<tr><td><span class="gp-tag" style="background:${EST_COL[p.estado] || C.muted}">${esc(p.estado)}</span></td><td>${esc(AGN[p.agente] || p.agente)}</td><td>${esc(p.tarea)}</td><td style="color:var(--o-muted)">${esc(p.motivo)}</td><td>${esc(p.decision || "")}</td></tr>`).join("")}</tbody></table></div></div>`).join("") : `<div class="gp-box w12"><p class="gp-empty">El Gerente todavía no propuso tareas.</p></div>`}
    <div class="gp-box w12 gp-links"><h4>Informes del Gerente (Google Docs, carpeta INFORME DIARIO)</h4>${INF.length ? `<ul style="margin:0;padding-left:18px">${INF.map(i => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener">${dm(i.fecha)}/${i.fecha.slice(0, 4)} · ${esc(i.tipo)}</a></li>`).join("")}</ul><p class="gp-note">Se abren solo con la cuenta de Santi.</p>` : `<p class="gp-empty">Sin informes todavía.</p>`}</div>`;
  }

  /* ---------- Salud del equipo (salud.py + sesiones.csv): qué corrió, qué falló y qué arregló el vigilante ---------- */
  const SAL = D.salud || { hoy: {}, semana: [], sesiones: [], horario: {} };
  const SCOL = { ok: C.green, cubierta: C.cyan, arreglado: C.cyan, pendiente: C.amber, "en curso": C.amber, "no corrió": C.red, alerta: C.red, "sin señal": C.red, "no toca": "#2E2F31", antes: "#1E1F20", "sin datos": C.muted };
  const SLBL = { ok: "corrió bien", cubierta: "la cubrió otra máquina", pendiente: "todavía no le toca", "en curso": "trabajando ahora", "no corrió": "no corrió", "no toca": "no le toca hoy", antes: "antes de empezar el equipo", "sin datos": "sin datos", "sin señal": "sin señal" };
  const QUIEN = { nube: "Nube", mac: "Mac", pc: "PC de la casa", gerente: "Gerente 20:00", raspberry: "Raspberry" };
  const DIAS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];
  function vSalud() {
    const H = SAL.hoy || {}, R = H.raspberry || {};
    const card = k => { const v = H[k] || {}, h = (SAL.horario || {})[k] || {}, ss = v.sesion;
      const dias = (h.dias || []).map(d => DIAS[d]).join(" ") ;
      return `<div class="gp-ag"><b><i style="background:${SCOL[v.estado] || C.muted}"></i>${esc(v.nombre || QUIEN[k])}</b>
        <time>${esc(SLBL[v.estado] || v.estado || "")}${v.ligera ? " · hoy ronda ligera" : ""}</time>
        <span>${ss ? `${esc(ss.inicio || "")}${ss.fin && ss.fin !== ss.inicio ? "–" + esc(ss.fin) : ""} · ${esc(String(ss.nota || ss.tipo || "").slice(0, 140))}` : `Toca ${esc(dias)} a las ${esc(h.hora || "")}`}</span></div>`; };
    const rasp = `<div class="gp-ag"><b><i style="background:${SCOL[R.estado] || C.muted}"></i>Raspberry · siempre prendida</b>
      <time>${R.ultima ? `última señal ${dm(R.ultima)} ${esc(R.ultima.slice(11))}` : "todavía sin señal"}${R.horas != null ? ` (hace ${R.horas} h)` : ""}</time>
      <span>${R.ultima ? `Bot de Telegram: ${esc(R.bot || "?")} · PC: ${esc(R.pc || "?")} · vigilante cada 30 min` : "El vigilante sube su latido cada 3 horas."}</span></div>`;
    const comps = ["nube", "mac", "pc", "gerente"], sem = SAL.semana || [];
    const grid = `<div class="gp-tbl"><table><thead><tr><th></th>${sem.map(d => `<th style="text-align:center!important">${DIAS[(new Date(d.fecha + "T12:00:00").getDay() + 6) % 7]}<br>${dm(d.fecha)}</th>`).join("")}</tr></thead><tbody>
      ${comps.map(k => `<tr><td>${esc(QUIEN[k])}</td>${sem.map(d => `<td title="${esc(SLBL[d[k]] || d[k])}" style="text-align:center!important"><i style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${SCOL[d[k]] || C.muted}"></i></td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    const ses = (SAL.sesiones || []).slice().reverse().slice(0, 40);
    const fallas = sem.reduce((t, d) => t + comps.filter(k => d[k] === "no corrió").length, 0);
    const arreglos = (SAL.sesiones || []).filter(x => x.estado === "arreglado").length;
    return `<div class="gp-kpis">${kpi("Hoy", comps.filter(k => (H[k] || {}).estado === "ok" || (H[k] || {}).estado === "cubierta").length + " de " + comps.filter(k => (H[k] || {}).estado !== "no toca").length, "partes que ya corrieron")}${kpi("Fallas en 14 días", fallas, "sesiones que no corrieron")}${kpi("Arreglos del vigilante", arreglos, "lo resolvió solo y te avisó")}${kpi("Raspberry", R.estado === "ok" ? "viva" : (R.estado || "sin datos"), R.ultima ? "última señal " + esc(R.ultima.slice(11)) : "")}</div>
    <div class="gp-box w12"><h4>Cómo está cada parte hoy</h4><div class="gp-agents">${comps.map(card).join("")}${rasp}</div></div>
    <div class="gp-box w12"><h4>Últimos 14 días</h4>${grid}
      <p class="gp-note">Verde: corrió · celeste: la cubrió otra máquina · ámbar: pendiente · rojo: no corrió · gris: no le tocaba (Mac lunes a viernes, PC lunes a sábado; domingo sin rondas).</p></div>
    <div class="gp-box w12"><h4>Historial de sesiones</h4>${ses.length ? `<div class="gp-tbl"><table><thead><tr><th>Día</th><th>Quién</th><th>Qué</th><th>Hora</th><th>Estado</th><th>Nota</th></tr></thead><tbody>
      ${ses.map(x => `<tr><td>${dm(x.fecha)}</td><td>${esc(QUIEN[x.quien] || x.quien)}</td><td>${esc(x.tipo)}</td><td>${esc(x.inicio || "")}${x.fin && x.fin !== x.inicio ? "–" + esc(x.fin) : ""}</td><td><span class="gp-tag" style="background:${SCOL[x.estado] || C.muted}">${esc(x.estado)}</span></td><td style="color:var(--o-muted)">${esc(x.nota || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="gp-empty">Todavía no hay sesiones registradas.</p>`}</div>`;
  }

  /* ---------- Escritorio del Gerente (Santi, 17/10): apps como en una computadora ---------- */
  const CHAT = D.chat || [], HOY = (D.generado || "").slice(0, 10);
  const DEMO = !!window.OFI_PROBADOR;
  let db = null, owner = DEMO, chatCon = "", aviso = "";   // en el probador se ve como Santi (sin poder guardar)
  (async () => { try { if (!window.claude || !window.claude.use || window.OFI_PROBADOR) return; const [d, u] = await Promise.all([window.claude.use("db"), window.claude.use("user")]); db = d; owner = u ? !!(await u.isOwner()) : false; if (!box.hidden) render(); } catch (e) { } })();
  const pendChat = () => CHAT.filter(c => (c.para === "gerente" || c.para === "santi") && c.estado !== "respondido");
  const metasHoy = () => PLAN.filter(p => /^s/i.test(p.obligatoria || "") && (p.plazo || p.fecha_para) >= HOY);
  const abiertas = () => PLAN.filter(p => p.estado === "aprobado");
  const atrasadas = () => abiertas().filter(p => (p.plazo || p.fecha_para) < HOY);
  const MEM = D.memoria || [], memAb = () => MEM.filter(m => m.estado === "abierta"), memVence = () => memAb().filter(m => m.vence && m.vence <= HOY);
  const propuestasAb = () => (D.ideas || []).filter(i => i.estado === "propuesta").length + (D.necesidades || []).length;
  const APPS = [["chat", "Chat del equipo", "💬", C.cyan, () => pendChat().length], ["tareas", "Tareas y metas", "✓", C.amber, () => metasHoy().filter(p => p.estado === "aprobado").length],
    ["propuestas", "Propuestas", "★", C.violet, () => propuestasAb()], ["memoria", "Libreta", "✎", C.gold, () => owner ? memVence().length : 0], ["salud", "Salud del equipo", "♥", C.green, () => 0], ["plan", "Informes", "▤", C.blue, () => 0],
    ["resumen", "Panel de datos", "▦", C.gold, () => 0], ["oport", "Oportunidades", "$", C.green, () => 0], ["equipo", "Equipo", "◉", C.muted, () => 0]];
  const back = () => `<button type="button" class="gd-back" data-t="escritorio">← Escritorio</button>`;
  function vEscritorio() {
    const fr = D.frescura || {}, viejo = Object.entries(fr).filter(([k, v]) => v && k !== "catalogos" && (new Date(HOY) - new Date(v.slice(0, 10))) / 864e5 >= 3).map(([k]) => k);
    const ult = CHAT.slice(-3).reverse(), mh = metasHoy();
    return `<div class="os-wall" aria-hidden="true">${logoCB(300)}<b>CARGO BROTHERS</b></div>
      <div class="os-icons">${APPS.map(([k, t, ic, col, badge]) => { const b = badge(); return `<button type="button" class="gd-ic${k === OS.sel ? " sel" : ""}" data-t="${k}"><i style="background:${col}">${ic}</i>${esc(t)}${b ? `<em>${b}</em>` : ""}</button>`; }).join("")}</div>
      <div class="os-widgets">
        <div class="gd-w"><h5>Metas de hoy</h5>${mh.length ? mh.map(p => `<span>${p.estado === "hecho" ? "✓" : "•"} ${esc(QN[p.agente] || p.agente)}: ${esc(p.tarea)}</span>`).join("") : `<span style="color:var(--o-muted)">Sin metas. Ponlas por Telegram (meta wa: 10 tiendas nuevas hoy) o en Tareas y metas.</span>`}</div>
        <div class="gd-w"><h5>Últimos mensajes del equipo</h5>${owner ? (ult.length ? ult.map(c => `<span><b>${esc(QN[c.de] || c.de)}</b> → ${esc(QN[c.para] || c.para)}: ${esc(c.texto.length > 90 ? c.texto.slice(0, 89) + "…" : c.texto)}</span>`).join("") : `<span style="color:var(--o-muted)">Todavía nadie escribió.</span>`) : `<span style="color:var(--o-muted)">El chat del equipo lo ve solo Santi.</span>`}</div>
        <div class="gd-w"><h5>Libreta del Gerente</h5>${owner ? (memAb().length ? memAb().slice().sort((a, b) => (a.vence || "9").localeCompare(b.vence || "9")).slice(0, 3).map(m => `<span>${m.vence && m.vence <= HOY ? "⚠" : "•"} ${esc(m.resumen.length > 80 ? m.resumen.slice(0, 79) + "…" : m.resumen)}${m.vence ? ` <span style="color:var(--o-muted)">· ${dm(m.vence)}</span>` : ""}</span>`).join("") : `<span style="color:var(--o-muted)">Nada anotado. Por Telegram: anota: …</span>`) : `<span style="color:var(--o-muted)">La libreta la ve solo Santi.</span>`}</div>
        <div class="gd-w"><h5>Cola de tareas</h5><span>${abiertas().length} aprobadas por hacer · ${atrasadas().length} atrasadas · ${PLAN.filter(p => p.estado === "propuesto").length} esperan tu OK</span></div>
        <div class="gd-w"><h5>Datos al día</h5><span>${viejo.length ? `Ojo: ${esc(viejo.join(", "))} con 3 días o más` : "Todo con datos de los últimos días"}</span><span style="color:var(--o-muted)">Datos al ${esc((D.generado || "").replace(" ", " · "))}</span></div>
      </div>`;
  }
  function hilos() {
    const ks = new Set(["gerente", "santi"]); const map = {};
    CHAT.forEach(c => { const otro = [c.de, c.para].find(x => x !== "santi" && x !== "gerente") || (c.de === "santi" ? c.para : c.de); (map[otro] = map[otro] || []).push(c); });
    Object.keys(AGN).forEach(a => { if (a !== "nube" && !map[a]) map[a] = []; });
    return Object.entries(map).sort((a, b) => ((b[1].slice(-1)[0] || {}).id || "").localeCompare((a[1].slice(-1)[0] || {}).id || ""));
  }
  /* Chat del equipo al estilo de WhatsApp Web (Santi, 28/10): chats a la izquierda (uno por agente, con su foto de perfil,
     el último mensaje, la hora y los no leídos), la conversación a la derecha con globos, días y doble check.
     Las fotos son retratos de la persona 3D de cada uno (oficina3d.js, window.OFI_AVATARES); mientras cargan, o sin 3D,
     se ve un monograma con el color de su puesto. */
  const PERFIL = {
    gerente: ["#5a4524", "#C9A45C", "GE", "Coordina al equipo y te escribe cada día"], santi: ["#1f4a40", "#3f8a73", "SM", "Dueño de Cargo Brothers"],
    wa: ["#0d4a37", "#1f9e6e", "WA", "Habla con las tiendas por WhatsApp"], mkt: ["#1c3b66", "#3f74c2", "MK", "Marketplace, Messenger y nuestros anuncios"],
    ebay: ["#5c2418", "#c2553a", "EB", "Trae los precios de eBay EE.UU."], ana: ["#3a2a5c", "#7b5cb8", "AN", "Calcula costos, márgenes y qué traer"],
    pedidos: ["#4d3216", "#a8743a", "PE", "Rastrea los paquetes hasta Cochabamba"], fin: ["#1d4a2a", "#3d8f56", "FI", "Plata, stock y ventas"],
    dem: ["#5a3d0d", "#c08a2a", "DE", "Mide qué se mueve en Cochabamba"], nube: ["#1c3f55", "#3b7ea6", "ID", "Informe diario de la mañana"],
    local: ["#2c3035", "#5b636c", "OF", "Rondas de la Mac y la PC y la oficina"] };
  const perfil = k => PERFIL[k] || ["#2c3035", "#5b636c", (QN[k] || k).slice(0, 2).toUpperCase(), ""];
  function avatar(k, sz) {
    const [c1, c2, ini] = perfil(k), foto = (window.OFI_AVATARES || {})[k === "local" ? "" : k];
    return `<span class="av" style="--s:${sz || 48}px;--c1:${c1};--c2:${c2}" aria-hidden="true">${foto ? `<img src="${foto}" alt="">` : `<b>${esc(ini)}</b>`}${foto && sz >= 40 ? `<i>${esc(ini)}</i>` : ""}</span>`;
  }
  window.addEventListener("ofi-avatares", () => { if (!box.hidden && OS.wins.some(w => w.k === "chat")) render(); });
  // fondo de la conversación: dibujitos del negocio (procesador, caja, avión, dólar, ubicación) en bronce muy suave
  const WALL = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260' fill='none' stroke='%23C9A45C' stroke-opacity='.07' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><rect x='22' y='22' width='34' height='34' rx='4'/><rect x='31' y='31' width='16' height='16' rx='2'/><path d='M28 18v4M39 18v4M50 18v4M28 56v4M39 56v4M50 56v4M18 28h4M18 39h4M18 50h4M56 28h4M56 39h4M56 50h4'/><path d='M150 30l22-10 22 10-22 10zM150 30v24l22 10 22-10V30M172 40v24'/><path d='M96 120l40-14-8 8 22 6-6 4-22-4-10 12h-6l4-12-14-2z'/><circle cx='210' cy='130' r='15'/><path d='M210 120v20M215 124c-2-2-9-2-10 1s9 4 10 7-8 4-10 1'/><path d='M44 190c0-10 8-17 17-17s17 7 17 17c0 12-17 28-17 28s-17-16-17-28z'/><circle cx='61' cy='190' r='5'/><rect x='150' y='190' width='40' height='26' rx='3'/><path d='M150 198h40M160 208h8'/><path d='M110 34h18M119 25v18' stroke-opacity='.05'/><circle cx='120' cy='225' r='3'/><circle cx='235' cy='60' r='3'/></svg>`)}")`;
  let chatQ = "", chatF = "todos", chatAbierto = false;
  const DSEM = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const fechaD = f => new Date(f + "T12:00:00");
  const difDias = f => Math.round((fechaD(HOY) - fechaD(f)) / 864e5);
  const cuandoLista = c => { if (!c) return ""; const d = difDias(c.fecha); return d <= 0 ? c.hora : d === 1 ? "Ayer" : d < 7 ? DSEM[fechaD(c.fecha).getDay()] : dm(c.fecha); };
  const cuandoDia = f => { const d = difDias(f); return d <= 0 ? "Hoy" : d === 1 ? "Ayer" : d < 7 ? DSEM[fechaD(f).getDay()].replace(/^./, x => x.toUpperCase()) : dm(f); };
  // el chat es el WhatsApp del Gerente (Santi, 28/10): sus mensajes van en verde a la derecha; el hilo Gerente–Santi se
  // llama "Santi" y va fijado arriba; lo que escribe Santi aparece con su nombre y su foto, como en un grupo
  const nomHilo = k => k === "gerente" ? "Santi" : (QN[k] || k), fotoHilo = k => k === "gerente" ? "santi" : k;
  const subHilo = k => k === "gerente" ? "Tu chat con el Gerente" : (perfil(k)[3] || "");
  const noLeido = (c, k) => c.estado !== "respondido" && c.para === "gerente" && (k === "gerente" ? c.de === "santi" : c.de === k);
  const ICO_BUSCA = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`;
  const ICO_ENVIAR = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 20.5l18-8.5L3 3.5l.02 6.6L15 12 3.02 13.9z"/></svg>`;
  const ICO_PIN = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#8696a0" aria-hidden="true" style="vertical-align:-1px;margin-left:6px"><path d="M14 3l7 7-3 1-4 4 1 5-2 2-4-6-5 5-1-1 5-5-6-4 2-2 5 1 4-4z"/></svg>`;
  function vChat() {
    if (!owner) return `${back()}<div class="gp-box w12"><h4>Chat del equipo</h4><p class="gp-empty">El chat entre los agentes, el Gerente y Santi lo ve solo Santi (abre la oficina con su cuenta). Por Telegram: escribe "chat" para ver lo que te preguntan.</p></div>`;
    const H0 = hilos(), H = [...H0.filter(h => h[0] === "gerente"), ...H0.filter(h => h[0] !== "gerente")];
    if (!H.some(h => h[0] === "gerente")) H.unshift(["gerente", []]);
    if (!chatCon) chatCon = "gerente";
    const conSanti = l => l.some(c => c.de === "santi" || c.para === "santi");
    const vis = H.filter(([k, l]) => chatF === "todos" || (chatF === "nuevos" ? l.some(c => noLeido(c, k)) : k === "gerente" || conSanti(l)));
    const nNuevos = H.filter(([k, l]) => l.some(c => noLeido(c, k))).length;
    const item = ([k, l]) => { const u = l[l.length - 1], nl = l.filter(c => noLeido(c, k)).length;
      const quien = u ? (u.de === "gerente" ? "Tú: " : u.de === "santi" && k !== "gerente" ? "Santi: " : "") : "";
      const ck = u && u.de === "gerente" ? `<span style="color:${u.estado === "respondido" || u.estado === "leido" ? "#53bdeb" : "#8696a0"}">✓✓</span> ` : "";
      return `<button type="button" class="wa-it${nl ? " nuevo" : ""}" data-chat="${esc(k)}" data-q="${esc((nomHilo(k) + " " + l.map(c => c.texto).join(" ")).toLowerCase())}" aria-pressed="${k === chatCon}">${avatar(fotoHilo(k), 49)}<span class="nm">${esc(nomHilo(k))}${k === "gerente" ? ICO_PIN : ""}</span><span class="tm">${esc(cuandoLista(u))}</span><span class="pv">${ck}${u ? esc(quien + u.texto) : `<i style="font-style:normal;opacity:.7">${esc(subHilo(k) || "sin mensajes")}</i>`}</span>${nl ? `<span class="bd">${nl}</span>` : ""}</button>`; };
    const msgs = (H.find(h => h[0] === chatCon) || [, []])[1];
    let dia = "", prev = "";
    const cuerpoMsgs = msgs.map(c => {
      const yo = c.de === "gerente", sep = c.fecha !== dia ? `<div class="wa-day">${esc(cuandoDia(c.fecha))}</div>` : "";
      const ini = sep || prev !== c.de; dia = c.fecha; prev = c.de;
      // en el chat con Santi no hace falta el nombre; en el de un agente, sí (puede escribir el agente o Santi)
      const flecha = !yo && c.para && c.para !== "gerente" && c.para !== c.de ? ` <span style="color:#8696a0;font-weight:400">→ ${esc(QN[c.para] || c.para)}</span>` : "";
      const nombre = !yo && ini && chatCon !== "gerente" ? `<span class="de" style="color:${perfil(c.de)[1]}">${esc(QN[c.de] || c.de)}${flecha}</span>` : "";
      const ck = yo ? `<span class="ck${c.estado === "respondido" || c.estado === "leido" ? "" : " no"}">✓✓</span>` : "";
      return `${sep}<div class="wa-b${yo ? " yo" : ""}${ini ? " ini" : ""}">${nombre}${esc(c.texto)}${yo && c.para && c.para !== chatCon && chatCon !== "gerente" ? `<span class="pa">para ${esc(QN[c.para] || c.para)}</span>` : ""}<span class="mt">${esc(c.hora || "")}${ck}</span></div>`; }).join("");
    const nom = nomHilo(chatCon), aQuien = chatCon === "gerente" ? "el Gerente" : nom;
    return `<div class="wa${chatAbierto ? " en-chat" : ""}" style="--wall:${WALL}">
      <aside class="wa-side"><div class="wa-top"><b>Chats</b><small>WhatsApp del Gerente</small></div>
        <label class="wa-q">${ICO_BUSCA}<input id="gcQ" value="${esc(chatQ)}" placeholder="Buscar un chat o un mensaje" aria-label="Buscar en el chat"></label>
        <div class="wa-chips" role="group" aria-label="Filtro">${[["todos", "Todos"], ["nuevos", `No leídos${nNuevos ? " " + nNuevos : ""}`], ["santi", "Con Santi"]].map(([k, t]) => `<button type="button" data-gcf="${k}" aria-pressed="${chatF === k}">${t}</button>`).join("")}</div>
        <div class="wa-list" id="gcL">${vis.length ? vis.map(item).join("") : `<p class="wa-vacio" style="padding:30px 16px">No hay chats con este filtro.</p>`}</div></aside>
      <section class="wa-main" aria-label="Conversación con ${esc(nom)}">
        <header class="wa-hd"><button type="button" class="gcb" data-gcback aria-label="Volver a los chats">←</button>${avatar(fotoHilo(chatCon), 40)}<div style="min-width:0"><div class="nm">${esc(nom)}</div><small>${esc(subHilo(chatCon))}</small></div></header>
        <div class="wa-msgs" id="gcM"><div class="wa-sys">${chatCon === "gerente" ? "Tu chat con el Gerente: lo que él te pregunta o te cuenta del equipo. Lo que hablan por Telegram no se guarda aquí (el repo es público)." : `Lo que escribas aquí sale con tu nombre y ${esc(nom)} lo recibe en su próxima ronda (al instante: por Telegram, chat ${esc(chatCon)}: …).`} Solo cosas de trabajo: nada de guías, teléfonos, direcciones ni nombres de personas.</div>
          ${msgs.length ? cuerpoMsgs : `<div class="wa-vacio">${avatar(fotoHilo(chatCon), 84)}<b style="display:block;color:#e9edef;margin-bottom:4px">${esc(nom)}</b>Todavía no hay mensajes. Los agentes escriben aquí cuando necesitan algo y el Gerente de la Raspberry te lo pasa por Telegram.</div>`}</div>
        <form class="wa-ft" id="gcF"><span aria-hidden="true">☺</span><input id="gcT" maxlength="400" autocomplete="off" placeholder="${db || DEMO ? `Escribe como Santi a ${esc(aQuien)}` : "Para escribir, abre la oficina con tu cuenta"}" aria-label="Mensaje" ${db || DEMO ? "" : "disabled"}><button type="submit" aria-label="Enviar" ${db || DEMO ? "" : "disabled"}>${ICO_ENVIAR}</button></form>
        ${aviso && tab === "chat" ? `<div class="wa-ok" role="status">${esc(aviso)}</div>` : ""}</section></div>`;
  }
  const MTIPO = { compromiso: ["Compromisos", "lo que el Gerente te prometió", C.amber], pedido: ["Pedidos tuyos", "lo que quieres saber o que se haga", C.cyan], preferencia: ["Preferencias", "cómo te gusta trabajar", C.violet], dato: ["Datos", "lo que contaste y no está en otro archivo", C.blue] };
  const MFUENTE = { telegram: "Telegram", ronda: "fin de ronda", "2000": "informe 20:00", santi: "Santi" };
  function vMemoria() {
    if (!owner) return `${back()}<div class="gp-box w12"><h4>Libreta del Gerente</h4><p class="gp-empty">La libreta del Gerente la ve solo Santi (abre la oficina con su cuenta). Por Telegram: escribe "memoria".</p></div>`;
    const ab = memAb(), cerr = MEM.filter(m => m.estado !== "abierta").slice(-15).reverse();
    const item = m => `<span>${m.vence && m.vence <= HOY && m.estado === "abierta" ? `<span class="gp-tag" style="background:${C.red}">vence</span> ` : ""}<b>${esc(m.id)}.</b> ${esc(m.resumen)} <span style="color:var(--o-muted)">· ${dm(m.fecha)} por ${esc(MFUENTE[m.fuente] || m.fuente)}${m.vence ? ` · vence ${dm(m.vence)}` : ""}${m.estado !== "abierta" ? ` · ${esc(m.estado)} ${esc(m.cerrado)}` : ""}</span></span>`;
    return `${back()}<div class="gp-kpis">${kpi("Abiertas", ab.length, "lo que el Gerente tiene presente")}${kpi("Vencen hoy", memVence().length, "o ya vencieron")}${kpi("Compromisos", ab.filter(m => m.tipo === "compromiso").length, "promesas del Gerente")}${kpi("Cerradas", MEM.length - ab.length, "cumplidas o descartadas")}</div>
      <div class="gp-box w12"><p class="gp-note">Es la memoria de largo plazo del Gerente: la comparten el de Telegram (Raspberry), el de fin de ronda y el de las 20:00. Por Telegram: <b>memoria</b> (ver) · <b>anota: …</b> · <b>cumplida 3</b> · <b>borra 3</b>. Solo resúmenes de negocio, sin datos personales.</p></div>
      ${Object.entries(MTIPO).map(([k, [t, sub, col]]) => { const l = ab.filter(m => m.tipo === k); return `<div class="gp-box w6"><h4 style="border-left:3px solid ${col};padding-left:8px">${t} <small style="color:var(--o-muted);font-weight:400">· ${sub}</small></h4>${l.length ? l.map(item).join("") : `<p class="gp-empty">Nada por ahora.</p>`}</div>`; }).join("")}
      <div class="gp-box w12"><h4>Cerradas hace poco</h4>${cerr.length ? cerr.map(item).join("") : `<p class="gp-empty">Todavía no se cerró ninguna.</p>`}</div>`;
  }
  const PRI = { alta: 0, media: 1, baja: 2 };
  function vTareas() {
    const ab = abiertas().slice().sort((a, b) => (PRI[a.prioridad] ?? 1) - (PRI[b.prioridad] ?? 1) || (a.plazo || a.fecha_para).localeCompare(b.plazo || b.fecha_para));
    const fila = p => `<tr><td><span class="gp-tag" style="background:${p.prioridad === "alta" ? C.red : p.prioridad === "baja" ? C.muted : C.amber}">${esc(p.prioridad || "media")}</span>${/^s/i.test(p.obligatoria || "") ? ` <span class="gp-tag" style="background:${C.violet}">meta</span>` : ""}</td><td>${esc(QN[p.agente] || p.agente)}</td><td>${esc(p.tarea)}${p.meta ? ` <b>(${esc(p.meta)})</b>` : ""}</td><td>${dm(p.plazo || p.fecha_para)}${(p.plazo || p.fecha_para) < HOY ? ` <span class="gp-tag" style="background:${C.red}">atrasada</span>` : ""}</td><td style="color:var(--o-muted)">${esc(p.motivo)}</td></tr>`;
    const agentes = Object.keys(AGN).filter(a => a !== "nube" && a !== "gerente");
    return `${back()}<div class="gp-kpis">${kpi("Metas de hoy", metasHoy().length, `${metasHoy().filter(p => p.estado === "hecho").length} cumplidas`)}${kpi("Por hacer", ab.length, "aprobadas, en orden de prioridad")}${kpi("Atrasadas", atrasadas().length, "pasó el plazo")}${kpi("Esperan tu OK", PLAN.filter(p => p.estado === "propuesto").length, "apruébalas en el tablero o por Telegram")}</div>
      <div class="gp-box w12"><h4>Ponerle una meta a un agente (obligatoria para hoy)</h4>
        <form class="gt-form" id="gtF"><select id="gtA" aria-label="Agente">${agentes.map(a => `<option value="${a}">${esc(AGN[a])}</option>`).join("")}</select><input id="gtT" maxlength="200" placeholder="Ej.: 10 tiendas nuevas hoy sí o sí" aria-label="Meta" ${owner && db ? "" : "disabled"}><button type="submit" ${owner && db ? "" : "disabled"}>Poner meta</button></form>
        <p class="gp-note">${aviso && tab === "tareas" ? `<span class="gp-ok">${esc(aviso)}</span> ` : ""}${owner ? "Queda como tarea aprobada, prioridad alta y obligatoria; la anota la próxima ronda. Para que sea al instante: por Telegram, meta wa: …" : "Solo Santi puede poner metas desde aquí. Por Telegram: meta wa: 10 tiendas nuevas hoy."}</p></div>
      <div class="gp-box w12"><h4>Cola de tareas (aprobadas)</h4>${ab.length ? `<div class="gp-tbl"><table><thead><tr><th>Prioridad</th><th>Responsable</th><th>Tarea</th><th>Plazo</th><th>Por qué</th></tr></thead><tbody>${ab.map(fila).join("")}</tbody></table></div>` : `<p class="gp-empty">No hay tareas aprobadas pendientes.</p>`}</div>`;
  }
  function vPropuestas() {
    const ideas = (D.ideas || []).filter(i => i.estado === "propuesta"), nec = D.necesidades || [];
    const porAg = {}; ideas.forEach(i => (porAg[i.agente] = porAg[i.agente] || { i: [], n: [] }).i.push(i)); nec.forEach(x => (porAg[x.agente] = porAg[x.agente] || { i: [], n: [] }).n.push(x));
    return `${back()}<div class="gp-box w12"><h4>Lo que propone y necesita cada agente</h4><p class="gp-note">Cada agente propone desde su puesto (máximo 2 por turno y con un dato). El Gerente las filtra y te trae las mejores. Para aprobar o dar por resuelto: <button type="button" class="gd-back" data-abrir="tablero">Abrir el tablero</button></p></div>
      ${Object.keys(porAg).length ? Object.entries(porAg).map(([a, v]) => `<div class="gp-box w6"><h4>${esc(QN[a] || a)}</h4>${v.n.map(x => `<span>🔧 <b>Necesita:</b> ${esc(x.necesita)}${x.para_que ? ` <span style="color:var(--o-muted)">· para ${esc(x.para_que)}</span>` : ""}</span>`).join("")}${v.i.map(x => `<span>💡 <b>Idea:</b> ${esc(x.idea)}${x.por_que ? ` <span style="color:var(--o-muted)">· ${esc(x.por_que)}</span>` : ""}</span>`).join("")}</div>`).join("") : `<div class="gp-box w12"><p class="gp-empty">No hay propuestas ni necesidades abiertas.</p></div>`}`;
  }
  async function guardar(tipo, datos) {
    const d = new Date(), p2 = x => String(x).padStart(2, "0"), id = `${tipo}-${d.getTime().toString(36)}`;
    await db.collection("decisiones").doc(id).set(Object.assign({ tipo, fecha: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, hora: `${p2(d.getHours())}:${p2(d.getMinutes())}`, aplicado: false }, datos));
  }
  box.addEventListener("click", e => {
    const c = e.target.closest("[data-chat]"); if (c) { chatCon = c.dataset.chat; chatAbierto = true; aviso = ""; render(); const m = $g("gcM"); if (m) m.scrollTop = m.scrollHeight; const t = $g("gcT"); if (t && !t.disabled && !TOQUE) t.focus(); }
    const f = e.target.closest("[data-gcf]"); if (f) { chatF = f.dataset.gcf; render(); }
    if (e.target.closest("[data-gcback]")) { chatAbierto = false; render(); }
    if (e.target.closest("[data-abrir]")) close(); });
  box.addEventListener("input", e => { if (e.target.id !== "gcQ") return; chatQ = e.target.value; const q = chatQ.trim().toLowerCase();
    box.querySelectorAll("#gcL [data-q]").forEach(b => { b.hidden = !!q && !b.dataset.q.includes(q); }); });
  box.addEventListener("submit", async e => {
    e.preventDefault();
    // probador: el mensaje aparece en la conversación como si se hubiera mandado, pero no se guarda en ningún lado
    if (DEMO && e.target.id === "gcF") { const t = $g("gcT").value.trim(); if (!t) return; const d = new Date(), p2 = x => String(x).padStart(2, "0");
      CHAT.push({ id: "demo-" + d.getTime(), de: "santi", para: chatCon === "gerente" ? "gerente" : chatCon, texto: t, fecha: HOY, hora: `${p2(d.getHours())}:${p2(d.getMinutes())}`, estado: "nuevo" });
      aviso = "Probador: así se vería; el mensaje no se guarda."; render(); const m = $g("gcM"); if (m) m.scrollTop = m.scrollHeight; const i = $g("gcT"); if (i) i.focus(); return; }
    if (!db || !owner) return;
    try {
      if (e.target.id === "gcF") { const t = $g("gcT").value.trim(); if (!t) return; await guardar("chat", { para: chatCon, texto: t }); aviso = `Guardado para ${QN[chatCon] || chatCon}: lo recibe en la próxima ronda.`; }
      if (e.target.id === "gtF") { const t = $g("gtT").value.trim(); if (!t) return; await guardar("meta", { agente: $g("gtA").value, texto: t, meta: (t.match(/\d+/) || [""])[0] }); aviso = `Meta guardada para ${AGN[$g("gtA").value]}: la anota la próxima ronda.`; }
      render();
    } catch (err) { aviso = "No se pudo guardar. Por Telegram funciona siempre."; render(); }
  });

  const VIEWS = { escritorio: vEscritorio, chat: vChat, tareas: vTareas, propuestas: vPropuestas, memoria: vMemoria, resumen: vResumen, contacto: vContacto, precios: vPrecios, oport: vOport, equipo: vEquipo, salud: vSalud, plan: vPlan };
  /* ---------- Ventanas (Santi, 28/10: "que se parezca bastante a Windows en funciones") ----------
     Cada app se abre en su ventana: se arrastra por la barra de título, se agranda desde la esquina, doble clic o □ la
     maximiza, – la minimiza a la barra de tareas y ✕ la cierra. En la barra: clic en una app abierta la trae al frente o la
     minimiza si ya está al frente. Inicio y el buscador muestran todas las apps. */
  const OS = { wins: [], z: 10, n: 0, sel: "" };
  const FIJAS = ["chat", "tareas", "propuestas", "memoria"];
  const TODAS = TABS.filter(([k]) => k !== "escritorio").map(([k, t]) => { const a = APPS.find(x => x[0] === k); return a ? [k, a[1], a[2], a[3], a[4]] : [k, t, "▦", C.blue, () => 0]; });
  const app = k => TODAS.find(a => a[0] === k) || [k, k, "▦", C.blue, () => 0];
  const capa = () => $g("osW");
  const arriba = () => OS.wins.filter(w => !w.min).sort((a, b) => b.z - a.z)[0];
  const elDe = w => capa().querySelector(`[data-w="${w.k}"]`);
  function cuerpo(w) { tab = w.k; return VIEWS[w.k](); }
  function crear(w) {
    const [k, t, ic, col] = app(w.k), el = document.createElement("section");
    el.className = "os-win"; el.dataset.w = k; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", t);
    el.innerHTML = `<header class="os-tt" data-drag="${k}"><i style="background:${col}" aria-hidden="true">${ic}</i><span>${esc(t)}</span><button type="button" data-wmin="${k}" aria-label="Minimizar" title="Minimizar">–</button><button type="button" data-wmax="${k}" aria-label="Maximizar" title="Maximizar">□</button><button type="button" class="x" data-wx="${k}" aria-label="Cerrar" title="Cerrar">✕</button></header><div class="os-wb gp-body">${cuerpo(w)}</div>`;
    capa().appendChild(el);
  }
  function guardarTam() { OS.wins.forEach(w => { const el = elDe(w); if (el && !w.max && !w.min) { w.w = el.offsetWidth; w.h = el.offsetHeight; } }); }
  function aplicar() {
    const top = arriba();
    OS.wins.forEach(w => { const el = elDe(w); if (!el) return;
      el.hidden = w.min; el.classList.toggle("max", w.max); el.classList.toggle("act", w === top);
      Object.assign(el.style, { left: w.x + "px", top: w.y + "px", width: w.w + "px", height: w.h + "px", zIndex: w.z });
      const b = el.querySelector("[data-wmax]"); b.textContent = w.max ? "❐" : "□"; b.setAttribute("aria-label", w.max ? "Restaurar" : "Maximizar"); });
    barra();
  }
  function abrirApp(k) {
    let w = OS.wins.find(x => x.k === k); cerrarInicio();
    if (!w) { const L = capa(), W = L.clientWidth, H = L.clientHeight, n = OS.n++ % 6;
      w = { k, x: Math.min(150 + n * 30, Math.max(0, W - 360)), y: 16 + n * 26, w: Math.max(320, Math.min(1000, W - 190)), h: Math.max(240, Math.min(640, H - 40)), min: false, max: W < 760, z: 0 };
      OS.wins.push(w); crear(w); }
    w.min = false; w.z = ++OS.z; tab = k; aplicar();
    const m = $g("gcM"); if (m) m.scrollTop = m.scrollHeight;
  }
  function cerrarWin(k) { const w = OS.wins.find(x => x.k === k); if (!w) return; const el = elDe(w); if (el) el.remove(); OS.wins = OS.wins.filter(x => x !== w); aplicar(); }
  function barra() {
    const top = arriba(), ks = [...FIJAS, ...OS.wins.map(w => w.k).filter(k => !FIJAS.includes(k))];
    $g("osA").innerHTML = ks.map(k => { const [, t, ic, col, badge] = app(k), w = OS.wins.find(x => x.k === k), b = badge();
      return `<button type="button" class="os-tb${w ? " run" : ""}${w && w === top ? " act" : ""}" data-tb="${k}" title="${esc(t)}" aria-label="${esc(t)}${w ? (w.min ? " (minimizada)" : " (abierta)") : ""}"><i style="background:${col}" aria-hidden="true">${ic}</i>${b ? `<em>${b}</em>` : ""}</button>`; }).join("");
  }
  function inicio(q) {
    const f = (q || "").trim().toLowerCase(), l = TODAS.filter(([, t]) => !f || t.toLowerCase().includes(f));
    $g("osS").innerHTML = `<h5>${f ? "Resultados" : "Aplicaciones"}</h5><div class="ap">${l.length ? l.map(([k, t, ic, col]) => `<button type="button" role="menuitem" data-ab="${k}"><i style="background:${col}" aria-hidden="true">${ic}</i>${esc(t)}</button>`).join("") : `<p class="gp-empty" style="grid-column:1/-1">No hay apps con ese nombre.</p>`}</div>
      <div class="ft"><span>Gerente · Cargo Brothers</span><button type="button" data-apagar>⏻ Cerrar escritorio</button></div>`;
    $g("osS").hidden = false; $g("osSt").setAttribute("aria-expanded", "true"); return l;
  }
  function cerrarInicio() { $g("osS").hidden = true; $g("osSt").setAttribute("aria-expanded", "false"); }
  function reloj() { const d = new Date(), p2 = x => String(x).padStart(2, "0"); $g("osC").innerHTML = `${p2(d.getHours())}:${p2(d.getMinutes())}<br>${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; }
  setInterval(() => { if (!box.hidden) reloj(); }, 15000);
  function render() {
    box.querySelectorAll("#gpR button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.r === rango)));
    const t0 = tab; $g("gpB").innerHTML = vEscritorio();
    guardarTam();
    OS.wins.forEach(w => { const el = elDe(w); if (!el) return; const wb = el.querySelector(".os-wb"), sc = wb.scrollTop;
      wb.innerHTML = MET.length || ["plan", "salud", "chat", "tareas", "propuestas", "memoria"].includes(w.k) ? cuerpo(w) : `<div class="gp-box w12"><p class="gp-empty">Todavía no hay métricas: corre python3 metricas.py.</p></div>`; wb.scrollTop = sc; });
    tab = (arriba() || {}).k || t0; aplicar();
  }
  // íconos del escritorio: un clic selecciona, doble clic abre (en el celular, un toque abre); dentro de una ventana, los botones abren la app
  const TOQUE = matchMedia("(pointer:coarse)").matches;
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-t]");
    if (b && box.contains(b)) {
      if (b.classList.contains("gd-ic") && b.closest(".os-icons") && !TOQUE) { OS.sel = b.dataset.t; box.querySelectorAll(".os-icons .gd-ic").forEach(x => x.classList.toggle("sel", x === b)); return; }
      if (b.dataset.t === "escritorio") { const s = b.closest("[data-w]"); if (s) cerrarWin(s.dataset.w); return; }
      abrirApp(b.dataset.t); return;
    }
    const tb = e.target.closest("[data-tb]");
    if (tb) { const k = tb.dataset.tb, w = OS.wins.find(x => x.k === k); cerrarInicio();
      if (!w) abrirApp(k); else if (w.min) { w.min = false; w.z = ++OS.z; tab = k; aplicar(); } else if (w === arriba()) { guardarTam(); w.min = true; aplicar(); } else { w.z = ++OS.z; tab = k; aplicar(); } return; }
    const mn = e.target.closest("[data-wmin]"); if (mn) { const w = OS.wins.find(x => x.k === mn.dataset.wmin); guardarTam(); w.min = true; aplicar(); return; }
    const mx = e.target.closest("[data-wmax]"); if (mx) { const w = OS.wins.find(x => x.k === mx.dataset.wmax); guardarTam(); w.max = !w.max; w.z = ++OS.z; aplicar(); return; }
    const cx = e.target.closest("[data-wx]"); if (cx) { cerrarWin(cx.dataset.wx); return; }
    const ab = e.target.closest("[data-ab]"); if (ab) { $g("osQ").value = ""; abrirApp(ab.dataset.ab); return; }
    if (e.target.closest("[data-apagar]")) { cerrarInicio(); close(); return; }
    if (e.target.closest("#osSt")) { $g("osS").hidden ? inicio($g("osQ").value) : cerrarInicio(); return; }
    if (!e.target.closest("#osS") && !e.target.closest(".os-q")) cerrarInicio();
    const win = e.target.closest("[data-w]"); if (win) { const w = OS.wins.find(x => x.k === win.dataset.w); if (w && w !== arriba()) { w.z = ++OS.z; tab = w.k; aplicar(); } }
    else if (e.target.closest(".os-desk") && !e.target.closest(".gd-ic")) { OS.sel = ""; box.querySelectorAll(".os-icons .gd-ic.sel").forEach(x => x.classList.remove("sel")); }
  });
  box.addEventListener("dblclick", e => { const b = e.target.closest(".os-icons [data-t]"); if (b) { abrirApp(b.dataset.t); return; }
    const tt = e.target.closest("[data-drag]"); if (tt && !e.target.closest("button")) { const w = OS.wins.find(x => x.k === tt.dataset.drag); guardarTam(); w.max = !w.max; aplicar(); } });
  box.addEventListener("keydown", e => { const b = e.target.closest(".os-icons [data-t]"); if (b && e.key === "Enter") { e.preventDefault(); abrirApp(b.dataset.t); } });
  // arrastrar la ventana por su barra de título
  box.addEventListener("pointerdown", e => {
    const tt = e.target.closest("[data-drag]"); if (!tt || e.target.closest("button") || e.button > 0) return;
    const w = OS.wins.find(x => x.k === tt.dataset.drag); if (!w) return;
    w.z = ++OS.z; tab = w.k; aplicar(); if (w.max) return;
    const el = elDe(w), L = capa(), x0 = e.clientX - w.x, y0 = e.clientY - w.y; guardarTam();
    try { tt.setPointerCapture(e.pointerId); } catch (_) { }
    const mover = ev => { w.x = Math.max(-w.w + 120, Math.min(L.clientWidth - 120, ev.clientX - x0)); w.y = Math.max(0, Math.min(L.clientHeight - 36, ev.clientY - y0)); el.style.left = w.x + "px"; el.style.top = w.y + "px"; };
    const soltar = () => { tt.removeEventListener("pointermove", mover); tt.removeEventListener("pointerup", soltar); tt.removeEventListener("pointercancel", soltar); };
    tt.addEventListener("pointermove", mover); tt.addEventListener("pointerup", soltar); tt.addEventListener("pointercancel", soltar);
  });
  $g("osQ").addEventListener("input", e => inicio(e.target.value));
  $g("osQ").addEventListener("focus", e => inicio(e.target.value));
  $g("osQ").addEventListener("keydown", e => { if (e.key === "Enter") { const l = inicio(e.target.value); if (l[0]) { e.target.value = ""; abrirApp(l[0][0]); e.target.blur(); } } });
  $g("gpR").addEventListener("click", e => { const b = e.target.closest("[data-r]"); if (b) { rango = b.dataset.r; render(); } });
  $g("gpD").addEventListener("change", e => { dia = e.target.value; render(); });
  box.addEventListener("click", e => { if (e.target === box) close(); });
  $g("gpX").onclick = () => close();
  let lastFocus = null;
  function open() { lastFocus = document.activeElement; box.hidden = false; reloj(); render(); $g("osSt").focus(); }
  function close() { box.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !box.hidden) { e.stopImmediatePropagation(); if (!$g("osS").hidden) cerrarInicio(); else close(); } }, true);
  document.addEventListener("click", e => { if (e.target.closest("[data-panel]")) open(); });
  window.abrirPanel = open;

  /* ---------- Monitores del escritorio (1280×720) ---------- */
  const SANS = "'Archivo', 'Segoe UI', system-ui, sans-serif", MONO = "'IBM Plex Mono', Consolas, monospace";
  function head(g, title, right) {
    g.fillStyle = "#111213"; g.fillRect(0, 0, 1280, 720); g.fillStyle = "#1E1F20"; g.fillRect(0, 0, 1280, 72);
    g.fillStyle = "#ECECED"; g.font = `700 30px ${SANS}`; g.textAlign = "left"; g.fillText(title, 28, 47);
    g.fillStyle = "#F2A541"; g.font = `600 17px ${SANS}`; g.textAlign = "right"; g.fillText(right, 1252, 45); g.textAlign = "left";
  }
  function card(g, x, y, w, h, lab, val, sub, col) {
    g.fillStyle = "#1C1D1E"; g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill();
    g.fillStyle = "#96989D"; g.font = `600 16px ${MONO}`; g.fillText(lab.toUpperCase(), x + 18, y + 32);
    g.fillStyle = col; g.font = `800 52px ${SANS}`; g.fillText(val, x + 18, y + 92);
    if (sub) { g.fillStyle = "#96989D"; g.font = `500 16px ${SANS}`; g.fillText(sub, x + 18, y + 120); }
  }
  function monA() {
    const c = document.createElement("canvas"); c.width = 1280; c.height = 720; const g = c.getContext("2d");
    const m = MET[MET.length - 1] || {};
    head(g, "Gerente · métricas del día", m.fecha ? `${dm(m.fecha)} · toca para abrir el panel` : "toca para abrir el panel");
    const tasa = n(m.tasa_respuesta_7d);
    [["Chats nuevos", `${n(m.chats_nuevos) ?? 0}/${LIMITE}`, `${n(m.seguimientos) || 0} seguimientos`, C.cyan],
     ["Respuestas", String(n(m.respuestas) ?? 0), `${n(m.respuestas_con_precio) || 0} con precio`, C.amber],
     ["Precios nuevos", String((n(m.precios_locales_nuevos) || 0) + (n(m.precios_ebay_nuevos) || 0)), `${n(m.precios_locales_nuevos) || 0} locales · ${n(m.precios_ebay_nuevos) || 0} eBay`, C.green],
     ["Respuesta 7 d", tasa != null ? Math.round(tasa * 100) + "%" : "—", `${n(m.tiendas_respondieron_7d) || 0} de ${n(m.tiendas_contactadas_7d) || 0} tiendas`, C.violet]]
      .forEach(([l, v, s, col], k) => card(g, 24 + k * 312, 92, 296, 140, l, v, s, col));
    // barras de los últimos 7 días
    const R = MET.slice(-7), x0 = 70, y0 = 660, hMax = 330, gw = (1240 - x0) / Math.max(1, R.length);
    const ser = [["chats_nuevos", C.cyan, true], ["respuestas", C.amber, true], ["precios_locales_nuevos", C.green, false], ["precios_ebay_nuevos", "#E8923E", false]];
    const max = niceMax(Math.max(LIMITE, ...R.flatMap(r => ser.map(([k]) => n(r[k]) || 0))));
    g.strokeStyle = "#333437"; g.lineWidth = 1; g.fillStyle = "#7A7D82"; g.font = `500 15px ${MONO}`; g.textAlign = "right";
    for (let i = 0; i <= 4; i++) { const y = y0 - hMax * i / 4; g.beginPath(); g.moveTo(x0, y); g.lineTo(1250, y); g.stroke(); g.fillText(String(Math.round(max * i / 4)), x0 - 10, y + 5); }
    const bw = Math.min(34, (gw - 24) / ser.length);
    R.forEach((r, i) => {
      ser.forEach(([k, col, msj], j) => {
        if (msj && sinReg(r.fecha)) return;
        const v = n(r[k]) || 0, h = hMax * v / max, x = x0 + i * gw + (gw - bw * ser.length) / 2 + j * bw;
        g.fillStyle = col; g.fillRect(x, y0 - h, bw - 4, h);
      });
      g.fillStyle = "#96989D"; g.textAlign = "center"; g.font = `500 16px ${MONO}`; g.fillText(dm(r.fecha), x0 + i * gw + gw / 2, y0 + 26);
    });
    const ly = y0 - hMax * LIMITE / max; g.strokeStyle = C.red; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(x0, ly); g.lineTo(1250, ly); g.stroke(); g.setLineDash([]);
    g.textAlign = "left"; g.font = `600 15px ${SANS}`;
    [["chats", C.cyan], ["respuestas", C.amber], ["precios locales", C.green], ["precios eBay", "#E8923E"], ["límite chats", C.red]].forEach(([t, col], k) => { g.fillStyle = col; g.fillRect(70 + k * 200, 262, 14, 14); g.fillStyle = "#D2D3D5"; g.fillText(t, 92 + k * 200, 275); });
    return c;
  }
  function monB() {
    const c = document.createElement("canvas"); c.width = 1280; c.height = 720; const g = c.getContext("2d");
    const m = MET[MET.length - 1] || {};
    head(g, "Embudo, oportunidades y plan", `${(m.alertas || "").split(" | ").filter(Boolean).length} alertas`);
    // embudo
    g.fillStyle = "#96989D"; g.font = `600 16px ${MONO}`; g.fillText("EMBUDO DE TIENDAS · 7 DÍAS", 28, 112);
    const F = m.fecha ? embudo7(m.fecha) : [], fm = Math.max(1, ...F.map(f => f.value));
    F.forEach((f, k) => {
      const y = 132 + k * 58; g.fillStyle = "#D2D3D5"; g.font = `600 19px ${SANS}`; g.fillText(f.label, 28, y + 30);
      g.fillStyle = "#1C1D1E"; g.fillRect(200, y + 8, 380, 32); g.fillStyle = f.color; g.fillRect(200, y + 8, Math.max(4, 380 * f.value / fm), 32);
      g.fillStyle = "#ECECED"; g.font = `700 22px ${MONO}`; g.fillText(String(f.value), 594, y + 33);
    });
    // cobertura y oportunidades
    g.fillStyle = "#96989D"; g.font = `600 16px ${MONO}`; g.fillText("OPORTUNIDADES", 690, 112);
    card(g, 690, 128, 270, 150, "Conviene traer", String(n(m.convienen) ?? 0), `${n(m.justos) || 0} justos`, C.green);
    card(g, 976, 128, 280, 150, "Con precio local", `${n(m.productos_con_precio_local) ?? 0}/${n(m.productos_total) ?? 0}`, "productos cubiertos", C.cyan);
    // plan
    g.fillStyle = "#96989D"; g.font = `600 16px ${MONO}`; g.fillText("PLAN PROPUESTO", 28, 340);
    const fechas = [...new Set(PLAN.map(p => p.fecha_para))].sort(), f = fechas[fechas.length - 1];
    const items = PLAN.filter(p => p.fecha_para === f);
    if (!items.length) { g.fillStyle = "#7A7D82"; g.font = `500 22px ${SANS}`; g.fillText("Sin tareas propuestas todavía.", 28, 380); }
    if (f) { g.fillStyle = "#7A7D82"; g.font = `500 16px ${MONO}`; g.textAlign = "right"; g.fillText(`para el ${dm(f)}`, 1252, 340); g.textAlign = "left"; }
    items.slice(0, 6).forEach((p, k) => {
      const y = 356 + k * 58, col = EST_COL[p.estado] || C.muted;
      g.fillStyle = "#1C1D1E"; g.beginPath(); g.roundRect(24, y, 1232, 50, 8); g.fill();
      g.fillStyle = col; g.beginPath(); g.roundRect(38, y + 13, 118, 24, 5); g.fill();
      g.fillStyle = "#101011"; g.font = `700 13px ${MONO}`; g.textAlign = "center"; g.fillText(p.estado.toUpperCase(), 97, y + 30); g.textAlign = "left";
      g.fillStyle = "#ECECED"; g.font = `500 19px ${SANS}`; let t = `${AGN[p.agente] || p.agente} · ${p.tarea}`; while (g.measureText(t).width > 1070 && t.length) t = t.slice(0, -1);
      g.fillText(t + (t.length < `${AGN[p.agente] || p.agente} · ${p.tarea}`.length ? "…" : ""), 172, y + 32);
    });
    return c;
  }
  function paintMonitors() { TEX.gerente = monA(); TEX.gerente2 = monB(); }
  paintMonitors();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(paintMonitors);
})();
