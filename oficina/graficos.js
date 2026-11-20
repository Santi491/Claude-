/* Gráficos del negocio (Santi, 20/11): los mismos de la app de iPhone. Ventas y ganancia, stock, anuncios de Marketplace,
   precio contra la competencia, cuánto tardó cada envío, mapa de oportunidades, precios de Cochabamba, embudo de tiendas
   (cada paso abre la lista) y en qué se va la plata de cada unidad. Uno por producto y uno por anuncio.
   Datos: window.GRAF (oficina/graficos-datos.js, lo arma app_datos.py con lo mismo que ve la app). */
(function () {
  const G = window.GRAF; if (!G) return;
  const C = { br: "#C9A45C", verde: "#5CD69A", ambar: "#F2A541", rojo: "#F07A7A", gris: "#92959A", ink: "#E3E4E6", line: "#333437", azul: "#6E9BEF", panel: "#1F2021" };
  const f0 = n => n == null || isNaN(n) ? "—" : Math.round(n).toLocaleString("es-BO");
  const bs = n => n == null || isNaN(n) ? "—" : (n < 0 ? "−" : "") + "Bs " + f0(Math.abs(n));
  const pct = n => n == null || isNaN(n) ? "—" : n.toLocaleString("es-BO", { maximumFractionDigits: 1 }) + " %";
  const mil = n => Math.abs(n) >= 1000 ? (n / 1000).toLocaleString("es-BO", { maximumFractionDigits: 1 }) + "k" : f0(n);
  const e = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "";
  const HOY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
  const dias = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const sumar = (s, n) => new Date(new Date(s + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
  const num = s => { const v = parseFloat(String(s ?? "").replace(",", ".").replace(/[^0-9.]/g, "")); return isNaN(v) ? null : v; };
  const mediana = v => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const corto = p => { let x = p; [["Ryzen 9 ", "R9 "], ["Ryzen 7 ", "R7 "], ["Ryzen 5 ", "R5 "], ["Intel Core ", ""], ["Corsair Vengeance RGB ", ""], ["SSD NVMe ", "SSD "]].forEach(([a, b]) => x = x.split(a).join(b)); return x.length > 16 ? x.slice(0, 15) + "…" : x; };

  /* ---------- cuentas (igual que la app) ---------- */
  const reales = (G.pedidos || []).filter(p => !p.prueba && !String(p.id).startsWith("prueba"));
  const comprados = [...new Set(reales.map(p => p.producto))].sort();
  const unidades = p => reales.filter(x => x.producto === p).reduce((s, x) => s + x.cantidad, 0);
  const fin = p => (G.finanzas_productos || []).find(x => x.producto === p) || {};
  function costoUnit(p) {
    const l = reales.filter(x => x.producto === p && x.costo_unit_bs != null), u = l.reduce((s, x) => s + x.cantidad, 0);
    return u ? l.reduce((s, x) => s + x.costo_unit_bs * x.cantidad, 0) / u : fin(p).costo_unitario_bs ?? null;
  }
  const invertido = p => (costoUnit(p) || 0) * unidades(p);
  const ventasDe = p => (G.ventas || []).filter(v => v.producto === p).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const cuantas = (p, est) => ventasDe(p).filter(v => v.estado === est).reduce((s, v) => s + v.cantidad, 0);
  const enCbba = p => reales.filter(x => x.producto === p && x.etapa >= 5).reduce((s, x) => s + x.cantidad, 0);
  function llegada(p) {
    const l = reales.filter(x => x.producto === p && x.etapa >= 5); if (!l.length) return null;
    const ev = l.flatMap(x => x.eventos).filter(v => /cochabamba/i.test(v.lugar)).map(v => v.fecha).sort();
    return ev[0] || l.map(x => (x.actualizado || "").slice(0, 10)).sort()[0];
  }
  const ganancia = (v, c) => v.precio_bs == null || c == null ? null : (v.precio_bs - c) * v.cantidad - (v.comision_bs || 0);
  const anaNuevo = p => (G.productos || []).find(x => x.producto === p && x.condicion === "nuevo");
  function precioNuestro(p) {
    const u = (G.publicaciones || []).filter(x => x.producto === p && x.precio_bs).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)).pop();
    if (u && num(u.precio_bs)) return [num(u.precio_bs), "nosotros"];
    const a = anaNuevo(p); return a && a.sugerido_bs ? [a.sugerido_bs, "sugerido"] : null;
  }
  const paquetes = (() => { const v = new Set(); return reales.filter(p => { const k = p.producto + p.fecha_compra + p.estado; if (v.has(k)) return false; v.add(k); return true; }); })();

  /* ---------- piezas de dibujo (SVG) ---------- */
  const TIPS = {}; let nTip = 0;
  // barras + línea por día, con tooltip
  function svgDias(pts, o) {
    const W = 760, H = o.alto || 260, L = 54, R = 14, T = 16, B = 30, id = "gt" + (++nTip);
    const vals = pts.flatMap(p => [p.barra || 0, p.linea]).filter(v => v != null);
    let lo = Math.min(0, ...vals), hi = Math.max(o.minHi ?? 1000, ...vals) * 1.1;
    const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))), k = v / p; return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 2.5 ? 2.5 : k <= 5 ? 5 : 10) * p; };
    const pasoN = nice((hi - lo) / 4); lo = Math.floor(lo / pasoN) * pasoN; hi = Math.ceil(hi / pasoN) * pasoN;
    const X = i => L + (pts.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (pts.length - 1)), Y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo)), bw = Math.max(6, Math.min(26, (W - L - R) / pts.length * 0.5));
    let g = "";
    for (let v = lo; v <= hi + 1e-6; v += pasoN) { const y = Y(v); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${C.line}"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" fill="${C.gris}" font-size="11" font-family="IBM Plex Mono">${mil(v)}</text>`; }
    const cada = Math.max(1, Math.ceil(pts.length / 7));
    pts.forEach((p, i) => { if (i % cada === 0 || i === pts.length - 1) g += `<text x="${X(i)}" y="${H - 9}" text-anchor="middle" fill="${C.gris}" font-size="11" font-family="IBM Plex Mono">${dm(p.fecha)}</text>`; });
    if (o.cero) g += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.gris}" stroke-dasharray="4 4"/><text x="${L + 4}" y="${Y(0) - 5}" fill="${C.gris}" font-size="11">${e(o.cero)}</text>`;
    pts.forEach((p, i) => { if (p.barra) g += `<rect x="${X(i) - bw / 2}" y="${Math.min(Y(p.barra), Y(0))}" width="${bw}" height="${Math.abs(Y(0) - Y(p.barra))}" rx="3" fill="${o.colBarra || C.br}" opacity=".45"/>`; });
    let d = ""; pts.forEach((p, i) => { if (p.linea != null) d += `${d ? "L" : "M"}${X(i).toFixed(1)},${Y(p.linea).toFixed(1)}`; });
    if (o.area && d) g += `<path d="${d}L${X(pts.length - 1)},${Y(Math.max(lo, 0))}L${X(0)},${Y(Math.max(lo, 0))}Z" fill="${o.colLinea}" opacity=".14"/>`;
    g += `<path d="${d}" fill="none" stroke="${o.colLinea || C.verde}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (o.bandera != null) g += `<text x="${X(o.bandera)}" y="${Y(pts[o.bandera].linea) - 8}" text-anchor="middle" font-size="16">🏁</text>`;
    g += `<line class="gx" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="${C.gris}" stroke-dasharray="3 3" visibility="hidden"/><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>`;
    TIPS[id] = { pts, X, W, L, R, txt: o.tip };
    return `<div class="gn-chart"><svg viewBox="0 0 ${W} ${H}" data-gtip="${id}" role="img" aria-label="${e(o.aria || "gráfico por día")}">${g}</svg><div class="gr-tip"></div></div>`;
  }
  document.addEventListener("pointermove", ev => {
    const svg = ev.target.closest && ev.target.closest("svg[data-gtip]"); const all = document.querySelectorAll("#pNeg .gr-tip");
    if (!svg) { all.forEach(t => t.style.display = "none"); document.querySelectorAll("#pNeg .gx").forEach(x => x.setAttribute("visibility", "hidden")); return; }
    const t = TIPS[svg.dataset.gtip], r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) / r.width * t.W;
    const i = t.pts.length === 1 ? 0 : Math.max(0, Math.min(t.pts.length - 1, Math.round((sx - t.L) / ((t.W - t.L - t.R) / (t.pts.length - 1)))));
    const ln = svg.querySelector(".gx"); ln.setAttribute("x1", t.X(i)); ln.setAttribute("x2", t.X(i)); ln.setAttribute("visibility", "visible");
    const tip = svg.parentElement.querySelector(".gr-tip"); tip.innerHTML = t.txt(t.pts[i]); tip.style.display = "block";
    const box = svg.parentElement.getBoundingClientRect(); let left = ev.clientX - box.left + 14; if (left + 210 > box.width) left = ev.clientX - box.left - 220;
    tip.style.left = left + "px"; tip.style.top = (ev.clientY - box.top + 12) + "px";
  });
  function dona(partes, centro, sub) {
    const tot = partes.reduce((s, p) => s + p.v, 0) || 1, R = 52, r = 36; let a = -Math.PI / 2, g = "";
    partes.filter(p => p.v > 0).forEach(p => {
      const b = a + p.v / tot * Math.PI * 2 - 0.04, big = b - a > Math.PI ? 1 : 0, P = (rad, an) => `${60 + rad * Math.cos(an)},${60 + rad * Math.sin(an)}`;
      g += partes.filter(x => x.v > 0).length === 1 ? `<circle cx="60" cy="60" r="${(R + r) / 2}" fill="none" stroke="${p.c}" stroke-width="${R - r}"/>`
        : `<path d="M${P(R, a)}A${R},${R} 0 ${big} 1 ${P(R, b)}L${P(r, b)}A${r},${r} 0 ${big} 0 ${P(r, a)}Z" fill="${p.c}"/>`;
      a = b + 0.04;
    });
    return `<svg viewBox="0 0 120 120" class="gn-dona" aria-hidden="true">${g}<text x="60" y="62" text-anchor="middle" fill="${C.ink}" font-size="26" font-weight="700">${centro}</text><text x="60" y="80" text-anchor="middle" fill="${C.gris}" font-size="10">${sub}</text></svg>`;
  }
  const barraApilada = (piezas, alto = 26) => { const t = piezas.reduce((s, p) => s + p.v, 0) || 1; return `<div class="gn-apil" style="height:${alto}px">${piezas.filter(p => p.v > 0).map(p => `<span style="flex:${p.v / t};background:${p.c}${p.op ? `;opacity:${p.op}` : ""}">${p.et && p.v / t > 0.07 ? p.et : ""}</span>`).join("")}</div>`; };
  const ley = items => `<div class="gn-ley">${items.map(([t, c]) => `<span><i style="background:${c}"></i>${e(t)}</span>`).join("")}</div>`;
  const cifras = l => `<div class="gn-cif">${l.map(([v, t, c]) => `<div><b${c ? ` style="color:${c}"` : ""}>${v}</b><small>${e(t)}</small></div>`).join("")}</div>`;
  const tarjeta = (titulo, cuerpo, ir) => `<section class="gn-card">${titulo ? `<h4>${e(titulo)}</h4>` : ""}${cuerpo}${ir ? `<button type="button" class="gn-ir" data-gn="${e(ir)}">Ver detalle ›</button>` : ""}</section>`;

  /* ---------- 1 · ventas y ganancia ---------- */
  function serieVentas(p) {
    const vs = ventasDe(p).filter(v => v.estado === "vendida");
    const ini = [llegada(p), vs[0] && vs[0].fecha, sumar(HOY, -6)].filter(Boolean).sort()[0], n = dias(ini, HOY);   // nunca días del futuro
    let acum = -invertido(p); const out = [];
    for (let i = 0; i <= n; i++) { const d = sumar(ini, i), cob = vs.filter(v => v.fecha === d).reduce((s, v) => s + (v.cobrado_bs ?? (v.precio_bs || 0) * v.cantidad) - (v.comision_bs || 0), 0); acum += cob; out.push({ fecha: d, barra: cob, linea: acum }); }
    return out;
  }
  const grafVentas = (p, alto) => { const s = serieVentas(p), b = s.findIndex(x => x.linea >= 0); return svgDias(s, { alto, cero: "recuperado lo invertido", colLinea: C.verde, bandera: b >= 0 ? b : null, aria: "Ventas y ganancia acumulada por día", tip: x => `<b>${dm(x.fecha)}</b><br>cobrado ${bs(x.barra)}<br>acumulado <span style="color:${x.linea >= 0 ? C.verde : C.rojo}">${bs(x.linea)}</span>` }); };
  function resumenVentas(p) {
    const c = costoUnit(p), vs = ventasDe(p).filter(v => v.estado === "vendida"), gan = vs.reduce((s, v) => s + (ganancia(v, c) || 0), 0);
    return { c, vs, gan, cob: vs.reduce((s, v) => s + (v.cobrado_bs ?? (v.precio_bs || 0) * v.cantidad), 0), com: vs.reduce((s, v) => s + (v.comision_bs || 0), 0), u: vs.reduce((s, v) => s + v.cantidad, 0) };
  }
  function tabVentas(det) {
    if (det && det.startsWith("ventas:")) det = det.slice(7);
    if (!comprados.length) return vacio("Todavía no compramos nada para vender.");
    return comprados.map(p => {
      const r = resumenVentas(p), inv = invertido(p);
      if (det && det !== p) return "";
      if (det !== p) return tarjeta(`Ventas y ganancia · ${p}`, `<div class="gn-fila"><b class="gn-big" style="color:${r.gan >= 0 ? C.verde : C.rojo}">${r.vs.length ? (r.gan >= 0 ? "+" : "") + bs(r.gan) : "Bs 0"}</b><small>ganancia real</small><span class="gn-chip">${cuantas(p, "vendida")} de ${unidades(p)} vendidas</span></div>${grafVentas(p, 220)}<p class="eq-note">${r.vs.length ? "Barras: lo cobrado por día · línea: ganancia acumulada" : `Todavía sin ventas: la línea arranca en lo invertido (${bs(-inv)}) y sube con cada venta.`}</p>`, "ventas:" + p);
      const todas = ventasDe(p);
      return tarjeta(`Resumen · ${p}`, cifras([[bs(inv), "invertido"], [bs(r.cob), "cobrado"], [(r.gan >= 0 ? "+" : "") + bs(r.gan), "ganancia", r.gan >= 0 ? C.verde : C.rojo], [`${r.u} / ${unidades(p)}`, "vendidas"], [bs(r.u ? r.cob / r.u : null), "precio promedio"], [bs(r.com), "comisiones"]])
        + (inv > 0 ? `<div class="gn-prog"><span style="width:${Math.min(100, Math.max(0, (r.cob - r.com) / inv * 100))}%"></span></div><p class="eq-note">Recuperado ${pct((r.cob - r.com) / inv * 100)} de lo invertido</p>` : ""))
        + tarjeta("Día por día · pasá el mouse para ver cada día", grafVentas(p, 300))
        + tarjeta("Cada venta", todas.length ? `<table class="gn-tab"><thead><tr><th>Día</th><th>Cant.</th><th class="n">Precio</th><th>Canal</th><th>Estado</th><th class="n">Ganancia</th></tr></thead><tbody>${todas.slice().reverse().map(v => { const g = ganancia(v, r.c); return `<tr><td>${dm(v.fecha)}</td><td>${v.cantidad}</td><td class="n">${bs(v.precio_bs)}</td><td>${e(v.canal || "—")}</td><td><span class="gn-est ${e(v.estado)}">${e(v.estado)}</span></td><td class="n" style="color:${g == null ? C.gris : g >= 0 ? C.verde : C.rojo}">${v.estado === "vendida" && g != null ? (g >= 0 ? "+" : "") + bs(g) : "—"}</td></tr>`; }).join("")}</tbody></table>` : `<p class="eq-note">Todavía no hay ventas. Se anotan en la app (+ → Registrar venta), por Telegram o en la pantalla de Finanzas.</p>`)
        + tarjetaCosto(p);
    }).join("");
  }

  /* ---------- 2 · stock ---------- */
  function partes(p) {
    const tot = unidades(p), v = cuantas(p, "vendida"), r = cuantas(p, "reservada"), ll = enCbba(p);
    return [{ n: "Vendidas", v, c: C.verde }, { n: "Reservadas", v: r, c: C.ambar }, { n: "Disponibles", v: Math.max(ll - v - r, 0), c: C.br }, { n: "En camino", v: Math.max(tot - ll, 0), c: "#55585D" }];
  }
  function meta7(p) {
    const l = llegada(p); if (!l) return `<p class="gn-meta">✈ <b>Todavía no llegan</b><br><small>La cuenta de 7 días para venderlas empieza al llegar</small></p>`;
    const dia = dias(l, HOY) + 1, quedan = unidades(p) - cuantas(p, "vendida");
    if (!quedan) return `<p class="gn-meta" style="color:${C.verde}">✓ <b>¡Todo vendido!</b> Meta cumplida</p>`;
    return `<p class="gn-meta">⏱ <b>${dia > 7 ? `Día ${dia} · meta 7` : `Día ${dia} de 7`}</b><br><small>${dia > 7 ? "Pasó la meta de 7 días" : `Meta: vender todo antes del ${dm(sumar(l, 6))}`}</small></p><div class="gn-prog"><span style="width:${Math.min(dia, 7) / 7 * 100}%;background:${dia > 7 ? C.rojo : C.ambar}"></span></div>`;
  }
  function tabStock() {
    if (!comprados.length) return vacio("Todavía no compramos nada para vender.");
    return comprados.map(p => { const pa = partes(p), q = pa[2].v + pa[3].v;
      return tarjeta(`Stock · ${p}`, `<div class="gn-stock">${dona(pa, q, "quedan")}<div>${pa.map(x => `<div class="gn-li"><i style="background:${x.c}"></i>${x.n}<b>${x.v}</b></div>`).join("")}${meta7(p)}</div></div>`)
        + tarjeta("Por pedido", reales.filter(x => x.producto === p).map(x => `<div class="gn-li2"><span><b>${x.cantidad} unidad${x.cantidad === 1 ? "" : "es"}</b><small>Comprado el ${dm(x.fecha_compra)} · ${e(x.estado)}</small></span><b>${bs(x.costo_unit_bs)} c/u</b></div>`).join(""))
        + tarjeta("Reservas y ventas", ventasDe(p).length ? ventasDe(p).slice().reverse().map(v => `<div class="gn-li2"><span>${dm(v.fecha)} · ${v.cantidad} × ${bs(v.precio_bs)}</span><span class="gn-est ${e(v.estado)}">${e(v.estado)}</span></div>`).join("") : `<p class="eq-note">Todavía nadie reservó ni compró.</p>`); }).join("");
  }

  /* ---------- 3 · anuncios y competencia ---------- */
  function anuncios() {
    const out = [];
    (G.publicaciones || []).slice().sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)).forEach(f => {
      if (f.accion === "publicada" || !out.some(a => a.producto === f.producto)) { out.push({ n: out.filter(a => a.producto === f.producto).length + 1, producto: f.producto, filas: [f] }); return; }
      let i = f.titulo ? out.map((a, k) => a.producto === f.producto && a.filas.some(x => x.titulo === f.titulo) ? k : -1).filter(k => k >= 0).pop() : undefined;
      if (i == null) i = out.map((a, k) => a.producto === f.producto ? k : -1).filter(k => k >= 0).pop();
      out[i].filas.push(f);
    });
    out.forEach(a => { const u = a.filas[a.filas.length - 1]; a.ult = u; a.activo = !["vendida", "eliminada", "pausada"].includes(u.accion);
      a.titulo = (a.filas.filter(x => x.titulo).pop() || {}).titulo || a.producto; a.precio = num((a.filas.filter(x => x.precio_bs).pop() || {}).precio_bs);
      a.clics = Math.max(0, ...a.filas.map(x => num(x.clics) || 0)); a.msj = Math.max(0, ...a.filas.map(x => num(x.mensajes) || 0)); a.dias = Math.max(0, dias(a.filas[0].fecha, a.activo ? HOY : u.fecha)); a.id = a.producto + "#" + a.n; });
    return out;
  }
  function serieAnuncio(a) {
    const pd = {}; a.filas.forEach(f => { const x = pd[f.fecha] || [0, 0]; pd[f.fecha] = [Math.max(x[0], num(f.clics) || 0), Math.max(x[1], num(f.mensajes) || 0)]; });
    let antes = 0; return Object.keys(pd).sort().map(k => { const r = { fecha: k, linea: pd[k][0], m: Math.max(pd[k][1] - antes, 0) }; antes = pd[k][1]; return r; });
  }
  function grafAnuncio(a, alto) {
    const s = serieAnuncio(a); if (s.length < 2) return `<p class="eq-note">El gráfico aparece cuando Marketplace anote los clics de un segundo día.</p>`;
    const mc = Math.max(1, ...s.map(x => x.linea)), mm = Math.max(1, ...s.map(x => x.m)); s.forEach(x => x.barra = x.m / mm * mc * 0.6);
    return svgDias(s, { alto, minHi: 5, area: true, colLinea: C.br, colBarra: C.verde, aria: "Clics y mensajes del anuncio por día", tip: x => `<b>${dm(x.fecha)}</b><br>${f0(x.linea)} clics acumulados<br>${f0(x.m)} mensajes nuevos` }) + ley([["clics acumulados", C.br], ["mensajes nuevos", C.verde]]);
  }
  function rivales(p, d = 30) {
    const desde = sumar(HOY, -d), t = ((G.locales || {})[p] || []).filter(l => l.bs != null && l.fecha >= desde && !/otra ciudad/.test(l.estado) && (l.src === "mkt" || l.cuenta))
      .map(l => ({ fecha: l.fecha, bs: l.bs, tipo: l.src === "mkt" ? "Marketplace" : "Tiendas", quien: l.src === "mkt" ? "Marketplace" : l.vendedor.replace(" (WhatsApp)", ""), url: l.url }));
    const m = mediana(t.map(x => x.bs)); return m == null ? [] : t.filter(x => x.bs >= m * 0.5 && x.bs <= m * 1.8);
  }
  function grafCompetencia(p, alto = 220) {
    const r = rivales(p), n = precioNuestro(p), c = costoUnit(p) ?? (anaNuevo(p) || {}).costo_bs;
    if (!r.length) return `<p class="eq-note">Sin precios de la competencia en los últimos 30 días.</p>`;
    const W = 760, H = alto, L = 54, R = 14, T = 18, B = 28, vals = [...r.map(x => x.bs), n && n[0], c].filter(v => v != null), lo = Math.min(...vals) * 0.94, hi = Math.max(...vals) * 1.05;
    const d0 = sumar(HOY, -30), X = f => L + (W - L - R) * dias(d0, f) / 30, Y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    let g = ""; for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.line}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" fill="${C.gris}" font-size="11" font-family="IBM Plex Mono">${mil(v)}</text>`; }
    [0, 10, 20, 30].forEach(k => g += `<text x="${X(sumar(d0, k))}" y="${H - 8}" text-anchor="middle" fill="${C.gris}" font-size="11" font-family="IBM Plex Mono">${dm(sumar(d0, k))}</text>`);
    if (c != null) g += `<line x1="${L}" x2="${W - R}" y1="${Y(c)}" y2="${Y(c)}" stroke="${C.rojo}" stroke-dasharray="4 4"/><text x="${L + 4}" y="${Y(c) + 15}" fill="${C.rojo}" font-size="11">nuestro costo ${bs(c)}</text>`;
    r.forEach(x => g += `<circle cx="${X(x.fecha)}" cy="${Y(x.bs)}" r="6" fill="${x.tipo === "Marketplace" ? C.gris : C.ambar}" opacity=".85"><title>${e(x.quien)} · ${dm(x.fecha)} · ${bs(x.bs)}</title></circle>`);
    if (n) g += `<line x1="${L}" x2="${W - R}" y1="${Y(n[0])}" y2="${Y(n[0])}" stroke="${C.br}" stroke-width="3"/><text x="${W - R - 4}" y="${Y(n[0]) - 7}" text-anchor="end" fill="${C.br}" font-size="12" font-weight="700">${n[1]} ${bs(n[0])}</text>`;
    return `<div class="gn-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Nuestro precio contra la competencia">${g}</svg></div>` + ley([["Marketplace", C.gris], ["Tiendas", C.ambar], ["nuestro precio", C.br], ["nuestro costo", C.rojo]]);
  }
  function tarjetaCompetencia(p, det) {
    const r = rivales(p, det ? 45 : 30).sort((a, b) => a.bs - b.bs), n = precioNuestro(p);
    const frase = n && r.length ? (() => { const ba = r.filter(x => x.bs < n[0]).length, ca = r.filter(x => x.bs > n[0]).length; return ba === 0 ? `Somos los más baratos de ${r.length}` : ca === 0 ? `Somos los más caros de ${r.length}` : `${ba} más baratos y ${ca} más caros que ${n[1] === "sugerido" ? "el sugerido" : "nosotros"}`; })() : "";
    return tarjeta(`Precio vs. competencia · ${p}`, (frase ? `<p class="gn-frase">${frase}</p>` : "") + grafCompetencia(p, det ? 300 : 220)
      + (det ? `<table class="gn-tab"><thead><tr><th>Quién</th><th>Día</th><th class="n">Precio</th><th></th></tr></thead><tbody>${r.map(x => `<tr><td>${e(x.quien)} <small>${x.tipo}</small></td><td>${dm(x.fecha)}</td><td class="n">${x.url ? `<a href="${e(x.url)}" target="_blank" rel="noopener">${bs(x.bs)}</a>` : bs(x.bs)}</td><td>${n ? (x.bs < n[0] ? `<span style="color:${C.rojo}">↓ más barato</span>` : x.bs > n[0] ? `<span style="color:${C.verde}">↑ más caro</span>` : "=") : ""}</td></tr>`).join("")}</tbody></table>` : ""), det ? null : "competencia:" + p);
  }
  function tabAnuncios(det) {
    const l = anuncios(), prods = [...new Set([...comprados, ...l.map(a => a.producto)])].sort();
    if (det && det.startsWith("competencia:")) return tarjetaCompetencia(det.slice(12), true);
    if (det) { const a = l.find(x => x.id === det); if (a) return tarjeta(`Anuncio ${a.n} · ${a.producto}`, `<p class="gn-frase">${e(a.titulo)}</p>${cifras([[bs(a.precio), "precio"], [a.dias, "días en línea"], [a.filas.filter(x => x.accion === "renovada").length, "renovaciones"], [a.clics, "clics"], [a.msj, "mensajes"], [a.clics ? pct(a.msj / a.clics * 100) : "—", "preguntan", C.verde]])}`)
      + tarjeta("Día por día", grafAnuncio(a, 300)) + tarjetaCompetencia(a.producto) + tarjeta("Historial", a.filas.slice().reverse().map(x => `<div class="gn-li2"><span>${dm(x.fecha)} ${e(x.hora)} · ${e(x.accion)}${x.precio_bs ? ` a Bs ${e(x.precio_bs)}` : ""}${x.notas ? `<small>${e(x.notas)}</small>` : ""}</span></div>`).join("")); }
    let h = "";
    if (!l.length) h += tarjeta("Nuestros anuncios", `<p class="gn-frase">Todavía no publicamos nada.</p><p class="eq-note">Marketplace publica cuando Santi fija el precio y deja las fotos en la PC (Documents\\fotos-publicar). Después acá sale un gráfico por anuncio: clics, mensajes, días en línea y cambios de precio.</p>`);
    if (l.length > 1) { const mx = Math.max(1, ...l.map(a => a.clics)); h += tarjeta("Todos los anuncios", l.map(a => `<div class="gn-cmp"><span>${a.n} · ${e(corto(a.producto))}</span><div><i style="width:${a.clics / mx * 100}%;background:${C.br}"></i><i style="width:${a.msj / mx * 100}%;background:${C.verde}"></i></div><b>${a.clics} · ${a.msj}</b></div>`).join("") + ley([["clics", C.br], ["mensajes", C.verde]]) + `<p class="eq-note">${l.filter(a => a.activo).length} en línea · ${l.reduce((s, a) => s + a.clics, 0)} clics y ${l.reduce((s, a) => s + a.msj, 0)} mensajes en total</p>`); }
    [...l.filter(a => a.activo), ...l.filter(a => !a.activo)].forEach(a => h += tarjeta(`Anuncio ${a.n} · ${a.producto}`, `<div class="gn-fila"><span class="gn-est">${e(a.ult.accion)}</span><b class="gn-big" style="margin-left:auto">${bs(a.precio)}</b></div>${cifras([[a.clics, "clics"], [a.msj, "mensajes"], [a.clics ? pct(a.msj / a.clics * 100) : "—", "preguntan", C.verde], [a.dias, "días"]])}${grafAnuncio(a, 200)}<p class="eq-note">${e(a.titulo)}</p>`, a.id));
    prods.forEach(p => h += tarjetaCompetencia(p));
    return h;
  }

  /* ---------- 4 · envíos ---------- */
  function nombreTramo(v) {
    const t = (v.lugar + " " + v.evento).toLowerCase();
    if (t.includes("santa cruz") && !t.includes("hacia santa cruz")) return "Santa Cruz → Cochabamba";
    if (/sale hacia bolivia|hacia santa cruz|salió/.test(t)) return "Miami → Santa Cruz";
    if (/entregado|bodega|recibido/.test(t)) return "En bodega del courier";
    if (/en camino|enviado|ups|usps|fedex/.test(t)) return "eBay → courier";
    if (t.includes("cochabamba")) return "En Cochabamba";
    return v.evento.slice(0, 26);
  }
  function tramos(p) {
    const ev = p.eventos.slice().sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)), out = [];
    if (ev[0] && dias(p.fecha_compra, ev[0].fecha) > 0) out.push({ n: "Compra → despacho", dias: dias(p.fecha_compra, ev[0].fecha), curso: false });
    ev.forEach((v, k) => {
      const finD = k + 1 < ev.length ? ev[k + 1].fecha : (p.etapa >= 5 ? v.fecha : HOY), dd = dias(v.fecha, finD);
      if (dd > 0 || (k === ev.length - 1 && p.etapa < 5)) { const n = nombreTramo(v), u = out[out.length - 1];
        if (u && u.n === n) u.dias += dd; else out.push({ n, dias: dd, curso: k === ev.length - 1 && p.etapa < 5 }); }
    });
    return out;
  }
  const COLT = [C.gris, C.azul, C.ambar, "#4F6FA8", C.verde, C.rojo];
  function tarjetaEnvio(p, det) {
    const t = tramos(p), tot = t.reduce((s, x) => s + x.dias, 0), lle = p.etapa >= 5, n = reales.filter(x => x.producto === p.producto && x.fecha_compra === p.fecha_compra).reduce((s, x) => s + x.cantidad, 0);
    const lento = t.length > 1 ? t.reduce((a, b) => b.dias > a.dias ? b : a) : null;
    let h = `<div class="gn-fila"><b class="gn-big">${tot} días</b><small>${lle ? "de la compra a Cochabamba" : "desde la compra, y sigue"}</small></div>` + barraApilada(t.map((x, i) => ({ v: x.dias, c: COLT[i % COLT.length], op: x.curso ? 0.55 : 1, et: x.dias + "d" })), 30)
      + t.map((x, i) => `<div class="gn-li"><i style="background:${COLT[i % COLT.length]}"></i>${e(x.n)}${x.curso ? ` <span class="gn-est reservada">ahora</span>` : ""}<b>${x.dias} día${x.dias === 1 ? "" : "s"}</b></div>`).join("")
      + (lento ? `<p class="eq-note">Lo más lento: ${e(lento.n)} (${lento.dias} días)</p>` : "");
    if (det) h += `<div class="gn-tl"><div><i></i><b>Compra en ${e(p.tienda || "eBay")}</b><small>${dm(p.fecha_compra)}</small></div>${p.eventos.slice().sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)).map((v, k, a) => `<div><i${k === a.length - 1 ? ' class="u"' : ""}></i><b>${e(v.lugar)}</b><span>${e(v.evento)}</span><small>${dm(v.fecha)} ${e(v.hora)} · ${dias(k ? a[k - 1].fecha : p.fecha_compra, v.fecha)} días después</small></div>`).join("")}</div>`;
    return tarjeta(`Cuánto ${lle ? "tardó" : "va tardando"} · ${n} × ${p.producto}`, h, det ? null : "envio:" + p.id);
  }
  function tabEnvios(det) {
    if (det) { const p = paquetes.find(x => "envio:" + x.id === det); if (p) return tarjetaEnvio(p, true); }
    return paquetes.length ? paquetes.map(p => tarjetaEnvio(p)).join("") : vacio("Todavía no hay pedidos reales.");
  }

  /* ---------- 5 · oportunidades ---------- */
  function oport() {
    const dem = {}; (G.demanda || []).forEach(d => dem[d.producto] = d);
    return (G.productos || []).filter(p => p.condicion === "nuevo" && p.margen != null && dem[p.producto] && dem[p.producto].puntaje != null)
      .map(p => ({ p, x: dem[p.producto].puntaje, t: p.precios_locales || 1 }));
  }
  const colRec = r => r === "traer" ? C.verde : r === "esperar" ? C.ambar : r === "no traer" ? C.rojo : C.gris;
  function grafOport(l, alto, nombres) {
    const W = 760, H = alto, L = 44, R = 110, T = 16, B = 30, mx = Math.max(1, ...l.map(o => o.x)) * 1.25, ys = l.map(o => o.p.margen);
    const lo = Math.max(Math.min(Math.min(...ys) - 5, 0), -20), hi = Math.max(Math.max(...ys) + 6, 20), X = v => L + (W - L - R) * v / mx, Y = v => T + (H - T - B) * (1 - (Math.max(v, lo) - lo) / (hi - lo));
    let g = `<rect x="${X(mx / 2)}" y="${Y(hi)}" width="${X(mx) - X(mx / 2)}" height="${Y(15) - Y(hi)}" fill="${C.verde}" opacity=".08"/><line x1="${L}" x2="${W - R}" y1="${Y(15)}" y2="${Y(15)}" stroke="${C.gris}" stroke-dasharray="3 3" opacity=".6"/>`;
    for (let v = Math.ceil(lo / 10) * 10; v <= hi; v += 10) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.line}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" fill="${C.gris}" font-size="11" font-family="IBM Plex Mono">${v}%</text>`;
    g += `<text x="${W - R}" y="${H - 8}" text-anchor="end" fill="${C.gris}" font-size="11">se vende más rápido →</text>`;
    l.forEach(o => { const r = Math.sqrt(Math.min(Math.max(o.t, 1), 14)) * 5; g += `<circle cx="${X(o.x)}" cy="${Y(o.p.margen)}" r="${r}" fill="${colRec(o.p.recomendacion)}" opacity=".7"><title>${e(o.p.producto)} · margen ${pct(o.p.margen)} · ${o.t} precios en Cbba · ${e(o.p.recomendacion)}</title></circle>`;
      if (!nombres || nombres.has(o.p.producto)) g += `<text x="${X(o.x) + r + 3}" y="${Y(o.p.margen) + 4}" fill="${C.ink}" font-size="11" font-weight="600">${e(corto(o.p.producto))}</text>`; });
    return `<div class="gn-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de oportunidades: margen contra rapidez de venta">${g}</svg></div>`;
  }
  function tabOport(det) {
    const todas = oport(); if (!todas.length) return vacio("Falta la demanda de Marketplace para dibujarlo.");
    const orden = (a, b) => b.p.margen * b.x - a.p.margen * a.x, mxx = Math.max(...todas.map(o => o.x)) * 1.25;
    if (!det) { const l = todas.filter(o => o.p.margen >= 0).sort(orden).slice(0, 7), buenas = l.filter(o => o.p.margen >= 15 && o.x >= mxx / 2);
      return tarjeta("Mapa de oportunidades", `<p class="gn-frase">${buenas.length ? "En la zona verde: " + buenas.map(o => corto(o.p.producto)).join(", ") : "Hoy ninguno cae en la zona verde"}</p>${grafOport(l, 300)}<p class="eq-note">Las 7 mejores de ${todas.length} · burbuja grande = más tiendas lo venden · color = lo que dice el Analista</p>`, "oportunidades:todas") + tabPrecios(); }
    const top = new Set(todas.slice().sort(orden).slice(0, 10).map(o => o.p.producto));
    return tarjeta("Margen contra rapidez de venta · todos", grafOport(todas, 440, top) + ley([["traer", C.verde], ["esperar", C.ambar], ["no traer", C.rojo]]) + `<p class="eq-note">Con nombre, las 10 mejores; pasá el mouse por una burbuja para ver cuál es.</p>`)
      + tarjeta("Ordenados por margen", `<table class="gn-tab"><thead><tr><th>Producto</th><th class="n">Margen</th><th class="n">Peor caso</th><th class="n">Se vende</th><th class="n">Precios</th><th>Analista</th></tr></thead><tbody>${todas.slice().sort((a, b) => b.p.margen - a.p.margen).map(o => `<tr><td>${e(o.p.producto)}</td><td class="n" style="color:${colRec(o.p.recomendacion)}">${pct(o.p.margen)}</td><td class="n">${pct(o.p.peor)}</td><td class="n">${o.x.toLocaleString("es-BO", { maximumFractionDigits: 1 })}</td><td class="n">${o.t}</td><td>${e(o.p.recomendacion)}</td></tr>`).join("")}</tbody></table>`);
  }

  /* ---------- 6 · precios en Cochabamba ---------- */
  function rangos() {
    return Object.entries(G.locales || {}).map(([p, l]) => { const v = l.filter(x => x.cuenta && x.bs != null).map(x => x.bs); if (v.length < 2) return null;
      return { p, min: Math.min(...v), max: Math.max(...v), med: mediana(v), costo: (anaNuevo(p) || {}).costo_bs, n: v.length }; }).filter(Boolean).sort((a, b) => b.n - a.n);
  }
  let abierto = null;
  function filasRango(l, expandir) {
    const tope = Math.max(...l.map(r => Math.max(r.max, r.costo || 0))) * 1.04, P = v => (v / tope * 100).toFixed(2) + "%";
    return l.map(r => `<div class="gn-rg${expandir ? " clic" : ""}"${expandir ? ` data-gnrg="${e(r.p)}" role="button" tabindex="0"` : ""}><div class="gn-fila"><b>${e(r.p)}</b><small style="margin-left:auto">${mil(r.min)}–${mil(r.max)} · mediana ${bs(r.med)} · ${r.n} precios</small></div>
      <div class="gn-rgbar"><span class="r" style="left:${P(r.min)};width:${P(r.max - r.min)}"></span><span class="m" style="left:${P(r.med)}"></span>${r.costo ? `<span class="c" style="left:${P(r.costo)}"></span>` : ""}</div>
      ${expandir && abierto === r.p ? `<table class="gn-tab">${((G.locales || {})[r.p] || []).filter(x => x.cuenta && x.bs != null).sort((a, b) => a.bs - b.bs).map(x => `<tr><td>${e(x.src === "mkt" ? "Marketplace" : x.vendedor)}</td><td>${dm(x.fecha)}</td><td class="n">${x.url ? `<a href="${e(x.url)}" target="_blank" rel="noopener">${bs(x.bs)}</a>` : bs(x.bs)}</td></tr>`).join("")}</table>` : ""}</div>`).join("")
      + `<div class="gn-ejex"><span>0</span><span>${mil(tope / 2)}</span><span>${mil(tope)}</span></div>`;
  }
  function tabPrecios(det) {
    const l = rangos(); if (!l.length) return vacio("Faltan precios locales.");
    const lg = ley([["rango", "rgba(201,164,92,.35)"], ["mediana", C.br], ["puesto desde EE.UU.", C.verde]]);
    return det ? tarjeta("Precios en Cochabamba · todos (tocá un producto para ver cada tienda)", filasRango(l, true) + lg)
      : tarjeta("Precios en Cochabamba", filasRango(l.slice(0, 6)) + lg + `<p class="eq-note">Los ${Math.min(6, l.length)} con más precios · todos en el detalle</p>`, "precios:todos");
  }

  /* ---------- 7 · embudo de tiendas ---------- */
  const T = G.tiendas || [], CATS = (G.catalogos || []).map(c => c.tienda.toLowerCase());
  function pasos() {
    const esc1 = T.filter(t => t.enviados > 0), resp = esc1.filter(t => t.recibidos > 0), pre = resp.filter(t => t.con_precio > 0 || t.precios.length);
    const lis = pre.filter(t => { const n = t.tienda.toLowerCase(); return CATS.some(c => c.startsWith(n) || n.startsWith(c)) || t.precios.length >= 5; });
    return [["Les escribimos", esc1], ["Respondieron", resp], ["Dieron precio", pre], ["Lista o catálogo", lis]];
  }
  const extras = () => [["Frías", T.filter(t => t.fria)], ["Lista pedida", T.filter(t => t.lista)], ["Sin escribir", T.filter(t => !t.enviados)]];
  let paso = 0, soloQ = false, busca = "";
  function tabTiendas(det) {
    const ps = pasos(), tope = Math.max(1, ps[0][1].length);
    if (!det) return tarjeta("Embudo de tiendas", `<p class="eq-note">De ${T.length} tiendas en la lista · tocá un paso para ver las tiendas</p><div class="gn-emb">${ps.map(([n, l], i) => `<button type="button" data-gnpaso="${i}" style="width:${Math.max(l.length / tope * 100, 45)}%;opacity:${1 - i * 0.15}"><span>${n}</span><b>${l.length} ›</b></button>${i < 3 && l.length ? `<small>${Math.round(ps[i + 1][1].length / l.length * 100)} % pasa</small>` : ""}`).join("")}</div>
      <div class="gn-chips">${extras().map(([n, l], i) => `<button type="button" data-gnpaso="${10 + i}">${n} · ${l.length}</button>`).join("")}</div>`);
    const todos = [...ps, ...extras()], idx = paso < 10 ? paso : 4 + paso - 10, [titulo, base] = todos[idx];
    let l = base; if (soloQ && paso < 3) { const sig = new Set(ps[paso + 1][1].map(t => t.id)); l = l.filter(t => !sig.has(t.id)); }
    l = l.filter(t => !busca || t.tienda.toLowerCase().includes(busca.toLowerCase())).sort((a, b) => b.ultimo_mensaje.localeCompare(a.ultimo_mensaje));
    return tarjeta(null, `<div class="gn-chips">${todos.map(([n, x], i) => { const k = i < 4 ? i : 10 + i - 4; return `<button type="button" data-gnpaso="${k}" aria-pressed="${k === paso}">${n} · ${x.length}</button>`; }).join("")}</div>
      ${paso < 3 ? `<label class="gn-tog"><input type="checkbox" data-gnsolo ${soloQ ? "checked" : ""}> Solo las que se quedaron en "${e(titulo)}"</label>` : ""}
      <input type="search" class="gn-busca" placeholder="Buscar tienda" value="${e(busca)}" data-gnbusca aria-label="Buscar tienda">
      <p class="eq-note">${l.length} tiendas</p>
      <div class="gn-tiendas">${l.map(t => `<details><summary><b>${e(t.tienda)}</b><small>${e(t.estado)}${t.grupo ? " · grupo " + e(t.grupo[0]) : ""}</small><span>↗ ${t.enviados} · ↙ ${t.recibidos} · ${t.precios.length} precios${t.fria ? " · fría" : ""}${t.lista ? " · lista pedida" : ""}${t.ultimo_mensaje ? " · " + dm(t.ultimo_mensaje) : ""}</span></summary>
        <div>${t.vende ? `<p class="eq-note">Vende: ${e(t.vende)}</p>` : ""}${t.precios.length ? `<table class="gn-tab">${t.precios.map(x => `<tr><td>${dm(x.fecha)}</td><td>${e(x.producto)}</td><td class="n">${bs(x.precio_bs)}</td></tr>`).join("")}</table>` : `<p class="eq-note">Todavía no nos pasó precios.</p>`}</div></details>`).join("")}</div>`);
  }

  /* ---------- 9 · en qué se va la plata de una unidad ---------- */
  function tarjetaCosto(p) {
    const c = costoUnit(p) ?? (anaNuevo(p) || {}).costo_bs; if (c == null) return "";
    const vs = ventasDe(p).filter(v => v.estado === "vendida" && v.precio_bs != null), u = vs.reduce((s, v) => s + v.cantidad, 0);
    const n = precioNuestro(p), [precio, de] = u ? [vs.reduce((s, v) => s + v.precio_bs * v.cantidad, 0) / u, "promedio vendido"] : n ? [n[0], n[1] === "sugerido" ? "sugerido por el Analista" : "el de nuestro anuncio"] : [c, "—"];
    const com = u ? vs.reduce((s, v) => s + (v.comision_bs || 0), 0) / u : 0, g = precio - c - com, real = costoUnit(p) != null;
    const pz = [{ n: real ? "Compra puesta en Cbba (eBay + courier, real)" : "Costo puesto (estimado)", v: c, c: C.br }, ...(com ? [{ n: "Comisión", v: com, c: C.ambar }] : []), { n: g >= 0 ? "Ganancia" : "Pérdida", v: Math.abs(g), c: g >= 0 ? C.verde : C.rojo }];
    let h = `<p class="eq-note">Precio: ${e(de)}</p>` + barraApilada(pz) + pz.map(x => `<div class="gn-li"><i style="background:${x.c}"></i>${e(x.n)}<b>${bs(x.v)} <small>${pct(x.v / Math.max(precio, 1) * 100)}</small></b></div>`).join("");
    const a = anaNuevo(p);
    if (a && a.ebay_usd && a.tc) { const eb = a.ebay_usd * a.tc, co = (a.courier_usd || 0) * a.tc, ot = Math.max((a.costo_bs || 0) - eb - co, 0);
      h += `<p class="gn-sub">Si lo trajeras hoy (estimado del Analista)</p>` + barraApilada([{ v: eb, c: C.br }, { v: co, c: C.ambar }, { v: ot, c: C.gris }], 16) + `<p class="eq-note">eBay ${bs(eb)} · courier ${bs(co)}${ot ? ` · otros ${bs(ot)}` : ""} = ${bs(a.costo_bs)} · dólar ${a.tc}</p>`; }
    return tarjeta(`De ${bs(precio)} por unidad · ${p}`, h);
  }
  function tabCosto() { const ps = comprados.length ? comprados : []; return ps.length ? ps.map(tarjetaCosto).join("") : vacio("Todavía no compramos nada para vender."); }

  const vacio = t => `<section class="gn-card"><p class="eq-note">${e(t)}</p></section>`;

  /* ---------- el panel ---------- */
  const TABS = [["ventas", "Ventas y ganancia", tabVentas], ["stock", "Stock", tabStock], ["anuncios", "Anuncios y competencia", tabAnuncios], ["envios", "Envíos", tabEnvios],
    ["oportunidades", "Oportunidades y precios", tabOport], ["tiendas", "Embudo de tiendas", tabTiendas], ["costo", "Costo por unidad", tabCosto]];
  const DET = { ventas: "ventas", competencia: "anuncios", envio: "envios", oportunidades: "oportunidades", precios: "oportunidades" };
  let tab = "ventas", det = null, volver = null;
  const css = document.createElement("style");
  css.textContent = `
#pNeg .eq-body{gap:12px}
.gn-tabs{display:flex;flex-wrap:wrap;gap:6px;position:sticky;top:-14px;z-index:2;background:#151516;padding:6px 0}
.gn-tabs button,.gn-chips button{font:600 12px var(--f-mono);background:#1B1B1C;color:var(--o-ink);border:1px solid var(--o-line);border-radius:999px;padding:6px 11px;min-height:34px;cursor:pointer}
.gn-tabs button[aria-pressed="true"],.gn-chips button[aria-pressed="true"]{background:var(--o-amber);color:#151516;border-color:var(--o-amber)}
.gn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,480px),1fr));gap:12px;align-items:start}
.gn-card{background:var(--o-panel);border:1px solid var(--o-line);border-radius:12px;padding:14px;display:grid;gap:8px;min-width:0}
.gn-card h4{margin:0;font:600 11px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--o-muted)}
.gn-ir{justify-self:end;font:600 12px var(--f-mono);background:none;border:0;color:var(--o-amber);cursor:pointer;min-height:30px}
.gn-back{justify-self:start;font:600 12px var(--f-mono);background:#1B1B1C;border:1px solid var(--o-line);color:var(--o-ink);border-radius:999px;padding:6px 12px;cursor:pointer;min-height:34px}
.gn-fila{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.gn-fila small{color:var(--o-muted);font-size:12px}
.gn-big{font:700 26px var(--f-display);font-variant-numeric:tabular-nums}
.gn-chip{margin-left:auto;font:600 12px var(--f-mono);color:var(--o-amber)}
.gn-frase{margin:0;font-size:15px}
.gn-sub{margin:6px 0 0;font:600 12px var(--f-body)}
.gn-chart{position:relative}.gn-chart svg{width:100%;height:auto;display:block}
.gn-ley{display:flex;flex-wrap:wrap;gap:12px;font:500 11px var(--f-mono);color:var(--o-muted)}
.gn-ley i,.gn-li i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle}
.gn-cif{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
.gn-cif b{display:block;font:700 18px var(--f-display);font-variant-numeric:tabular-nums}.gn-cif small{font-size:11px;color:var(--o-muted)}
.gn-prog{height:7px;background:#2A2B2D;border-radius:4px;overflow:hidden}.gn-prog span{display:block;height:100%;background:#5CD69A;border-radius:4px}
.gn-stock{display:grid;grid-template-columns:140px minmax(0,1fr);gap:16px;align-items:center}
.gn-dona{width:140px;height:140px}
.gn-li{display:flex;align-items:center;gap:4px;font-size:14px;padding:3px 0}.gn-li b{margin-left:auto;font-variant-numeric:tabular-nums}.gn-li b small{color:var(--o-muted);font-weight:500;margin-left:6px}
.gn-li2{display:flex;justify-content:space-between;gap:10px;font-size:14px;padding:6px 0;border-top:1px solid var(--o-line)}.gn-li2 span small{display:block;color:var(--o-muted);font-size:12px}
.gn-meta{margin:6px 0 4px;font-size:14px}.gn-meta small{color:var(--o-muted)}
.gn-est{font:600 11px var(--f-mono);padding:2px 8px;border-radius:999px;background:#2A2B2D;color:var(--o-amber)}
.gn-est.vendida{background:#123323;color:#8FE3B5}.gn-est.reservada{background:#3A2814;color:#F2A541}
.gn-apil{display:flex;border-radius:8px;overflow:hidden;gap:2px}.gn-apil span{display:flex;align-items:center;justify-content:center;font:700 11px var(--f-mono);color:#151516;min-width:2px}
.gn-tab{width:100%;border-collapse:collapse;font-size:13px}.gn-tab th{font:600 11px var(--f-mono);text-transform:uppercase;letter-spacing:.05em;color:var(--o-muted);text-align:left;padding:6px;border-bottom:1px solid var(--o-line);background:transparent}
.gn-tab td{padding:6px;border-bottom:1px solid var(--o-line);background:transparent;color:var(--o-ink)}.gn-tab .n{text-align:right;font-variant-numeric:tabular-nums}.gn-tab small{color:var(--o-muted)}.gn-tab a{color:var(--o-amber)}
.gn-cmp{display:grid;grid-template-columns:110px minmax(0,1fr) 70px;gap:8px;align-items:center;font-size:13px}.gn-cmp div{display:grid;gap:3px}.gn-cmp i{display:block;height:8px;border-radius:4px}.gn-cmp b{text-align:right;font-variant-numeric:tabular-nums}
.gn-tl{display:grid;gap:10px;margin-top:6px}.gn-tl>div{display:grid;grid-template-columns:14px minmax(0,1fr);column-gap:10px}.gn-tl i{grid-row:span 3;width:10px;height:10px;border-radius:50%;background:var(--o-muted);margin-top:4px}.gn-tl i.u{background:var(--o-amber)}
.gn-tl span{font-size:13px}.gn-tl small{color:var(--o-muted);font-size:12px}
.gn-rg{padding:5px 0}.gn-rg.clic{cursor:pointer;border-top:1px solid var(--o-line)}.gn-rg b{font-size:13px}
.gn-rgbar{position:relative;height:16px}.gn-rgbar span{position:absolute;top:50%;transform:translateY(-50%)}
.gn-rgbar .r{height:10px;border-radius:5px;background:rgba(201,164,92,.35)}.gn-rgbar .m{width:11px;height:11px;border-radius:50%;background:#C9A45C;margin-left:-5px}.gn-rgbar .c{width:10px;height:10px;background:#5CD69A;transform:translateY(-50%) rotate(45deg);margin-left:-5px}
.gn-ejex{display:flex;justify-content:space-between;font:500 11px var(--f-mono);color:var(--o-muted)}
.gn-emb{display:grid;justify-items:center;gap:4px}.gn-emb button{display:flex;justify-content:space-between;align-items:center;gap:10px;min-width:220px;background:#C9A45C;color:#151516;border:0;border-radius:9px;padding:9px 14px;font:700 15px var(--f-body);cursor:pointer;min-height:40px}
.gn-emb small{font:500 11px var(--f-mono);color:var(--o-muted)}
.gn-chips{display:flex;flex-wrap:wrap;gap:6px}
.gn-tog{display:flex;align-items:center;gap:8px;font-size:14px}
.gn-busca{font:500 14px var(--f-body);background:#1B1B1C;color:var(--o-ink);border:1px solid var(--o-line);border-radius:8px;padding:9px 11px;min-height:40px}
.gn-tiendas{display:grid;gap:8px}.gn-tiendas details{background:#1B1B1C;border:1px solid var(--o-line);border-radius:10px;padding:10px 12px}
.gn-tiendas summary{cursor:pointer;display:grid;gap:2px;list-style:none}.gn-tiendas summary small,.gn-tiendas summary span{font-size:12px;color:var(--o-muted)}.gn-tiendas details>div{margin-top:8px}
@media (max-width:560px){.gn-stock{grid-template-columns:1fr;justify-items:center}}`;
  document.head.appendChild(css);
  function panelNeg() {
    let el = document.getElementById("pNeg");
    if (!el) {
      el = document.createElement("div"); el.id = "pNeg"; el.className = "gpanel"; el.hidden = true;
      el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Gráficos del negocio");
      el.innerHTML = `<div class="gp-card" style="grid-template-rows:auto minmax(0,1fr)"><div class="gp-head"><div><b>Gráficos del negocio</b><span>los mismos de la app · datos de ${e((G.generado || "").replace(" ", " · "))}</span></div><div class="gp-tools"><button type="button" class="openmap" data-gncerrar style="margin:0">Cerrar</button></div></div><div class="eq-body"></div></div>`;
      el.addEventListener("click", ev => { if (ev.target === el || ev.target.closest("[data-gncerrar]")) cerrar(); });
      el.addEventListener("keydown", ev => { if (ev.key === "Escape") cerrar(); });
      document.body.appendChild(el);
    }
    return el;
  }
  function render() {
    const el = panelNeg(), t = TABS.find(x => x[0] === tab) || TABS[0];
    el.querySelector(".eq-body").innerHTML = `<div class="gn-tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" data-gntab="${k}" aria-pressed="${k === tab && !det}">${n}</button>`).join("")}</div>
      ${det ? `<button type="button" class="gn-back" data-gnvolver>← Volver</button>` : ""}<div class="${det || tab === "tiendas" ? "gn-grid" : "gn-grid"}"${det ? ' style="grid-template-columns:minmax(0,1fr)"' : ""}>${t[2](det)}</div>`;
  }
  function cerrar() { const el = document.getElementById("pNeg"); if (!el) return; el.hidden = true; document.body.style.overflow = ""; if (volver && volver.focus) volver.focus(); }
  window.abrirNegocio = function (t, d) {
    if (t) tab = t; det = d || null; if (tab === "tiendas" && d != null) { paso = +d; det = "lista"; }
    volver = document.activeElement; render(); const el = panelNeg(); el.hidden = false; document.body.style.overflow = "hidden";
    const b = el.querySelector("[data-gncerrar]"); if (b) b.focus();
  };
  const arriba = () => { const b = document.querySelector("#pNeg .eq-body"); if (b) b.scrollTop = 0; };
  document.addEventListener("click", ev => {
    const w = ev.target.closest("[data-gn-abrir]"); if (w) { ev.preventDefault(); window.abrirNegocio(w.dataset.gnAbrir); return; }
    if (!ev.target.closest("#pNeg")) return;
    const tb = ev.target.closest("[data-gntab]"); if (tb) { tab = tb.dataset.gntab; det = null; render(); arriba(); return; }
    if (ev.target.closest("[data-gnvolver]")) { det = null; render(); arriba(); return; }
    const ir = ev.target.closest("[data-gn]"); if (ir) { const k = ir.dataset.gn, pre = k.split(":")[0]; if (DET[pre]) tab = DET[pre]; else if (k.includes("#")) tab = "anuncios"; det = pre === "oportunidades" ? "todas" : pre === "precios" ? "precios" : k; if (pre === "precios") { tab = "oportunidades"; } render(); arriba(); return; }
    const ps = ev.target.closest("[data-gnpaso]"); if (ps) { paso = +ps.dataset.gnpaso; soloQ = false; tab = "tiendas"; det = "lista"; render(); return; }
    const rg = ev.target.closest("[data-gnrg]"); if (rg) { abierto = abierto === rg.dataset.gnrg ? null : rg.dataset.gnrg; render(); }
  });
  document.addEventListener("change", ev => { if (ev.target.closest && ev.target.closest("#pNeg [data-gnsolo]")) { soloQ = ev.target.checked; render(); } });
  document.addEventListener("input", ev => { if (ev.target.closest && ev.target.closest("#pNeg [data-gnbusca]")) { busca = ev.target.value; render(); const i = document.querySelector("#pNeg [data-gnbusca]"); if (i) { i.focus(); i.setSelectionRange(busca.length, busca.length); } } });
  document.addEventListener("keydown", ev => { const r = ev.target.closest && ev.target.closest("#pNeg [data-gnrg]"); if (r && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); r.click(); } });

  // el detalle de precios de Cochabamba vive en la pestaña de oportunidades
  const _op = tabOport; TABS[4][2] = d => d === "precios" ? tabPrecios(true) : _op(d);
})();
