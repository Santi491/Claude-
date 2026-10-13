/* Pantalla del agente Pedidos: mapa de EE.UU. con el recorrido de cada envío.
   Lee D.pedidos (generar.py: pedidos.csv + pedidos-prueba.csv + seguimiento.csv). Nunca muestra guías ni direcciones. */
(function () {
  const US = [[-124.7, 48.4], [-124.1, 46.9], [-123.9, 45.5], [-124.1, 44.0], [-124.5, 42.8], [-124.2, 41.9], [-124.4, 40.4], [-123.8, 39.6], [-122.9, 38.0], [-122.4, 37.2], [-121.9, 36.3], [-120.6, 34.6], [-118.5, 34.0], [-117.1, 32.5],
    [-114.7, 32.7], [-111.1, 31.3], [-108.2, 31.3], [-106.5, 31.8], [-104.9, 30.6], [-104.0, 29.3], [-103.1, 29.0], [-102.4, 29.8], [-101.4, 29.8], [-100.3, 28.3], [-99.5, 27.5], [-99.1, 26.4], [-97.4, 25.9],
    [-97.2, 27.6], [-96.5, 28.6], [-95.0, 29.3], [-93.8, 29.7], [-92.0, 29.6], [-90.9, 29.1], [-89.4, 29.0], [-89.6, 30.2], [-88.0, 30.4], [-86.5, 30.4], [-85.3, 29.7], [-84.0, 30.1], [-83.0, 29.0], [-82.7, 27.6], [-81.8, 26.1], [-81.0, 25.2], [-80.4, 25.2], [-80.1, 26.6], [-80.6, 28.4], [-81.3, 30.0],
    [-81.4, 31.4], [-80.0, 32.6], [-78.9, 33.6], [-77.0, 34.6], [-75.5, 35.3], [-76.0, 36.9], [-75.9, 37.9], [-75.0, 38.8], [-74.0, 39.8], [-74.0, 40.6], [-72.0, 41.0], [-70.6, 41.5], [-70.0, 41.9], [-70.6, 42.6], [-70.7, 43.1], [-69.0, 44.0], [-67.0, 44.8],
    [-67.8, 47.1], [-69.2, 47.4], [-70.0, 46.4], [-71.5, 45.0], [-74.8, 45.0], [-76.4, 44.2], [-79.2, 43.4], [-79.0, 42.8], [-82.5, 42.6], [-82.1, 43.6], [-82.4, 45.3], [-84.6, 46.4], [-88.4, 48.3], [-89.6, 48.0], [-95.2, 49.0], [-123.0, 49.0], [-123.3, 48.3]];
  const CITIES = [["Seattle", 47.6, -122.3], ["San Francisco", 37.8, -122.4], ["Los Ángeles", 34.05, -118.25], ["Phoenix", 33.45, -112.07], ["Denver", 39.74, -104.99], ["Dallas", 32.78, -96.8], ["Houston", 29.76, -95.37],
    ["Chicago", 41.88, -87.63], ["Atlanta", 33.75, -84.39], ["Miami", 25.76, -80.19], ["Nueva York", 40.71, -74.0], ["Memphis", 35.15, -90.05], ["Louisville", 38.25, -85.76]];
  const X = lon => 40 + (lon + 125.5) / 59 * 920, Y = lat => 30 + (49.8 - lat) / 25.5 * 540;
  const STEPS = [["Etiqueta creada", /etiqueta|comprado|pagado|esperando/i], ["Enviado", /enviado|recibido|aceptado|tr[aá]nsito|en ruta|departed|arrived/i],
    ["Bodega courier", /bodega|courier|miami|warehouse/i], ["Rumbo a Bolivia", /bolivia|vuelo|aduana|camino/i], ["Entregado", /entregado|cochabamba|delivered/i]];
  const stepOf = e => { let k = 0; STEPS.forEach(([, re], i) => { if (re.test(e || "")) k = i; }); return k; };
  const group = e => stepOf(e) === 0 ? "espera" : stepOf(e) >= 4 ? "entregado" : "camino";
  const GCOL = { espera: "#4FD1E8", camino: "#F2A541", entregado: "#5CD69A" };
  let filt = "", showTest = true, selId = null;

  const box = document.createElement("div");
  box.className = "mapa"; box.id = "mapa"; box.hidden = true; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Mapa de envíos");
  box.innerHTML = `<div class="mp-card">
    <div class="mp-head"><div><b>Pantalla de Pedidos</b><span>Mapa de envíos en EE.UU.</span></div>
      <div class="mp-tools"><div class="seg" id="mpF"><button type="button" data-f="" aria-pressed="true">Todos</button><button type="button" data-f="espera" aria-pressed="false">En espera</button><button type="button" data-f="camino" aria-pressed="false">En camino</button><button type="button" data-f="entregado" aria-pressed="false">Entregados</button></div>
      <label class="mp-chk"><input type="checkbox" id="mpT" checked> Pedidos de prueba</label><button type="button" class="mp-x" id="mpX">Cerrar</button></div></div>
    <div class="mp-body"><div class="mp-list" id="mpL"></div><div class="mp-map"><svg id="mpS" viewBox="0 0 1000 600" role="img" aria-label="Mapa de Estados Unidos con los envíos"></svg><div class="mp-leg"><span><i style="background:#4FD1E8"></i>En espera</span><span><i style="background:#F2A541"></i>En camino</span><span><i style="background:#5CD69A"></i>Entregado</span><span><i class="dash"></i>Recorrido pendiente</span></div></div></div></div>`;
  document.body.appendChild(box);
  const $m = id => box.querySelector("#" + id);

  function pkgIcon(c) { return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 13 20 6l14 7v15l-14 7-14-7z" fill="${c}22" stroke="${c}" stroke-width="2"/><path d="M6 13l14 7 14-7M20 20v15" fill="none" stroke="${c}" stroke-width="2"/></svg>`; }
  function list() { return (D.pedidos || []).filter(p => (showTest || !p.prueba) && (!filt || group(p.estado) === filt)); }
  function renderList() {
    const L = list();
    $m("mpL").innerHTML = L.length ? L.map(p => {
      const g = group(p.estado), c = GCOL[g], k = stepOf(p.estado), last = (p.eventos || []).slice(-1)[0];
      const foto = p.foto ? `<img src="${esc(p.foto)}" alt="">` : pkgIcon(c);
      return `<button type="button" class="mp-item${selId === p.id ? " on" : ""}" data-id="${esc(p.id)}">
        <span class="mp-ph">${foto}</span>
        <span class="mp-tx"><b>${esc(p.cantidad || 1)}× ${esc(p.producto)}</b>${p.prueba ? '<em class="mp-test">PRUEBA</em>' : ""}
          <small>${esc(p.tienda || "")} · ${esc(p.courier || "")}${p.eta ? ` · llega ${esc(p.eta)}` : ""}</small>
          <span class="mp-steps">${STEPS.map((s, i) => `<i class="${i <= k ? "ok" : ""}" style="--c:${c}" title="${s[0]}"></i>`).join("")}</span>
          <small style="color:${c}">${esc(p.estado)}${last ? ` · ${esc(last.lugar)} · ${fechaCorta(last.fecha)} ${esc(last.hora || "")}` : ""}</small></span></button>
        ${selId === p.id ? `<div class="mp-tl">${(p.eventos || []).slice().reverse().map(e => `<div><time>${fechaCorta(e.fecha)} ${esc(e.hora || "")}</time><b>${esc(e.lugar)}</b><span>${esc(e.evento)}</span></div>`).join("") || "<div>Sin eventos todavía.</div>"}
          ${p.destino ? "" : '<div class="dash">El destino aparece cuando el transportista escanea el paquete.</div>'}</div>` : ""}`;
    }).join("") : `<p class="mp-empty">No hay pedidos con este filtro. Cuando haya compras de eBay o guías del courier, aparecen aquí.</p>`;
  }
  function renderMap() {
    const svg = $m("mpS"), L = list();
    let h = `<defs><radialGradient id="mpG"><stop offset="0" stop-color="#4FD1E8" stop-opacity=".9"/><stop offset="1" stop-color="#4FD1E8" stop-opacity="0"/></radialGradient></defs>`;
    for (let lon = -120; lon <= -70; lon += 10) h += `<line x1="${X(lon)}" y1="20" x2="${X(lon)}" y2="580" class="mp-grid"/>`;
    for (let lat = 25; lat <= 50; lat += 5) h += `<line x1="20" y1="${Y(lat)}" x2="980" y2="${Y(lat)}" class="mp-grid"/>`;
    h += `<path d="M${US.map(([lo, la]) => `${X(lo).toFixed(1)},${Y(la).toFixed(1)}`).join("L")}Z" class="mp-us"/>`;
    CITIES.forEach(([n, la, lo]) => { h += `<circle cx="${X(lo)}" cy="${Y(la)}" r="3" class="mp-city"/><text x="${X(lo) + 6}" y="${Y(la) + 4}" class="mp-ctx">${n}</text>`; });
    L.forEach(p => {
      const ev = (p.eventos || []).filter(e => e.lat && e.lon), c = GCOL[group(p.estado)], on = !selId || selId === p.id;
      const pts = ev.map(e => [X(+e.lon), Y(+e.lat)]);
      if (p.destino_lat && p.destino_lon) {
        const d = [X(+p.destino_lon), Y(+p.destino_lat)], cur = pts[pts.length - 1];
        if (cur) h += `<path d="M${cur[0]},${cur[1]} Q${(cur[0] + d[0]) / 2},${Math.min(cur[1], d[1]) - 60} ${d[0]},${d[1]}" class="mp-todo" style="opacity:${on ? 1 : .25}"/>`;
        h += `<g style="opacity:${on ? 1 : .3}"><rect x="${d[0] - 6}" y="${d[1] - 6}" width="12" height="12" rx="2" fill="#0B1620" stroke="${c}" stroke-width="2"/><text x="${d[0] + 10}" y="${d[1] - 8}" class="mp-lbl">${esc(p.destino)}</text></g>`;
      }
      if (pts.length > 1) h += `<polyline points="${pts.map(q => q.join(",")).join(" ")}" fill="none" stroke="${c}" stroke-width="3" style="opacity:${on ? 1 : .25}"/>`;
      if (pts.length) {
        const o = pts[0], cur = pts[pts.length - 1];
        h += `<circle cx="${o[0]}" cy="${o[1]}" r="5" fill="none" stroke="${c}" stroke-width="2" style="opacity:${on ? 1 : .3}"/>`;
        h += `<g class="mp-pin" data-id="${esc(p.id)}" style="opacity:${on ? 1 : .35}"><circle cx="${cur[0]}" cy="${cur[1]}" r="22" fill="url(#mpG)" class="mp-pulse"/><circle cx="${cur[0]}" cy="${cur[1]}" r="8" fill="${c}" stroke="#0B1620" stroke-width="2"/>
          <text x="${cur[0] + 12}" y="${cur[1] - 12}" class="mp-lbl">${esc(p.producto)}${p.prueba ? " (prueba)" : ""}</text><text x="${cur[0] + 12}" y="${cur[1] + 6}" class="mp-sub">${esc(p.estado)} · ${esc(ev[ev.length - 1].lugar)}</text></g>`;
      }
    });
    if (!L.some(p => (p.eventos || []).some(e => e.lat))) h += `<text x="500" y="300" text-anchor="middle" class="mp-sub">Sin envíos con ubicación todavía</text>`;
    svg.innerHTML = h;
  }
  function render() { renderList(); renderMap(); }
  box.addEventListener("click", e => {
    if (e.target === box) { close(); return; }
    const it = e.target.closest("[data-id]"); if (it) { selId = selId === it.dataset.id ? null : it.dataset.id; render(); }
  });
  $m("mpX").onclick = close;
  $m("mpT").onchange = e => { showTest = e.target.checked; render(); };
  box.querySelectorAll("#mpF button").forEach(b => b.onclick = () => { filt = b.dataset.f; box.querySelectorAll("#mpF button").forEach(x => x.setAttribute("aria-pressed", x === b)); render(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !box.hidden) close(); });
  let lastFocus = null;
  function open() { lastFocus = document.activeElement; render(); box.hidden = false; $m("mpX").focus(); }
  function close() { box.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  window.abrirMapa = open;
  document.addEventListener("click", e => { if (e.target.closest("[data-mapa]")) open(); });
})();
