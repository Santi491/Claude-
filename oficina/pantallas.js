/* Pantallas propias de los agentes (botón "Abrir pantalla" o segundo toque en su escritorio):
   Rastreador eBay (historial de precios), WhatsApp (embudo y agenda de seguimientos), Analista (desglose del costo,
   calculadora de caja y precio de venta sugerido), Informe diario (lector de informes), Finanzas (plata, stock y ventas)
   y Analista de demanda (qué se busca). Usa D (datos.js) y las funciones de la página (calc, P, S, fmt, esc...).
   La página es pública: nunca muestra teléfonos, chats, guías ni nombres de clientes. */
(function () {
  const C = { nuevo: "#2A9DB3", usado: "#B565CC", local: "#C27A22", green: "#5CD69A", amber: "#F2A541", red: "#F07A7A", muted: "#92959A", ink: "#E3E4E6", line: "#333437", blue: "#4FD1E8" };
  const NOMBRE = id => (AG.find(a => a.id === id) || {}).name || id;
  const tc = () => +$("tc").value || 11.9;
  const bs = v => v == null || isNaN(v) ? "—" : `Bs ${fmt(v)}`;
  const usd = v => v == null || isNaN(v) ? "—" : `USD ${fmt(v, 2)}`;
  const pct = v => v == null || isNaN(v) ? "—" : `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v * 100))} %`;

  const css = document.createElement("style");
  css.textContent = `
.ps-tabs{display:flex;flex-wrap:wrap;gap:6px}
.ps-tabs button{font:600 12px var(--f-mono);background:#1B1B1C;color:var(--o-ink);border:1px solid var(--o-line);border-radius:999px;padding:7px 12px;min-height:34px;cursor:pointer}
.ps-tabs button[aria-pressed="true"]{background:var(--o-amber);color:#151516;border-color:var(--o-amber)}
.ps-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.ps-kpi{background:var(--o-panel);border:1px solid var(--o-line);border-radius:10px;padding:12px;display:grid;gap:4px;min-width:0}
.ps-kpi span{font:600 11px var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--o-muted)}
.ps-kpi b{font:800 24px var(--f-display);font-variant-numeric:tabular-nums}
.ps-kpi small{font:500 12px var(--f-mono);color:var(--o-muted)}
.ps-box{background:var(--o-panel);border:1px solid var(--o-line);border-radius:10px;padding:12px;min-width:0}
.ps-box h4{margin:0 0 8px;font:700 16px var(--f-display);font-stretch:85%}
.ps-box svg{width:100%;height:auto;display:block}
.ps-scroll{overflow-x:auto}
.ps-t{width:100%;border-collapse:collapse;font:500 13px var(--f-body)}
.ps-t th{font:600 11px var(--f-mono);text-transform:uppercase;letter-spacing:.06em;color:var(--o-muted);text-align:left;padding:6px;border-bottom:1px solid var(--o-line);background:transparent;white-space:nowrap}
.ps-t td{text-align:left;padding:7px 6px;border-bottom:1px solid var(--o-line);color:var(--o-ink);background:transparent;vertical-align:middle}
.ps-t .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ps-t tr.best td{background:rgba(242,165,65,.08)}
.ps-chip{display:inline-block;font:700 11px var(--f-mono);padding:2px 7px;border-radius:4px;white-space:nowrap}
.c-good{background:#123323;color:#8FE3B5}.c-warn{background:#3A2814;color:#F2A541}.c-bad{background:#3A1818;color:#F3A3A3}.c-info{background:#242526;color:#4FD1E8}.c-mute{background:#242526;color:#B0B2B6}
.ps-pos{color:#8FE3B5}.ps-neg{color:#F3A3A3}
.ps-funnel{display:grid;gap:8px}
.ps-funnel .r{display:grid;grid-template-columns:minmax(120px,190px) minmax(0,1fr) 54px;gap:10px;align-items:center}
.ps-funnel .r span{font:500 13px var(--f-body)}
.ps-funnel .bar{height:24px;border-radius:5px;background:#272829;overflow:hidden}
.ps-funnel .bar i{display:block;height:100%;border-radius:5px}
.ps-funnel b{font:700 14px var(--f-mono);text-align:right}
.ps-agenda{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
.ps-agenda ul{margin:6px 0 0;padding-left:18px;font-size:14px;line-height:1.5}
.ps-agenda li small{color:var(--o-muted)}
.ps-stack{display:grid;gap:10px}
.ps-stack .row{display:grid;grid-template-columns:minmax(120px,210px) minmax(0,1fr);gap:10px;align-items:center}
.ps-stack .row>span{font:600 13px var(--f-body);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ps-stack .track{position:relative;height:26px}
.ps-stack .seg{position:absolute;top:0;height:26px}
.gpanel[hidden]{display:none!important}
.ps-stack .mark{position:absolute;top:-4px;width:3px;height:34px;background:#EDEDEE;border-radius:2px}
.ps-stack .lbl{position:absolute;top:5px;font:600 12px var(--f-mono);white-space:nowrap}
.ps-legend{display:flex;flex-wrap:wrap;gap:12px;font:500 12px var(--f-mono);color:var(--o-ink)}
.ps-legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-2px}
.ps-form{display:flex;flex-wrap:wrap;gap:10px;align-items:end}
.ps-form label{display:grid;gap:4px;font:600 11px var(--f-mono);color:var(--o-muted);text-transform:uppercase}
.ps-form input,.ps-form select{font:500 14px var(--f-mono);background:#1B1B1C;color:var(--o-ink);border:1px solid var(--o-line);border-radius:6px;padding:7px 8px;min-height:36px}
.ps-form button{font:600 13px var(--f-body);background:#123323;border:1px solid #2C6B4A;color:#8FE3B5;border-radius:6px;padding:8px 14px;min-height:36px;cursor:pointer}
.ps-form button:disabled{opacity:.45;cursor:not-allowed}
.ps-err{color:#F3A3A3;font-size:13px}
.ps-cal{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.ps-cal button{all:unset;cursor:pointer;background:var(--o-panel);border:1px solid var(--o-line);border-radius:8px;padding:8px 10px;display:grid;gap:2px;text-align:left}
.ps-cal button[aria-pressed="true"]{border-color:var(--o-amber)}
.ps-cal button:focus-visible{outline:2px solid var(--o-amber)}
.ps-cal b{font:700 15px var(--f-display)}
.ps-cal small{font:500 11px var(--f-mono);color:var(--o-muted)}
.ps-md{font-size:14px;line-height:1.55;overflow-x:auto}
.ps-md table{border-collapse:collapse;font-size:12.5px}
.ps-md th,.ps-md td{border:1px solid var(--o-line);padding:4px 6px;background:transparent;color:var(--o-ink)}
`;
  document.head.appendChild(css);

  /* ---------- panel genérico (mismo aspecto que los paneles del equipo) ---------- */
  let volver = null;
  function panel(id, titulo, sub) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div"); el.id = id; el.className = "gpanel"; el.hidden = true;
      el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", titulo);
      el.innerHTML = `<div class="gp-card" style="grid-template-rows:auto minmax(0,1fr)"><div class="gp-head"><div><b>${esc(titulo)}</b><span>${esc(sub)}</span></div><div class="gp-tools"><button type="button" class="openmap" data-cerrar style="margin:0">Cerrar</button></div></div><div class="eq-body"></div></div>`;
      el.addEventListener("click", e => { if (e.target === el || e.target.closest("[data-cerrar]")) cerrar(el); });
      el.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(el); });
      document.body.appendChild(el);
    }
    return el;
  }
  function abrir(el) { volver = document.activeElement; el.hidden = false; document.body.style.overflow = "hidden"; const b = el.querySelector("[data-cerrar]"); if (b) b.focus(); }
  function cerrar(el) { el.hidden = true; document.body.style.overflow = ""; if (volver && volver.focus) volver.focus(); }
  const body = el => el.querySelector(".eq-body");
  const tabs = (name, cur, list) => `<div class="ps-tabs" role="group" aria-label="Vista">${list.map(([k, t]) => `<button type="button" data-ps-tab="${name}:${k}" aria-pressed="${cur === k}">${esc(t)}</button>`).join("")}</div>`;

  // gráfico de líneas simple (valores por día; null = sin dato)
  function lineChart(dias, series, unidad, dec) {
    const W = 760, H = 280, L = 70, R = 18, T = 14, B = 32, all = series.flatMap(s => s.v).filter(v => v != null);
    if (!all.length) return `<p class="eq-note">Todavía no hay precios para graficar.</p>`;
    let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.12 || hi * 0.08 || 1; lo = Math.max(0, lo - pad); hi += pad;
    const X = i => L + (dias.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (dias.length - 1)), Y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    let g = "";
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = Y(v); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${C.line}"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" fill="${C.muted}" font-size="11" font-family="IBM Plex Mono">${unidad}${fmt(v, dec)}</text>`; }
    dias.forEach((d, i) => { if (dias.length <= 10 || i % Math.ceil(dias.length / 8) === 0 || i === dias.length - 1) g += `<text x="${X(i)}" y="${H - 10}" text-anchor="middle" fill="${C.muted}" font-size="11" font-family="IBM Plex Mono">${fechaCorta(d)}</text>`; });
    series.forEach(s => {
      let p = "", on = false; s.v.forEach((v, i) => { if (v == null) { on = false; return; } p += `${on ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; on = true; });
      if (s.dash) g += `<path d="${p}" fill="none" stroke="${s.col}" stroke-width="1.5" stroke-dasharray="5 5"/>`;
      else { g += `<path d="${p}" fill="none" stroke="${s.col}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`; s.v.forEach((v, i) => { if (v != null) g += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="4" fill="${s.col}" stroke="#1F2021" stroke-width="2"/>`; }); }
      const li = s.v.map((v, i) => v != null ? i : -1).filter(i => i >= 0).pop();
      if (li != null && !s.dash) g += `<text x="${Math.min(X(li) + 8, W - R - 2)}" y="${Y(s.v[li]) - 9}" text-anchor="${X(li) > W - 90 ? "end" : "start"}" fill="${C.ink}" font-size="12" font-family="IBM Plex Mono">${unidad}${fmt(s.v[li], dec)}</text>`;
    });
    return `<div class="ps-legend">${series.map(s => `<span><i style="background:${s.col}${s.dash ? ";height:2px;vertical-align:3px" : ""}"></i>${esc(s.lbl)}</span>`).join("")}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de precios por día">${g}</svg>`;
  }
  const avg = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

  /* =============== Rastreador eBay · historial de precios =============== */
  let ebSel = null;
  const diasEbay = () => [...new Set(D.movimientos.filter(m => m.tipo === "ebay").map(m => m.fecha))].sort();
  function ebHist(p) {
    const ds = diasEbay().filter(d => serieDia(p.name, "nuevo", d) != null || serieDia(p.name, "usado", d) != null);
    const nw = ds.map(d => serieDia(p.name, "nuevo", d)), us = ds.map(d => serieDia(p.name, "usado", d));
    return { ds, nw, us };
  }
  function ebResumen(p) {
    const { nw, us } = ebHist(p), hoyN = nw.filter(v => v != null).pop(), hoyU = us.filter(v => v != null).pop();
    const aN = avg(nw), aU = avg(us);
    return { hoyN, hoyU, aN, aU, dN: hoyN != null && aN ? hoyN / aN - 1 : null, dU: hoyU != null && aU ? hoyU / aU - 1 : null, minN: nw.some(v => v != null) ? Math.min(...nw.filter(v => v != null)) : null, minU: us.some(v => v != null) ? Math.min(...us.filter(v => v != null)) : null, dias: nw.length };
  }
  const vsChip = d => d == null ? `<span class="ps-chip c-mute">sin historial</span>` : Math.abs(d) < 0.02 ? `<span class="ps-chip c-mute">en su promedio</span>` : d < 0 ? `<span class="ps-chip c-good">${fmt(Math.abs(d * 100))} % más barato que su promedio</span>` : `<span class="ps-chip c-warn">${fmt(d * 100)} % más caro que su promedio</span>`;
  function renderEbay() {
    const el = panel("psEbay", "Rastreador eBay · historial de precios", "precio real con envío dentro de EE.UU. · vendedor en EE.UU. con ≥ 98 % de feedback");
    const p = P.find(x => x.name === ebSel) || P[0]; ebSel = p.name;
    const { ds, nw, us } = ebHist(p), r = ebResumen(p);
    const vend = o => o ? `${esc(String(o.note || "").split(";")[0])} · <a href="${esc(o.url)}" target="_blank" rel="noopener">ver en eBay</a>` : "sin anuncio";
    body(el).innerHTML = `
      <div class="ps-box"><h4>${esc(p.name)}</h4>
        ${lineChart(ds, [{ lbl: "Nuevo", col: C.nuevo, v: nw }, { lbl: "Usado", col: C.usado, v: us }, { lbl: "Promedio nuevo", col: C.nuevo, v: nw.map(() => r.aN), dash: 1 }], "$", 0)}</div>
      <div class="ps-kpis">
        <div class="ps-kpi"><span>Nuevo hoy</span><b>${usd(r.hoyN)}</b><small>mínimo visto ${usd(r.minN)}</small></div>
        <div class="ps-kpi"><span>Usado hoy</span><b>${usd(r.hoyU)}</b><small>mínimo visto ${usd(r.minU)}</small></div>
        <div class="ps-kpi"><span>¿Está barato hoy?</span><b style="font-size:16px">${vsChip(r.dN)}</b><small>nuevo · promedio ${usd(r.aN)} en ${r.dias} días</small></div>
      </div>
      <div class="ps-box"><h4>Vendedor más barato hoy</h4><p class="eq-note" style="margin:0 0 4px">Nuevo: ${vend(p.nw)}</p><p class="eq-note" style="margin:0">Usado: ${vend(p.us)}</p></div>
      <div class="eq-sec">Todos los productos · toca uno para ver su historial</div>
      <div class="ps-scroll"><table class="ps-t"><thead><tr><th>Producto</th><th class="n">Nuevo hoy</th><th class="n">Usado hoy</th><th>Frente a su promedio (nuevo)</th></tr></thead><tbody>
      ${P.map(q => { const x = ebResumen(q); return `<tr class="${q.name === p.name ? "best" : ""}" data-ps-eb="${esc(q.name)}" style="cursor:pointer" tabindex="0"><td>${esc(q.name)}</td><td class="n">${usd(x.hoyN)}</td><td class="n">${usd(x.hoyU)}</td><td>${vsChip(x.dN)}</td></tr>`; }).join("")}
      </tbody></table></div>
      <p class="eq-note">El historial sale de precios-eeuu.csv (una fila por día y producto). Cuando el precio baja 10 % o más de un día al otro, te llega una alerta por Telegram.</p>`;
    return el;
  }

  /* =============== WhatsApp · embudo de tiendas y agenda =============== */
  function embudo() {
    const T = D.tiendas, M = (D.mensajes || []).filter(m => m.canal === "whatsapp");
    const env = new Set(M.filter(m => m.direccion === "enviado").map(m => m.tienda)), rec = new Set(M.filter(m => m.direccion === "recibido").map(m => m.tienda));
    const precio = new Set(M.filter(m => m.direccion === "recibido" && /^s[ií]/i.test(m.con_precio || "")).map(m => m.tienda));
    const sinWa = T.filter(t => /sin whatsapp/i.test(t.estado));
    const contact = T.filter(t => env.has(t.tienda) || /esperando|respondi|sin stock|no vende|no sueltos|consultad/i.test(t.estado));
    const resp = T.filter(t => rec.has(t.tienda) || /respondi|sin stock|no vende|no sueltos/i.test(t.estado));
    const conP = T.filter(t => precio.has(t.tienda) || D.productos.some(p => p.local.some(l => l.src === "tienda" && String(l.vendedor).startsWith(t.tienda) && /WhatsApp/.test(l.vendedor))));
    return { total: T.length, sinWa: sinWa.length, contact: contact.length, resp: resp.length, conP: conP.length };
  }
  function renderWa() {
    const el = panel("psWa", "WhatsApp · embudo de tiendas", "armado con tiendas-cochabamba.csv, mensajes.csv y agenda.py · sin números ni chats (la página es pública)");
    const e = embudo(), A = D.agenda || {}, max = Math.max(1, e.total);
    const fila = (t, v, col, sub) => `<div class="r"><span>${esc(t)}${sub ? `<br><small style="color:var(--o-muted)">${esc(sub)}</small>` : ""}</span><div class="bar"><i style="width:${(v / max * 100).toFixed(1)}%;background:${col}"></i></div><b>${v}</b></div>`;
    const lista = (k, t, cls, f) => `<div class="ps-box"><h4><span class="ps-chip ${cls}">${(A[k] || []).length}</span> ${esc(t)}</h4>${(A[k] || []).length ? `<ul>${A[k].map(x => `<li>${esc(x.tienda)} <small>· ${esc(f(x))}</small></li>`).join("")}</ul>` : `<p class="eq-note">Ninguna.</p>`}</div>`;
    body(el).innerHTML = `
      <div class="ps-kpis">
        <div class="ps-kpi"><span>Tasa de respuesta</span><b>${e.contact ? fmt(e.resp / e.contact * 100) + " %" : "—"}</b><small>${e.resp} de ${e.contact} contactadas</small></div>
        <div class="ps-kpi"><span>Dieron precio</span><b>${e.conP}</b><small>de ${e.resp} que respondieron</small></div>
        <div class="ps-kpi"><span>Toca seguimiento hoy</span><b style="color:${C.amber}">${(A.seguimiento || []).length}</b><small>uno corto por tienda</small></div>
        <div class="ps-kpi"><span>Revisar respuestas</span><b style="color:${C.blue}">${(A.responder || []).length}</b><small>escribieron después de nosotros</small></div>
      </div>
      <div class="ps-box"><h4>Embudo</h4><div class="ps-funnel">
        ${fila("En la lista", e.total, "#454649", `${e.sinWa} sin WhatsApp`)}${fila("Contactadas", e.contact, C.nuevo)}${fila("Respondieron", e.resp, C.amber)}${fila("Dieron precio", e.conP, C.green)}
      </div></div>
      <div class="eq-sec">Agenda de hoy (${A.hoy ? fechaCorta(A.hoy) : "—"}) · un seguimiento cada 2 días como máximo; después de 2 sin respuesta la tienda queda fría</div>
      <div class="ps-agenda">
        ${lista("responder", "Revisar y responder", "c-info", x => x.motivo || "")}
        ${lista("seguimiento", "Seguimiento hoy", "c-warn", x => `${x.dias_sin_respuesta} días sin respuesta${x.seguimientos ? ` · ${x.seguimientos} seguimiento ya` : ""}`)}
        ${lista("esperar", "Esperar", "c-mute", x => `próximo el ${fechaCorta(x.proximo)}`)}
        ${lista("frias", "Frías", "c-bad", x => x.motivo || "")}
      </div>
      <p class="eq-note">El agente WhatsApp corre <code>python3 agenda.py</code> al empezar cada ronda y sigue esta lista; así ninguna tienda se olvida y ninguna recibe mensajes de más.</p>`;
    return el;
  }

  /* =============== Analista · desglose, calculadora de caja y precio sugerido =============== */
  let anaTab = "desglose", cajaSel = null, cajaG = null;
  function renderAna() {
    const el = panel("psAna", "Analista", `costo puesto en Cochabamba · ${S.qty} unidades por pedido · ${fmt(tc(), 2)} Bs/USD (se cambia en la tabla de abajo)`);
    const t = tabs("ana", anaTab, [["desglose", "Desglose del costo"], ["caja", "Calculadora de caja"], ["precio", "Precio de venta sugerido"]]);
    body(el).innerHTML = t + (anaTab === "caja" ? htmlCaja() : anaTab === "precio" ? htmlPrecio() : htmlDesglose());
    return el;
  }
  function htmlDesglose() {
    const rows = P.map(p => ({ p, c: calc(p) })).filter(r => r.c.cost != null).sort((a, b) => (b.c.margin ?? -9) - (a.c.margin ?? -9));
    const max = Math.max(...rows.map(r => Math.max(r.c.cost, r.c.local || 0))) * 1.42 || 1, W = v => (v / max * 100).toFixed(2) + "%";
    return `<div class="ps-box"><h4>¿Por qué conviene o no?</h4>
      <div class="ps-legend" style="margin-bottom:10px"><span><i style="background:${C.nuevo}"></i>eBay (con envío en EE.UU.)</span><span><i style="background:${C.amber}"></i>Courier</span><span><i style="background:${C.red}"></i>Aduana</span><span><i style="background:#EDEDEE;width:3px"></i>Mejor precio en Cochabamba</span></div>
      <div class="ps-stack">${rows.map(({ p, c }) => {
        const e = c.base * tc(), s = c.ship * tc(), a = c.aduUsd * tc(), col = c.status === "good" ? C.green : c.status === "warn" ? C.amber : C.red;
        return `<div class="row"><span title="${esc(p.name)}">${esc(p.name)}</span><div class="track" role="img" aria-label="${esc(p.name)}: eBay Bs ${fmt(e)}, courier Bs ${fmt(s)}, aduana Bs ${fmt(a)}, costo Bs ${fmt(c.cost)}, local ${c.local == null ? "sin dato" : "Bs " + fmt(c.local)}">
          <div class="seg" style="left:0;width:${W(e)};background:${C.nuevo};border-radius:5px 0 0 5px"></div>
          <div class="seg" style="left:${W(e)};width:${W(s)};background:${C.amber}"></div>
          <div class="seg" style="left:${W(e + s)};width:${W(a)};background:${C.red}"></div>
          ${c.local != null ? `<div class="mark" style="left:${W(c.local)}"></div>` : ""}
          <div class="lbl" style="left:calc(${W(Math.max(c.cost, c.local || 0))} + 8px);color:${c.local == null ? C.muted : col}">${c.local == null ? `costo ${bs(c.cost)} · sin precio local` : `${pct(c.margin)} · ${c.gain >= 0 ? "+" : "−"}Bs ${fmt(Math.abs(c.gain))}/u`}</div>
        </div></div>`; }).join("")}</div>
      <p class="eq-note" style="margin-top:12px">Cada barra es el costo puesto por unidad (eBay ${S.mode === "used" ? "usado" : S.mode === "min" ? "más barato" : "nuevo"}, courier más barato para ${S.qty} unidades y aduana ${fmt((+$("adu").value || 0))} %). La raya blanca es el mejor precio que cuenta en Cochabamba: si la barra termina antes de la raya, hay ganancia.</p></div>
      <div class="ps-scroll"><table class="ps-t"><thead><tr><th>Producto</th><th class="n">eBay</th><th class="n">Courier</th><th class="n">Aduana</th><th class="n">Costo puesto</th><th class="n">Local</th><th class="n">Ganancia/u</th></tr></thead><tbody>
      ${rows.map(({ p, c }) => `<tr><td>${esc(p.name)} <small style="color:var(--o-muted)">${c.useA ? "A" : `B ${fmt(c.b.kg, 1)} kg`}</small></td><td class="n">${bs(c.base * tc())}</td><td class="n">${bs(c.ship * tc())}</td><td class="n">${bs(c.aduUsd * tc())}</td><td class="n"><b>${bs(c.cost)}</b></td><td class="n">${bs(c.local)}</td><td class="n ${c.gain == null ? "" : c.gain >= 0 ? "ps-pos" : "ps-neg"}">${c.gain == null ? "—" : (c.gain >= 0 ? "+" : "−") + fmt(Math.abs(c.gain))}</td></tr>`).join("")}</tbody></table></div>`;
  }
  // Courier B: USD 28/kg de la caja completa (productos + 300 g de caja exterior), mínimo 1 kg y de 0,5 en 0,5 kg
  const kgB = g => Math.max(1, Math.ceil(g / 500 - 1e-9) / 2);
  function htmlCaja() {
    const p = P.find(x => x.name === cajaSel) || (ranking[0] && ranking[0].p) || P[0]; cajaSel = p.name;
    const g = cajaG || p.g || 350, tax = (+$("tax").value || 0) / 100, o = p.nw || p.us, precio = o ? o.usd : 0;
    const filas = [];
    for (let n = 1; n <= 8; n++) {
      const peso = g * n + 300, kg = kgB(peso), env = kg * 28, per = env / n, libre = kg * 1000 - peso, a = 10 + precio * tax;
      filas.push({ n, peso, kg, env, per, libre, a, entra: Math.floor(libre / g) });
    }
    const mejor = filas.reduce((m, f) => f.per < m.per - 1e-9 ? f : m, filas[0]);
    const dulces = filas.filter(f => f.entra === 0 && f.n > 1).slice(0, 4);
    return `<div class="ps-box"><div class="ps-form">
        <label>Producto<select data-ps-caja="prod">${P.map(q => `<option ${q.name === p.name ? "selected" : ""}>${esc(q.name)}</option>`).join("")}</select></label>
        <label>Peso con su caja (g)<input type="number" min="50" step="10" data-ps-caja="g" value="${g}" style="max-width:120px"></label>
      </div>
      <p class="eq-note" style="margin-top:10px">El courier B cobra la caja completa: productos + 300 g de caja exterior y relleno, mínimo 1 kg y después de medio en medio kilo. Hay cantidades que pagan el medio kilo justo y otras donde sobra lugar: si sobra para otra unidad, conviene sumarla.</p></div>
      <div class="ps-kpis">
        <div class="ps-kpi"><span>Más barato por unidad (hasta 8)</span><b>${mejor.n} unidades</b><small>${usd(mejor.per)} c/u · ${fmt(mejor.kg, 1)} kg · Bs ${fmt(mejor.per * tc())} c/u</small></div>
        <div class="ps-kpi"><span>Cantidades que aprovechan la caja</span><b style="font-size:20px">${dulces.map(f => f.n).join(" · ") || "—"}</b><small>no sobra lugar para otra unidad sin subir de medio kilo</small></div>
        <div class="ps-kpi"><span>Courier A (10 + tax)</span><b>${usd(filas[0].a)}</b><small>por unidad, cualquier cantidad</small></div>
      </div>
      <div class="ps-scroll"><table class="ps-t"><thead><tr><th class="n">Unidades</th><th class="n">Peso caja</th><th class="n">Kg cobrados</th><th class="n">Envío B total</th><th class="n">B por unidad</th><th class="n">Bs por unidad</th><th>¿Sobra lugar?</th><th>Mejor courier</th></tr></thead><tbody>
      ${filas.map(f => `<tr class="${f === mejor ? "best" : ""}"><td class="n">${f.n}</td><td class="n">${fmt(f.peso)} g</td><td class="n">${fmt(f.kg, 1)}</td><td class="n">${usd(f.env)}</td><td class="n"><b>${usd(f.per)}</b></td><td class="n">${bs(f.per * tc())}</td><td>${f.entra ? `<span class="ps-chip c-good">entra${f.entra > 1 ? `n ${f.entra}` : ""} ${f.entra > 1 ? "más" : "1 más"} gratis</span>` : `<span class="ps-chip c-mute">justo</span>`} <small style="color:var(--o-muted)">${fmt(f.libre)} g libres</small></td><td>${f.per <= f.a ? `<span class="ps-chip c-info">B</span>` : `<span class="ps-chip c-warn">A · ${usd(f.a)}</span>`}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="eq-note">Para mezclar productos distintos en una misma caja usa el Simulador de pedido (botón arriba en la barra de la oficina).</p>`;
  }
  // precio sugerido: un poco debajo de la tienda o anuncio más barato que cuenta, sin bajar de costo + 10 %
  const BAJO_LOCAL = 0.05, MIN_MARGEN = 0.10;
  function sugerido(p) {
    const c = calc(p); if (c.cost == null || c.local == null) return { c };
    const techo = Math.floor(c.local * (1 - BAJO_LOCAL) / 10) * 10, piso = Math.ceil(c.cost * (1 + MIN_MARGEN) / 10) * 10;
    const ok = techo >= piso, precio = ok ? techo : null;
    return { c, techo, piso, ok, precio, gan: ok ? precio - c.cost : null, mg: ok ? (precio - c.cost) / precio : null };
  }
  function htmlPrecio() {
    const rows = P.map(p => ({ p, s: sugerido(p) })).sort((a, b) => (b.s.mg ?? -9) - (a.s.mg ?? -9));
    return `<p class="eq-note">Precio sugerido = ${fmt(BAJO_LOCAL * 100)} % debajo del precio más barato que cuenta en Cochabamba (redondeado a Bs 10), siempre que deje al menos ${fmt(MIN_MARGEN * 100)} % de ganancia sobre el costo puesto. Así vendes más barato que todas las tiendas y igual ganas. Es una guía: el precio final lo decides tú.</p>
      <div class="ps-scroll"><table class="ps-t"><thead><tr><th>Producto</th><th class="n">Costo puesto</th><th class="n">Más barato en Cbba</th><th class="n">Precio sugerido</th><th class="n">Ganancia/u</th><th class="n">Margen</th><th>Lectura</th></tr></thead><tbody>
      ${rows.map(({ p, s }) => { const c = s.c, quien = c.local != null ? (minOf(refs(p)) || {}).vendedor : "";
        const lect = c.cost == null ? `<span class="ps-chip c-mute">sin precio eBay</span>` : c.local == null ? `<span class="ps-chip c-mute">falta precio local</span>` : s.ok ? `<span class="ps-chip ${s.mg >= .15 ? "c-good" : "c-warn"}">${s.mg >= .15 ? "buena venta" : "venta justa"}</span>` : `<span class="ps-chip c-bad">no da: costo + 10 % (Bs ${fmt(s.piso)}) supera al local</span>`;
        return `<tr><td>${esc(p.name)}</td><td class="n">${bs(c.cost)}</td><td class="n">${bs(c.local)}${quien ? `<br><small style="color:var(--o-muted)">${esc(String(quien).slice(0, 34))}</small>` : ""}</td><td class="n"><b>${s.ok ? bs(s.precio) : "—"}</b></td><td class="n ${s.gan > 0 ? "ps-pos" : ""}">${s.gan == null ? "—" : "+" + fmt(s.gan)}</td><td class="n">${s.mg == null ? "—" : fmt(s.mg * 100) + " %"}</td><td>${lect}</td></tr>`; }).join("")}
      </tbody></table></div>`;
  }

  /* =============== Informe diario · lector de informes =============== */
  let infSel = null;
  function renderNube() {
    const el = panel("psNube", "Informe diario · lector de informes", "los informes que escribe la rutina de la nube cada mañana (informes/AAAA-MM-DD.md)");
    const infs = D.documentos.filter(d => /^inf-/.test(d.id)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const d = infs.find(x => x.id === infSel) || infs[0]; if (d) infSel = d.id;
    const gerente = (D.informes_gerente || []).slice().reverse();
    const dia = f => new Date(f + "T12:00:00").toLocaleDateString("es-BO", { weekday: "short" });
    body(el).innerHTML = infs.length ? `<div class="ps-cal" role="group" aria-label="Días con informe">${infs.map(x => `<button type="button" data-ps-inf="${esc(x.id)}" aria-pressed="${x.id === infSel}"><b>${fechaCorta(x.fecha)}</b><small>${esc(dia(x.fecha))}</small></button>`).join("")}</div>
      <div class="ps-box"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:baseline"><h4 style="margin:0">${esc(d.titulo)}</h4><a href="${esc(d.url)}" target="_blank" rel="noopener" style="font:600 12px var(--f-mono)">Abrir en GitHub</a></div>
      <div class="ps-md">${d.md ? md(d.md) : `<p>${esc(d.nota || "")}</p>`}</div></div>
      ${gerente.length ? `<div class="ps-box"><h4>Informes del Gerente (20:00)</h4><ul style="margin:0;padding-left:18px">${gerente.map(g => `<li><a href="${esc(g.url)}" target="_blank" rel="noopener">${fechaCorta(g.fecha)} · ${esc(g.tipo)}</a></li>`).join("")}</ul></div>` : ""}`
      : `<p class="eq-note">Todavía no hay informes. La rutina de la nube escribe uno cada mañana a las 7:52.</p>`;
    return el;
  }

  /* =============== Finanzas e inventario · plata, stock y ventas =============== */
  let db = null, owner = false;
  (async () => { try { if (!window.claude || !window.claude.use) return; const [d, u] = await Promise.all([window.claude.use("db"), window.claude.use("user")]); db = d; owner = u ? !!(await u.isOwner()) : false; const f = document.getElementById("psFin"); if (f && !f.hidden) renderFin(); } catch (e) { } })();
  function renderFin() {
    const el = panel("psFin", "Finanzas e inventario · plata y stock", "pedidos.csv (sin los de prueba), ventas.csv y el dólar de cada compra · solo totales");
    const F = D.finanzas || {}, V = D.ventas || [], prods = F.productos || [];
    const kp = (t, v, s, col) => `<div class="ps-kpi"><span>${t}</span><b ${col ? `style="color:${col}"` : ""}>${v}</b><small>${s}</small></div>`;
    const cols = prods.length ? Object.keys(prods[0]).filter(k => k !== "producto" && typeof prods[0][k] !== "object") : [];
    const lab = { comprado: "Comprado", en_camino: "En camino", en_stock: "En stock", vendido: "Vendido", costo_bs: "Costo Bs", ventas_bs: "Ventas Bs", ganancia_bs: "Ganancia Bs", costo_vendido_bs: "Costo vendido Bs", unidades_con_costo: "U. con costo" };
    body(el).innerHTML = `<div class="ps-kpis">
        ${kp("Invertido", bs(F.invertido_bs), `${F.unidades_compradas || 0} unidades compradas`)}
        ${kp("En camino", `${F.unidades_en_camino || 0} u`, "comprado, todavía no llegó")}
        ${kp("En stock", `${F.unidades_en_stock || 0} u`, `valor ${bs(F.valor_stock_bs)}`)}
        ${kp("Vendido", bs(F.ventas_bs), `${F.unidades_vendidas || 0} unidades`)}
        ${kp("Ganancia real", F.ganancia_bs == null ? "—" : `${F.ganancia_bs >= 0 ? "+" : "−"}Bs ${fmt(Math.abs(F.ganancia_bs))}`, F.ganancia_bs == null ? "aparece con la primera venta" : "ventas − costo de lo vendido", F.ganancia_bs == null ? null : F.ganancia_bs >= 0 ? C.green : C.red)}
      </div>
      ${F.hay_datos ? "" : `<p class="eq-note">Todavía no hay compras ni ventas del negocio (los pedidos de prueba no cuentan). Con el primer pedido real se arma el inventario, y con la primera venta, la ganancia real.</p>`}
      ${prods.length ? `<div class="ps-scroll"><table class="ps-t"><thead><tr><th>Producto</th>${cols.map(k => `<th class="n">${esc(lab[k] || k)}</th>`).join("")}</tr></thead><tbody>${prods.map(x => `<tr><td>${esc(x.producto)}</td>${cols.map(k => `<td class="n">${typeof x[k] === "number" ? fmt(x[k]) : esc(x[k] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
      ${(F.compras_conjuntas || []).map(c => `<div class="ps-box"><h4>${esc(c.producto)} · compra conjunta</h4>
        <div class="ps-kpis">
          ${kp("Nuestro costo por unidad", bs(c.nuestro_costo_unitario_bs), `${c.nuestras_unidades} u, todo incluido`)}
          ${kp("Promedio del pedido conjunto", bs(c.promedio_conjunto_bs), `${c.unidades_pedido_conjunto} u · USD ${fmt(c.promedio_conjunto_usd)} c/u · dólar ${c.tc}`)}
          ${kp("Diferencia", `${c.diferencia_bs >= 0 ? "+" : "−"}Bs ${fmt(Math.abs(c.diferencia_bs))}`, `${c.diferencia_pct >= 0 ? "+" : ""}${c.diferencia_pct} % sobre el promedio`, c.diferencia_bs > 0 ? C.red : C.green)}
        </div><p class="eq-note">${esc(c.fuente)}</p></div>`).join("")}
      <div class="ps-box"><h4>Registro de ventas</h4>
        ${V.length ? `<div class="ps-scroll"><table class="ps-t"><thead><tr><th>Fecha</th><th>Producto</th><th class="n">Cant.</th><th class="n">Precio c/u</th><th class="n">Total</th><th>Anotada por</th></tr></thead><tbody>${V.slice().reverse().map(v => `<tr><td>${fechaCorta(v.fecha)}</td><td>${esc(v.producto)}</td><td class="n">${esc(v.cantidad)}</td><td class="n">${bs(+v.precio_bs)}</td><td class="n">${bs(+v.precio_bs * +v.cantidad)}</td><td>${esc(v.canal)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="eq-note">Sin ventas todavía.</p>`}
        <p class="eq-note" style="margin-top:10px">Cuando vendas algo, anótalo de una de estas formas:</p>
        <ul class="eq-note" style="margin:4px 0 10px;padding-left:18px"><li>Por Telegram al Gerente: <code>venta: 2 Ryzen 5 7600 a 2800</code> (precio por unidad; agrega "total" si es el total).</li><li>Aquí abajo, si abriste la oficina con tu cuenta. Se pasa a ventas.csv en la próxima ronda.</li></ul>
        <form class="ps-form" id="psVentaF" novalidate>
          <label>Producto<select id="psVProd">${P.map(p => `<option>${esc(p.name)}</option>`).join("")}</select></label>
          <label>Cantidad<input id="psVCant" type="number" min="1" step="1" value="1" style="max-width:90px"></label>
          <label>Precio por unidad (Bs)<input id="psVPrecio" type="number" min="1" step="10" placeholder="2800" style="max-width:140px"></label>
          <button type="submit" ${owner ? "" : "disabled"}>Anotar venta</button>
        </form>
        <p class="ps-err" id="psVErr" role="alert">${owner ? "" : "Solo Santi puede anotar ventas desde aquí (abre la oficina con su cuenta). Por Telegram funciona siempre."}</p>
      </div>`;
    return el;
  }
  document.addEventListener("submit", async e => {
    if (e.target.id !== "psVentaF") return; e.preventDefault();
    const err = $("psVErr"), cant = Math.round(+$("psVCant").value), precio = +$("psVPrecio").value;
    if (!owner || !db) { err.textContent = "Solo Santi puede anotar ventas desde aquí. Usa Telegram: venta: 2 Ryzen 5 7600 a 2800"; return; }
    if (!(cant >= 1)) { err.textContent = "Pon una cantidad de 1 o más."; return; }
    if (!(precio > 0)) { err.textContent = "Pon el precio por unidad en bolivianos."; return; }
    const d = new Date(), p2 = n => String(n).padStart(2, "0"), id = `venta-${d.getTime().toString(36)}`;
    try {
      await db.collection("decisiones").doc(id).set({ tipo: "venta", producto: $("psVProd").value, cantidad: cant, precio_bs: precio, fecha: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, hora: `${p2(d.getHours())}:${p2(d.getMinutes())}`, aplicado: false });
      err.style.color = "#8FE3B5"; err.textContent = `Venta anotada: ${cant} × ${$("psVProd").value} a Bs ${fmt(precio)}. Entra a ventas.csv en la próxima ronda.`;
      $("psVPrecio").value = "";
    } catch (x) { err.style.color = ""; err.textContent = "No se pudo guardar. Prueba de nuevo en un rato o anótala por Telegram."; }
  });

  /* =============== Analista de demanda · qué se busca =============== */
  function renderDem() {
    const el = panel("psDem", "Analista de demanda · qué se busca", "anuncios de Marketplace en Cochabamba por producto y cuáles desaparecen (se venden o los quitan) · demanda.csv");
    const DM = D.demanda || {}, ps = DM.productos || [];
    const cols = ps.length ? Object.keys(ps[0]).filter(k => !["producto", "lectura", "vigilado"].includes(k) && typeof ps[0][k] !== "object") : [];
    const chip = l => /candidato|r[aá]pido|se vende/i.test(l) ? "c-good" : /poco|lento|baja/i.test(l) ? "c-bad" : "c-info";
    const max = Math.max(1, ...ps.map(x => +x.anuncios_prom || 0));
    body(el).innerHTML = DM.hay_datos ? `<p class="eq-note">${DM.dias} días con datos. Más anuncios = más oferta; muchos que desaparecen = se vende rápido.</p>
      <div class="ps-box"><h4>Anuncios promedio por producto</h4><div class="ps-funnel">${ps.slice(0, 14).map(x => `<div class="r"><span>${esc(x.producto)}${x.vigilado ? "" : " · candidato"}</span><div class="bar"><i style="width:${((+x.anuncios_prom || 0) / max * 100).toFixed(1)}%;background:${C.nuevo}"></i></div><b>${fmt(+x.anuncios_prom || 0)}</b></div>`).join("")}</div></div>
      <div class="ps-scroll"><table class="ps-t"><thead><tr><th>Producto</th>${cols.map(k => `<th class="n">${esc(k.replace(/_/g, " "))}</th>`).join("")}<th>Lectura</th></tr></thead><tbody>${ps.map(x => `<tr><td>${esc(x.producto)}</td>${cols.map(k => `<td class="n">${typeof x[k] === "number" ? fmt(x[k], 1) : esc(x[k] ?? "—")}</td>`).join("")}<td><span class="ps-chip ${chip(x.lectura || "")}">${esc(x.lectura || "")}</span></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="ps-box"><h4>Todavía sin datos</h4><p class="eq-note">En cada ronda, Marketplace cuenta cuántos anuncios hay de cada producto en Cochabamba y cuáles desaparecieron desde la vez anterior. Con 3 días de datos ya se puede leer qué se mueve rápido.</p>
        ${(DM.vigilados_sin_dato || []).length ? `<p class="eq-note">Productos que se van a medir: ${esc(DM.vigilados_sin_dato.join(" · "))}.</p>` : ""}</div>`;
    return el;
  }

  /* ---------- entrada: botón en el panel del agente y segundo toque en el 3D ---------- */
  const SCREENS = { ebay: ["historial de precios", renderEbay], wa: ["embudo y agenda", renderWa], ana: ["costos, caja y precio sugerido", renderAna], nube: ["lector de informes", renderNube], fin: ["plata, stock y ventas", renderFin], dem: ["qué se busca", renderDem] };
  window.tienePantalla = id => !!SCREENS[id];
  window.abrirPantalla = id => { if (SCREENS[id]) abrir(SCREENS[id][1]()); };
  const _draw = drawDrawer;
  drawDrawer = function () {
    _draw();
    if (!SCREENS[sel]) return;
    const b = document.createElement("div");
    b.innerHTML = `<button type="button" class="openmap" data-ps-open="${esc(sel)}">Abrir pantalla · ${esc(SCREENS[sel][0])}</button>`;
    $("dBody").prepend(b);
  };
  document.addEventListener("click", e => {
    const o = e.target.closest("[data-ps-open]"); if (o) { window.abrirPantalla(o.dataset.psOpen); return; }
    const t = e.target.closest("[data-ps-tab]"); if (t) { const [n, k] = t.dataset.psTab.split(":"); if (n === "ana") { anaTab = k; renderAna(); } return; }
    const r = e.target.closest("[data-ps-eb]"); if (r) { ebSel = r.dataset.psEb; renderEbay(); body(document.getElementById("psEbay")).scrollTop = 0; return; }
    const i = e.target.closest("[data-ps-inf]"); if (i) { infSel = i.dataset.psInf; renderNube(); }
  });
  document.addEventListener("keydown", e => { const r = e.target.closest && e.target.closest("[data-ps-eb]"); if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); r.click(); } });
  document.addEventListener("change", e => {
    const k = e.target.dataset && e.target.dataset.psCaja; if (!k) return;
    if (k === "prod") { cajaSel = e.target.value; cajaG = null; } else cajaG = Math.max(50, +e.target.value || 350);
    renderAna(); const n = document.querySelector(`#psAna [data-ps-caja="${k}"]`); if (n) n.focus();
  });
})();
