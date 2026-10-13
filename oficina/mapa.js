/* Pantalla del agente Pedidos: mapa con zoom (Leaflet) de EE.UU. hasta las calles, con el recorrido de cada envío.
   Lee D.pedidos (generar.py: pedidos.csv + pedidos-prueba.csv + seguimiento.csv) y los datos de oficina/mapa/
   (mapa_datos.py: Natural Earth + calles de OpenStreetMap). Nunca muestra guías ni direcciones. */
(function () {
  const STEPS = [["Etiqueta creada", /etiqueta|comprado|pagado|esperando/i], ["Enviado", /enviado|recibido|aceptado|tr[aá]nsito|en ruta|departed|arrived/i],
    ["Bodega courier", /bodega|courier|miami|warehouse/i], ["Rumbo a Bolivia", /bolivia|vuelo|aduana|camino/i], ["Entregado", /entregado|cochabamba|delivered/i]];
  const stepOf = e => { let k = 0; STEPS.forEach(([, re], i) => { if (re.test(e || "")) k = i; }); return k; };
  const group = e => stepOf(e) === 0 ? "espera" : stepOf(e) >= 4 ? "entregado" : "camino";
  const GCOL = { espera: "#4FD1E8", camino: "#F2A541", entregado: "#5CD69A" };
  const CBBA = [-17.39, -66.157];
  const US_VIEW = [[24.2, -125], [49.5, -66.8]];
  let filt = "", showTest = true, selId = null, map = null, base = null, layShip = null, ready = null;

  const box = document.createElement("div");
  box.className = "mapa"; box.id = "mapa"; box.hidden = true; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Mapa de envíos");
  box.innerHTML = `<div class="mp-card">
    <div class="mp-head"><div><b>Pantalla de Pedidos</b><span>Mapa de envíos · rueda o pellizco para acercar</span></div>
      <div class="mp-tools"><div class="seg" id="mpF"><button type="button" data-f="" aria-pressed="true">Todos</button><button type="button" data-f="espera" aria-pressed="false">En espera</button><button type="button" data-f="camino" aria-pressed="false">En camino</button><button type="button" data-f="entregado" aria-pressed="false">Entregados</button></div>
      <label class="mp-chk"><input type="checkbox" id="mpT" checked> Pedidos de prueba</label><button type="button" class="mp-x" id="mpX">Cerrar</button></div></div>
    <div class="mp-body"><div class="mp-list" id="mpL"></div>
      <div class="mp-map"><div class="mp-canvas"><div id="mpS" aria-label="Mapa de Estados Unidos con los envíos"></div>
        <div class="mp-jump" id="mpJ"><button type="button" data-v="us">EE.UU.</button><button type="button" data-v="ruta">Ruta a Bolivia</button></div>
        <div class="mp-zoom" id="mpZ"></div><div class="mp-wait" id="mpW">Cargando mapa…</div></div>
        <div class="mp-leg"><span><i style="background:#4FD1E8"></i>En espera</span><span><i style="background:#F2A541"></i>En camino</span><span><i style="background:#5CD69A"></i>Entregado</span><span><i class="dash"></i>Falta recorrer</span><span class="mp-attr">Mapa: Natural Earth · calles © colaboradores de OpenStreetMap</span></div></div></div></div>`;
  document.body.appendChild(box);
  const $m = id => box.querySelector("#" + id);

  function pkgIcon(c) { return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 13 20 6l14 7v15l-14 7-14-7z" fill="${c}22" stroke="${c}" stroke-width="2"/><path d="M6 13l14 7 14-7M20 20v15" fill="none" stroke="${c}" stroke-width="2"/></svg>`; }
  function list() { return (D.pedidos || []).filter(p => (showTest || !p.prueba) && (!filt || group(p.estado) === filt)); }
  const located = p => (p.eventos || []).filter(e => e.lat && e.lon);
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
          <small style="color:${c}">${esc(p.estado)}${last ? ` · ${esc(cityOnly(last.lugar))} · ${fechaCorta(last.fecha)} ${esc(last.hora || "")}` : ""}</small></span></button>
        ${selId === p.id ? `<div class="mp-tl">${(p.eventos || []).slice().reverse().map(e => `<div><time>${fechaCorta(e.fecha)} ${esc(e.hora || "")}</time><b>${esc(cityOnly(e.lugar))}</b><span>${esc(e.evento)}</span></div>`).join("") || "<div>Sin eventos todavía.</div>"}
          ${p.destino ? "" : '<div class="dash">El destino aparece cuando el transportista escanea el paquete.</div>'}</div>` : ""}`;
    }).join("") : `<p class="mp-empty">No hay pedidos con este filtro. Cuando haya compras de eBay o guías del courier, aparecen aquí.</p>`;
  }
  // el código postal no se muestra: solo la ciudad
  const cityOnly = s => String(s || "").replace(/\s*\d{5}(-\d{4})?$/, "");

  /* ---------- Mapa base ---------- */
  const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });
  const ll = c => [c[1], c[0]];
  const lines = g => g.map(l => l.map(ll));
  const polys = g => g.map(poly => poly.map(ring => ring.map(ll)));

  function label(text, latlng, cls) { return L.marker(latlng, { interactive: false, keyboard: false, icon: L.divIcon({ className: "mp-tag " + cls, html: `<span>${esc(text)}</span>`, iconSize: null }) }); }

  function setup() {
    if (ready) return ready;
    map = L.map($m("mpS"), { zoomControl: false, attributionControl: false, minZoom: 3, maxZoom: 18, worldCopyJump: false, preferCanvas: true, zoomSnap: 0.5 });
    L.control.zoom({ position: "bottomright", zoomInTitle: "Acercar", zoomOutTitle: "Alejar" }).addTo(map);
    map.fitBounds(US_VIEW);
    // el contenedor cambia de tamaño al abrir la pantalla: Leaflet tiene que volver a medir y redibujar
    if (window.ResizeObserver) new ResizeObserver(() => { if (!box.hidden) { map.invalidateSize({ pan: false }); map.fire("moveend"); } }).observe($m("mpS"));
    map.createPane("calles").style.zIndex = 420;
    map.createPane("envios").style.zIndex = 640;
    const svgShip = L.svg({ pane: "envios" });
    layShip = L.layerGroup().addTo(map);
    layShip._svg = svgShip;
    ready = Promise.all([getJSON("mapa/base.json"), getJSON("mapa/rutas.json"), getJSON("mapa/urbano.json"), getJSON("mapa/calles/indice.json").catch(() => [])]).then(([b, rutas, urb, zonas]) => {
      base = b;
      const cv = L.canvas({ padding: 0.3 });
      L.polygon(b.paises.map(p => polys(p.g)).flat(), { renderer: cv, interactive: false, stroke: true, color: "#1E3A50", weight: 1, fillColor: "#0E1F2C", fillOpacity: 1 }).addTo(map);
      const est = L.layerGroup().addTo(map);
      b.estados.forEach(s => {
        L.polygon(polys(s.g), { renderer: cv, color: "#2E5A78", weight: 1.2, fillColor: "#112A3B", fillOpacity: 1 })
          .on("mouseover", e => e.target.setStyle({ fillColor: "#16364C" })).on("mouseout", e => e.target.setStyle({ fillColor: "#112A3B" }))
          .on("click", e => { if (map.getZoom() < 6) map.flyToBounds(e.target.getBounds(), { duration: 0.8, padding: [20, 20] }); })
          .addTo(est);
      });
      L.polygon(urb.map(u => polys(u.g)).flat(), { renderer: cv, interactive: false, stroke: false, fillColor: "#1C3A50", fillOpacity: 1 }).addTo(map);
      const r1 = L.polyline(rutas.filter(r => r.k === 1).map(r => lines(r.g)).flat(), { renderer: cv, interactive: false, color: "#4A7590", weight: 1.4, opacity: .9 });
      const r2 = L.polyline(rutas.filter(r => r.k === 2).map(r => lines(r.g)).flat(), { renderer: cv, interactive: false, color: "#35596F", weight: 1, opacity: .9 });
      // etiquetas de estados y ciudades según el zoom
      const tagsE = L.layerGroup(b.estados.filter(s => s.n !== "Alaska" && s.n !== "Hawaii").map(s => label(s.n, s.c, "mp-tag-st")));
      const tagsC = b.ciudades.map(c => ({ c, m: L.layerGroup([L.circleMarker(c.c, { renderer: cv, interactive: false, radius: 2.5, stroke: false, fillColor: "#8FB0C6", fillOpacity: 1 }), label(c.n, c.c, "mp-tag-ci")]) }));
      const calles = {};
      const zLay = L.layerGroup().addTo(map);
      const zTags = L.layerGroup(zonas.map(z => label("Calles de " + z.n, z.c, "mp-tag-z"))).addTo(map);
      function sync() {
        const z = map.getZoom(), bb = map.getBounds().pad(0.2);
        z >= 5 ? r1.addTo(map) : r1.remove();
        z >= 6.5 ? r2.addTo(map) : r2.remove();
        z >= 4.5 && z < 8 ? tagsE.addTo(map) : tagsE.remove();
        const minPop = z < 5 ? 3e6 : z < 6 ? 1e6 : z < 7 ? 4e5 : z < 8 ? 1.5e5 : z < 10 ? 5e4 : 0;
        tagsC.forEach(({ c, m }) => (c.p >= minPop && z < 13.5 && bb.contains(c.c)) ? m.addTo(map) : m.remove());
        z >= 9 && z < 12 ? zTags.addTo(map) : zTags.remove();
        if (z >= 11) zonas.forEach(zn => {
          if (calles[zn.f] || !bb.contains(zn.c) && map.distance(map.getCenter(), zn.c) > zn.r * 3) return;
          calles[zn.f] = "cargando";
          getJSON("mapa/calles/" + zn.f).then(d => { calles[zn.f] = drawStreets(d); calles[zn.f].addTo(zLay); }).catch(() => { delete calles[zn.f]; });
        });
        z >= 11 ? zLay.addTo(map) : zLay.remove();
        $m("mpZ").textContent = z >= 14 ? "Nivel calle" : z >= 11 ? "Ciudad" : z >= 6 ? "Estado" : "País";
      }
      map.on("zoomend moveend", sync);
      $m("mpW").hidden = true;
      map.fitBounds(US_VIEW, { animate: false }); sync();
    }).catch(e => { $m("mpW").textContent = "No se pudo cargar el mapa (" + e.message + ")"; });
    return ready;
  }
  const SW = { 1: ["#E9B45E", 4.5], 2: ["#C6D6E2", 3.2], 3: ["#93AFC4", 2.4], 4: ["#5F7E95", 1.5] };
  function drawStreets(d) {
    const g = L.layerGroup(), cv = L.canvas({ pane: "calles", padding: 0.3, tolerance: 4 });
    [4, 3, 2, 1].forEach(k => d.l.filter(s => s.k === k).forEach(s => {
      const pl = L.polyline(s.g.map(ll), { renderer: cv, color: SW[k][0], weight: SW[k][1], opacity: k === 4 ? .8 : .95, lineCap: "round" });
      if (s.n) pl.bindTooltip(s.n, { sticky: true, className: "mp-tip", direction: "top" });
      g.addLayer(pl);
    }));
    return g;
  }

  /* ---------- Envíos ---------- */
  function arc(a, b, n = 48) {
    // curva suave entre dos puntos (lat, lon) para las rutas largas
    const [la1, lo1] = a, [la2, lo2] = b, d = Math.hypot(la2 - la1, lo2 - lo1), mx = (la1 + la2) / 2, my = (lo1 + lo2) / 2;
    const nx = -(lo2 - lo1) / (d || 1), ny = (la2 - la1) / (d || 1), h = d * 0.18;
    const c = [mx + nx * h, my + ny * h], out = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * la1 + 2 * u * t * c[0] + t * t * la2, u * u * lo1 + 2 * u * t * c[1] + t * t * lo2]); }
    return out;
  }
  function pin(c, on) {
    return L.divIcon({ className: "mp-pinwrap", iconSize: [44, 44], iconAnchor: [22, 22], html: `<span class="mp-pulse" style="background:${c}"></span><span class="mp-dot" style="background:${c};opacity:${on ? 1 : .45}"></span>` });
  }
  function renderMap() {
    if (!map) return;
    layShip.clearLayers();
    const svg = layShip._svg, L2 = list();
    L2.forEach(p => {
      const ev = located(p), c = GCOL[group(p.estado)], on = !selId || selId === p.id;
      const pts = ev.map(e => [+e.lat, +e.lon]);
      if (!pts.length) return;
      const cur = pts[pts.length - 1];
      let dest = p.destino_lat && p.destino_lon ? [+p.destino_lat, +p.destino_lon] : (!p.prueba && group(p.estado) !== "entregado" ? CBBA : null);
      if (dest) layShip.addLayer(L.polyline(arc(cur, dest), { renderer: svg, color: "#9FB6C7", weight: 2, dashArray: "6 8", opacity: on ? .9 : .25, interactive: false }));
      if (dest) layShip.addLayer(L.circleMarker(dest, { renderer: svg, radius: 6, color: c, weight: 2, fillColor: "#0B1620", fillOpacity: 1 }).bindTooltip(p.destino || "Cochabamba", { className: "mp-tip" }));
      if (pts.length > 1) {
        const path = pts.slice(1).reduce((acc, q, i) => acc.concat(arc(pts[i], q, 24).slice(1)), [pts[0]]);
        layShip.addLayer(L.polyline(path, { renderer: svg, color: c, weight: 4, opacity: on ? 1 : .3, interactive: false }));
        layShip.addLayer(L.polyline(path, { renderer: svg, color: "#ffffff", weight: 2, opacity: on ? .8 : 0, dashArray: "2 14", className: "mp-ant", interactive: false }));
      }
      ev.forEach((e, i) => layShip.addLayer(L.circleMarker(pts[i], { renderer: svg, radius: 4, color: c, weight: 2, fillColor: "#0B1620", fillOpacity: 1, opacity: on ? 1 : .35 })
        .bindTooltip(`<b>${esc(cityOnly(e.lugar))}</b><br>${fechaCorta(e.fecha)} ${esc(e.hora || "")} · ${esc(e.evento)}`, { className: "mp-tip" })));
      const last = ev[ev.length - 1];
      layShip.addLayer(L.marker(cur, { icon: pin(c, on), zIndexOffset: on ? 1000 : 0, keyboard: true, title: p.producto })
        .bindTooltip(`<b>${esc(p.producto)}${p.prueba ? " · PRUEBA" : ""}</b><br>${esc(p.estado)} · ${esc(cityOnly(last.lugar))}`, { permanent: on && !!selId || L2.length <= 3, direction: "right", offset: [16, 0], className: "mp-tip mp-tip-pin" })
        .on("click", () => select(p.id, true)));
    });
  }
  function select(id, fly) {
    selId = selId === id ? null : id; render();
    const p = (D.pedidos || []).find(x => x.id === selId), ev = p ? located(p) : [];
    if (fly && ev.length) map.flyTo([+ev[ev.length - 1].lat, +ev[ev.length - 1].lon], 14, { duration: 1.6 });
  }
  function render() { renderList(); renderMap(); }

  box.addEventListener("click", e => {
    if (e.target === box) { close(); return; }
    const it = e.target.closest(".mp-item[data-id]"); if (it) select(it.dataset.id, true);
  });
  $m("mpJ").addEventListener("click", e => {
    const v = e.target.closest("[data-v]"); if (!v || !map) return;
    if (v.dataset.v === "us") map.flyToBounds(US_VIEW, { duration: 1.2 });
    else map.flyToBounds([[CBBA[0] - 2, CBBA[1] - 4], [47, -122]], { duration: 1.4 });
  });
  $m("mpX").onclick = close;
  $m("mpT").onchange = e => { showTest = e.target.checked; render(); };
  box.querySelectorAll("#mpF button").forEach(b => b.onclick = () => { filt = b.dataset.f; box.querySelectorAll("#mpF button").forEach(x => x.setAttribute("aria-pressed", x === b)); render(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !box.hidden) close(); });
  let lastFocus = null;
  function open() {
    lastFocus = document.activeElement; box.hidden = false; renderList(); $m("mpX").focus();
    if (!window.L) { $m("mpW").textContent = "No se pudo cargar la librería del mapa."; return; }
    requestAnimationFrame(() => setup().then(() => { map.invalidateSize(); map.fire("moveend"); renderMap(); }));
  }
  function close() { box.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  window.abrirMapa = open;
  document.addEventListener("click", e => { if (e.target.closest("[data-mapa]")) open(); });
})();
