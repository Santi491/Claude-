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
  const C = { cyan: "#4FD1E8", green: "#5CD69A", amber: "#F2A541", red: "#F07A7A", blue: "#6C8CF5", violet: "#C46FD8", gold: "#D9A441", muted: "#7F9AAD", ink: "#D8E8F2", line: "#1E3A4C" };
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
  const GT_COL = { "Respondió": C.green, "Esperando": C.amber, "Cerrada": C.red, "Sin WhatsApp": "#56626C", "Por contactar": C.cyan, "Otro": C.muted };
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
      ${agents.map(a => `<span class="hn">${esc(AGN[a] || a)}</span>${days.map(d => { const v = get(a, d) || 0; return `<span class="hc" style="background:${v ? `rgba(79,209,232,${(0.18 + 0.82 * v / max).toFixed(2)})` : "#0D1D2A"}" title="${esc(AGN[a])} · ${dm(d)}: ${v} acciones">${v || ""}</span>`; }).join("")}`).join("")}</div>`;
  }

  /* ---------- Panel ---------- */
  const st = document.createElement("style");
  st.textContent = `
.gpanel[hidden]{display:none}
.gpanel{position:fixed;inset:0;z-index:50;background:rgba(4,10,16,.72);display:grid;place-items:center;padding:3vh 3vw;color-scheme:dark}
.gp-card{width:min(1320px,100%);height:min(860px,94vh);background:var(--o-bg);color:var(--o-ink);border:1px solid var(--o-line);border-radius:14px;display:grid;grid-template-rows:auto auto minmax(0,1fr);overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55)}
.gp-head{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--o-line);background:var(--o-panel)}
.gp-head b{font:800 20px var(--f-display);font-stretch:82%;margin-right:10px}
.gp-head span{font:500 12px var(--f-mono);color:var(--o-muted)}
.gp-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.gp-tools .seg button{background:#0D1D2A;color:var(--o-ink);font-size:13px}
.gp-tools .seg button[aria-pressed="true"]{background:var(--o-amber);color:var(--o-bg)}
.gp-tools select{font:500 13px var(--f-mono);background:#0D1D2A;color:var(--o-ink);border:1px solid var(--o-line);border-radius:6px;padding:6px 8px}
.gp-tabs{display:flex;gap:2px;overflow-x:auto;padding:0 10px;border-bottom:1px solid var(--o-line);background:#0D1B26}
.gp-tabs button{font:600 13px var(--f-mono);color:var(--o-muted);background:transparent;border:0;border-bottom:2px solid transparent;padding:11px 14px;cursor:pointer;white-space:nowrap}
.gp-tabs button[aria-selected="true"]{color:var(--o-ink);border-bottom-color:var(--o-amber)}
.gp-body{overflow:auto;padding:16px;display:grid;gap:14px;align-content:start;grid-template-columns:repeat(12,minmax(0,1fr))}
.gp-box{grid-column:span 6;background:#0D1D2A;border:1px solid var(--o-line);border-radius:12px;padding:14px;min-width:0;display:grid;gap:10px;align-content:start}
.gp-box.w12{grid-column:1/-1}.gp-box.w4{grid-column:span 4}.gp-box.w8{grid-column:span 8}
.gp-box h4{margin:0;font:700 12px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--o-muted)}
.gp-box svg{width:100%;height:auto;display:block}
.gp-box .ax{font:500 11px var(--f-mono);fill:var(--o-muted)}.gp-box .vl{font:600 11px var(--f-mono);fill:var(--o-ink)}.gp-box .big{font:800 26px var(--f-display);fill:var(--o-ink)}
.gp-note{margin:0;font:500 12px/1.5 var(--f-mono);color:var(--o-muted)}
.gp-empty{margin:0;color:var(--o-muted);font-size:14px}
.gp-leg{display:flex;flex-wrap:wrap;gap:6px 16px;font:500 12px var(--f-mono);color:var(--o-muted)}.gp-leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.gp-kpis{grid-column:1/-1;display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.gp-kpi{background:#0D1D2A;border:1px solid var(--o-line);border-radius:12px;padding:12px 14px;display:grid;gap:2px}
.gp-kpi span{font:600 11px var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--o-muted)}
.gp-kpi b{font:800 30px var(--f-display);font-stretch:85%;line-height:1.1}
.gp-kpi small{font:500 12px var(--f-mono);color:var(--o-muted)}.gp-kpi .up{color:${C.green}}.gp-kpi .dn{color:${C.red}}
.gp-kpi .sp{width:110px;height:30px;margin-top:4px}
.gp-donut{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.gp-donut svg{width:170px;flex:none}
.gp-donut ul{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:14px;flex:1;min-width:150px}.gp-donut li{display:flex;align-items:center;gap:8px}.gp-donut li b{margin-left:auto;font-family:var(--f-mono)}.gp-donut i{width:11px;height:11px;border-radius:3px;flex:none}
.gp-funnel{display:grid;gap:10px}.gp-funnel .fr{display:grid;grid-template-columns:120px 1fr 40px 46px;gap:10px;align-items:center;font-size:14px}
.gp-funnel .fb,.gp-hb .hb{height:22px;background:#0A1620;border-radius:5px;overflow:hidden}.gp-funnel i,.gp-hb i{display:block;height:100%;border-radius:5px}
.gp-funnel b{font:700 16px var(--f-mono);text-align:right}.gp-funnel small{font:500 12px var(--f-mono);color:var(--o-muted)}
.gp-hb{display:grid;gap:8px}.gp-hb .hr{display:grid;grid-template-columns:minmax(0,190px) 1fr 150px;gap:10px;align-items:center;font-size:13.5px}
.gp-hb .hr span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gp-hb b{font:600 13px var(--f-mono);text-align:right;white-space:nowrap}
.gp-heat{display:grid;gap:3px;font:500 12px var(--f-mono);overflow-x:auto}.gp-heat .hd{text-align:center;color:var(--o-muted)}.gp-heat .hn{color:var(--o-ink);white-space:nowrap;align-self:center}
.gp-heat .hc{height:28px;border-radius:4px;display:grid;place-items:center;color:#06121b;font-weight:700}
.gp-tbl{overflow:auto}.gp-tbl table{width:100%;border-collapse:collapse;font-size:13.5px}
.gp-tbl th{font:600 11px var(--f-mono);letter-spacing:.05em;text-transform:uppercase;color:var(--o-muted);text-align:left;padding:7px 8px;border-bottom:1px solid var(--o-line);white-space:nowrap}
.gp-tbl td{padding:7px 8px;border-bottom:1px solid #15293A;vertical-align:top}
.gp-tbl th,.gp-tbl td,.gp-tbl tr{background:transparent!important;color:var(--o-ink);position:static!important;text-align:left!important;white-space:normal!important;font-family:var(--f-body)!important}.gp-tbl th{color:var(--o-muted)}
.gp-tag{display:inline-block;font:700 10.5px var(--f-mono);letter-spacing:.04em;text-transform:uppercase;border-radius:4px;padding:2px 6px;color:#06121b}
.gp-alert{display:grid;gap:8px;margin:0;padding:0;list-style:none}.gp-alert li{border-left:3px solid ${C.red};background:#1A1A20;padding:8px 10px;border-radius:0 8px 8px 0;font-size:14px}
.gp-alert li.ok{border-left-color:${C.green};background:#0F2420}
.gp-agents{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.gp-ag{border:1px solid var(--o-line);border-radius:10px;padding:10px;display:grid;gap:4px;font-size:13px}.gp-ag b{display:flex;align-items:center;gap:8px;font-size:14px}.gp-ag b i{width:9px;height:9px;border-radius:50%}
.gp-ag time{font:500 11.5px var(--f-mono);color:var(--o-muted)}
.gp-cov{display:grid;gap:4px}.gp-cov .cr{display:grid;grid-template-columns:minmax(0,1fr) repeat(3,64px);gap:8px;align-items:center;font-size:13px;padding:4px 0;border-bottom:1px solid #15293A}
.gp-cov .cr.h{font:600 11px var(--f-mono);color:var(--o-muted);text-transform:uppercase}.gp-cov .cr>span:not(:first-child){text-align:center;font-family:var(--f-mono)}
.gp-links a{color:${C.cyan}}
@media (max-width:860px){.gp-box,.gp-box.w4,.gp-box.w8{grid-column:1/-1}.gp-hb .hr{grid-template-columns:110px 1fr 92px}.gp-funnel .fr{grid-template-columns:96px 1fr 34px 40px}.gpanel{padding:0}.gp-card{height:100vh;border-radius:0}}
`;
  document.head.appendChild(st);

  const TABS = [["resumen", "Resumen"], ["contacto", "Contacto con tiendas"], ["precios", "Precios y dólar"], ["oport", "Oportunidades"], ["equipo", "Equipo"], ["plan", "Plan e informes"]];
  let tab = "resumen", rango = "7", dia = MET.length ? MET[MET.length - 1].fecha : "";
  const box = document.createElement("div");
  box.className = "gpanel"; box.hidden = true; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Panel de datos del Gerente");
  box.innerHTML = `<div class="gp-card">
    <div class="gp-head"><div><b>Pantalla del Gerente</b><span>Panel de datos de Cargo Brothers · métricas reales, sin cifras inventadas</span></div>
      <div class="gp-tools"><label class="gp-note" for="gpD">Día</label><select id="gpD"></select>
        <div class="seg" id="gpR"><button type="button" data-r="7" aria-pressed="true">7 días</button><button type="button" data-r="30" aria-pressed="false">30 días</button><button type="button" data-r="todo" aria-pressed="false">Todo</button></div>
        <button type="button" class="mp-x" id="gpX">Cerrar</button></div></div>
    <div class="gp-tabs" role="tablist">${TABS.map(([k, t]) => `<button type="button" role="tab" data-t="${k}" aria-selected="${k === tab}">${t}</button>`).join("")}</div>
    <div class="gp-body" id="gpB"></div></div>`;
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

  const VIEWS = { resumen: vResumen, contacto: vContacto, precios: vPrecios, oport: vOport, equipo: vEquipo, plan: vPlan };
  function render() {
    box.querySelectorAll(".gp-tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.t === tab)));
    box.querySelectorAll("#gpR button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.r === rango)));
    $g("gpB").innerHTML = MET.length || tab === "plan" ? VIEWS[tab]() : `<div class="gp-box w12"><p class="gp-empty">Todavía no hay métricas: corre python3 metricas.py.</p></div>`;
  }
  box.querySelector(".gp-tabs").addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (b) { tab = b.dataset.t; render(); $g("gpB").scrollTop = 0; } });
  $g("gpR").addEventListener("click", e => { const b = e.target.closest("[data-r]"); if (b) { rango = b.dataset.r; render(); } });
  $g("gpD").addEventListener("change", e => { dia = e.target.value; render(); });
  box.addEventListener("click", e => { if (e.target === box) close(); });
  $g("gpX").onclick = () => close();
  let lastFocus = null;
  function open() { lastFocus = document.activeElement; box.hidden = false; render(); $g("gpX").focus(); }
  function close() { box.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !box.hidden) { e.stopImmediatePropagation(); close(); } }, true);
  document.addEventListener("click", e => { if (e.target.closest("[data-panel]")) open(); });
  window.abrirPanel = open;

  /* ---------- Monitores del escritorio (1280×720) ---------- */
  const SANS = "'Archivo', 'Segoe UI', system-ui, sans-serif", MONO = "'IBM Plex Mono', Consolas, monospace";
  function head(g, title, right) {
    g.fillStyle = "#0B1219"; g.fillRect(0, 0, 1280, 720); g.fillStyle = "#141F2A"; g.fillRect(0, 0, 1280, 72);
    g.fillStyle = "#E6EDF3"; g.font = `700 30px ${SANS}`; g.textAlign = "left"; g.fillText(title, 28, 47);
    g.fillStyle = "#F2A541"; g.font = `600 17px ${SANS}`; g.textAlign = "right"; g.fillText(right, 1252, 45); g.textAlign = "left";
  }
  function card(g, x, y, w, h, lab, val, sub, col) {
    g.fillStyle = "#131D27"; g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill();
    g.fillStyle = "#8B9AA8"; g.font = `600 16px ${MONO}`; g.fillText(lab.toUpperCase(), x + 18, y + 32);
    g.fillStyle = col; g.font = `800 52px ${SANS}`; g.fillText(val, x + 18, y + 92);
    if (sub) { g.fillStyle = "#8B9AA8"; g.font = `500 16px ${SANS}`; g.fillText(sub, x + 18, y + 120); }
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
    g.strokeStyle = "#1E3A4C"; g.lineWidth = 1; g.fillStyle = "#6F7F8D"; g.font = `500 15px ${MONO}`; g.textAlign = "right";
    for (let i = 0; i <= 4; i++) { const y = y0 - hMax * i / 4; g.beginPath(); g.moveTo(x0, y); g.lineTo(1250, y); g.stroke(); g.fillText(String(Math.round(max * i / 4)), x0 - 10, y + 5); }
    const bw = Math.min(34, (gw - 24) / ser.length);
    R.forEach((r, i) => {
      ser.forEach(([k, col, msj], j) => {
        if (msj && sinReg(r.fecha)) return;
        const v = n(r[k]) || 0, h = hMax * v / max, x = x0 + i * gw + (gw - bw * ser.length) / 2 + j * bw;
        g.fillStyle = col; g.fillRect(x, y0 - h, bw - 4, h);
      });
      g.fillStyle = "#8B9AA8"; g.textAlign = "center"; g.font = `500 16px ${MONO}`; g.fillText(dm(r.fecha), x0 + i * gw + gw / 2, y0 + 26);
    });
    const ly = y0 - hMax * LIMITE / max; g.strokeStyle = C.red; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(x0, ly); g.lineTo(1250, ly); g.stroke(); g.setLineDash([]);
    g.textAlign = "left"; g.font = `600 15px ${SANS}`;
    [["chats", C.cyan], ["respuestas", C.amber], ["precios locales", C.green], ["precios eBay", "#E8923E"], ["límite chats", C.red]].forEach(([t, col], k) => { g.fillStyle = col; g.fillRect(70 + k * 200, 262, 14, 14); g.fillStyle = "#C9D4DE"; g.fillText(t, 92 + k * 200, 275); });
    return c;
  }
  function monB() {
    const c = document.createElement("canvas"); c.width = 1280; c.height = 720; const g = c.getContext("2d");
    const m = MET[MET.length - 1] || {};
    head(g, "Embudo, oportunidades y plan", `${(m.alertas || "").split(" | ").filter(Boolean).length} alertas`);
    // embudo
    g.fillStyle = "#8B9AA8"; g.font = `600 16px ${MONO}`; g.fillText("EMBUDO DE TIENDAS · 7 DÍAS", 28, 112);
    const F = m.fecha ? embudo7(m.fecha) : [], fm = Math.max(1, ...F.map(f => f.value));
    F.forEach((f, k) => {
      const y = 132 + k * 58; g.fillStyle = "#C9D4DE"; g.font = `600 19px ${SANS}`; g.fillText(f.label, 28, y + 30);
      g.fillStyle = "#131D27"; g.fillRect(200, y + 8, 380, 32); g.fillStyle = f.color; g.fillRect(200, y + 8, Math.max(4, 380 * f.value / fm), 32);
      g.fillStyle = "#E6EDF3"; g.font = `700 22px ${MONO}`; g.fillText(String(f.value), 594, y + 33);
    });
    // cobertura y oportunidades
    g.fillStyle = "#8B9AA8"; g.font = `600 16px ${MONO}`; g.fillText("OPORTUNIDADES", 690, 112);
    card(g, 690, 128, 270, 150, "Conviene traer", String(n(m.convienen) ?? 0), `${n(m.justos) || 0} justos`, C.green);
    card(g, 976, 128, 280, 150, "Con precio local", `${n(m.productos_con_precio_local) ?? 0}/${n(m.productos_total) ?? 0}`, "productos cubiertos", C.cyan);
    // plan
    g.fillStyle = "#8B9AA8"; g.font = `600 16px ${MONO}`; g.fillText("PLAN PROPUESTO", 28, 340);
    const fechas = [...new Set(PLAN.map(p => p.fecha_para))].sort(), f = fechas[fechas.length - 1];
    const items = PLAN.filter(p => p.fecha_para === f);
    if (!items.length) { g.fillStyle = "#6F7F8D"; g.font = `500 22px ${SANS}`; g.fillText("Sin tareas propuestas todavía.", 28, 380); }
    if (f) { g.fillStyle = "#6F7F8D"; g.font = `500 16px ${MONO}`; g.textAlign = "right"; g.fillText(`para el ${dm(f)}`, 1252, 340); g.textAlign = "left"; }
    items.slice(0, 6).forEach((p, k) => {
      const y = 356 + k * 58, col = EST_COL[p.estado] || C.muted;
      g.fillStyle = "#131D27"; g.beginPath(); g.roundRect(24, y, 1232, 50, 8); g.fill();
      g.fillStyle = col; g.beginPath(); g.roundRect(38, y + 13, 118, 24, 5); g.fill();
      g.fillStyle = "#06121b"; g.font = `700 13px ${MONO}`; g.textAlign = "center"; g.fillText(p.estado.toUpperCase(), 97, y + 30); g.textAlign = "left";
      g.fillStyle = "#E6EDF3"; g.font = `500 19px ${SANS}`; let t = `${AGN[p.agente] || p.agente} · ${p.tarea}`; while (g.measureText(t).width > 1070 && t.length) t = t.slice(0, -1);
      g.fillText(t + (t.length < `${AGN[p.agente] || p.agente} · ${p.tarea}`.length ? "…" : ""), 172, y + 32);
    });
    return c;
  }
  function paintMonitors() { TEX.gerente = monA(); TEX.gerente2 = monB(); }
  paintMonitors();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(paintMonitors);
})();
