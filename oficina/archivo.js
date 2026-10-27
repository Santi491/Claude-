/* Archivo de documentos: explorador a pantalla completa con un archivero animado (un cajón por tipo de archivo).
   Al cambiar de cajón, el anterior se cierra, el nuevo se abre y las carpetas van saliendo una por una.
   Lee D.documentos (Excel, tablas CSV y PDF, informes, comparación), D.informes_gerente (Google Docs), D.capturas y D.catalogos (catálogos y listas de precios de las tiendas).
   Se abre con el segundo toque en el archivero 3D, con el botón "Abrir archivo" del panel o con window.abrirArchivo(). */
(function () {
  const DOCS = D.documentos || [];
  const byDate = (a, b) => String(b.fecha || "").localeCompare(String(a.fecha || ""));
  const docItem = d => ({ id: "doc:" + d.id, titulo: d.titulo, fecha: d.fecha, ext: extOf(d), doc: d });
  const CAJONES = [
    { id: "excel", nombre: "Excel", sub: "Libro con fórmulas", col: "#5CD69A", ext: "XLSX",
      items: () => DOCS.filter(d => d.tipo === "Excel").map(docItem) },
    { id: "pdf", nombre: "Tablas en PDF", sub: "La tabla de cada día", col: "#F07A7A", ext: "PDF",
      items: () => DOCS.filter(d => d.tipo === "PDF").sort(byDate).map(docItem) },
    { id: "csv", nombre: "Tablas en CSV", sub: "Datos del día e historial", col: "#4FD1E8", ext: "CSV",
      items: () => DOCS.filter(d => d.tipo === "CSV").sort(byDate).map(docItem) },
    { id: "inf", nombre: "Informes diarios", sub: "Rutina de la nube, 7:52", col: "#6C8CF5", ext: "MD",
      items: () => DOCS.filter(d => d.tipo === "Informe de la nube").sort(byDate).map(docItem) },
    { id: "ger", nombre: "Informes del Gerente", sub: "Google Docs, 20:00", col: "#D9A441", ext: "DOC",
      items: () => (D.informes_gerente || []).slice().sort(byDate).map((g, k) => ({ id: "ger:" + k, titulo: `Informe del Gerente · ${g.tipo}`, fecha: g.fecha, ext: "DOC", ger: g })) },
    { id: "comp", nombre: "Comparación", sub: "EE.UU. contra Cochabamba", col: "#C46FD8", ext: "MD",
      items: () => DOCS.filter(d => d.tipo === "Tabla de comparación").map(docItem) },
    { id: "cat", nombre: "Catálogos de tiendas", sub: "Listas de precios que mandan", col: "#E5C07B", ext: "PDF",
      items: () => (D.catalogos || []).slice().sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora)).map((c, k) => ({ id: "cat:" + k, titulo: `${c.tienda} · ${c.descripcion || "catálogo"}`, fecha: c.fecha, ext: (c.formato || "PDF").toUpperCase(), cat: c })) },
    { id: "cap", nombre: "Capturas", sub: "Lo que vio cada agente", col: "#F2A541", ext: "JPG",
      items: () => (D.capturas || []).slice().sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora)).map((c, k) => ({ id: "cap:" + k, titulo: c.descripcion || c.archivo, fecha: c.fecha, ext: "JPG", cap: c })) },
  ];
  CAJONES.forEach(c => { c.lista = c.items(); });
  const AGN = { nube: "Informe diario", ebay: "Rastreador eBay", wa: "WhatsApp", mkt: "Marketplace", ana: "Analista", pedidos: "Pedidos", fin: "Finanzas", dem: "Demanda", gerente: "Gerente" };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const T = reduce ? 0 : 1;   // escala de tiempos de las animaciones

  /* ---------- Estilos ---------- */
  const st = document.createElement("style");
  st.textContent = `
.archivo[hidden]{display:none}
.archivo{position:fixed;inset:0;z-index:55;background:rgba(10,10,10,.74);display:grid;place-items:center;padding:3vh 3vw;color-scheme:dark}
.ar-card{width:min(1440px,100%);height:min(900px,94vh);background:var(--o-bg);color:var(--o-ink);border:1px solid var(--o-line);border-radius:14px;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55)}
.ar-head{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--o-line);background:var(--o-panel)}
.ar-head b{font:800 20px var(--f-display);font-stretch:82%;margin-right:10px}
.ar-head span{font:500 12px var(--f-mono);color:var(--o-muted)}
.ar-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ar-tools input{font:500 14px var(--f-body);background:#1B1B1C;color:var(--o-ink);border:1px solid var(--o-line);border-radius:7px;padding:7px 10px;width:min(260px,60vw)}
.ar-body{display:grid;grid-template-columns:290px minmax(0,1fr) 0;min-height:0;transition:grid-template-columns .45s cubic-bezier(.2,.8,.2,1)}
.ar-body.prev{grid-template-columns:290px minmax(0,1fr) min(560px,46%)}
/* archivero */
.ar-cabwrap{border-right:1px solid var(--o-line);padding:18px 16px;overflow:auto;background:linear-gradient(#19191A,#121314)}
.ar-cabwrap h5{margin:0 0 12px;font:600 11px var(--f-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--o-muted)}
.ar-cab{perspective:900px;perspective-origin:50% 20%;display:grid;gap:7px;padding:12px 10px 16px;border-radius:10px;background:linear-gradient(180deg,#3D3F42,#2D2E30);box-shadow:inset 0 0 0 2px #1C1D1F,0 14px 30px rgba(0,0,0,.45)}
.ar-dr{position:relative;transform-style:preserve-3d;transform:translateZ(0);transition:transform .5s cubic-bezier(.2,.8,.2,1),box-shadow .5s;cursor:pointer;border:0;padding:0;text-align:left;font:inherit;color:inherit;background:none;display:block;width:100%}
.ar-dr .fr{display:grid;grid-template-columns:1fr auto;align-items:center;gap:6px;height:58px;padding:0 12px 0 14px;border-radius:5px;background:linear-gradient(180deg,#4E5053,#393B3E);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),inset 0 -2px 0 rgba(0,0,0,.35)}
.ar-dr .lab{display:grid;gap:1px;background:#EDE8DC;color:#2a2620;border-radius:3px;padding:4px 8px;box-shadow:inset 0 0 0 1px #b9b1a0;max-width:170px}
.ar-dr .lab b{font:700 12.5px var(--f-body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ar-dr .lab small{font:500 10px var(--f-mono);color:#6d6455}
.ar-dr .hd{width:46px;height:9px;border-radius:5px;background:linear-gradient(#e2c27e,#a8823e);box-shadow:0 2px 3px rgba(0,0,0,.4)}
.ar-dr .ct{position:absolute;right:10px;top:6px;font:700 10px var(--f-mono);color:#151516;background:var(--c);border-radius:8px;padding:0 6px}
/* el cajón abierto sale hacia el usuario y muestra las carpetas de adentro */
.ar-dr .tray{position:absolute;left:6px;right:6px;bottom:100%;height:0;overflow:hidden;border-radius:4px 4px 0 0;background:#1E1F20;transition:height .5s cubic-bezier(.2,.8,.2,1);display:flex;align-items:flex-end;gap:3px;padding:0 8px}
.ar-dr .tray i{flex:1;height:70%;border-radius:3px 3px 0 0;background:var(--c);opacity:.85;transform:translateY(100%);transition:transform .4s cubic-bezier(.2,.8,.2,1)}
.ar-dr.on{transform:translateZ(70px) translateY(4px);z-index:2}
.ar-dr.on .fr{box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 18px 24px rgba(0,0,0,.55),0 0 0 2px var(--c)}
.ar-dr.on .tray{height:26px}
.ar-dr.on .tray i{transform:none}
.ar-dr:focus-visible{outline:2px solid var(--o-amber);outline-offset:3px}
.ar-dr:hover:not(.on){transform:translateZ(14px)}
/* explorador */
.ar-exp{display:grid;grid-template-rows:auto minmax(0,1fr);min-width:0;min-height:0}
.ar-bar{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--o-line);background:#19191A}
.ar-crumb{display:flex;align-items:center;gap:6px;font:600 13px var(--f-mono);color:var(--o-muted);margin-right:auto;min-width:0}
.ar-crumb b{color:var(--o-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ar-crumb .sep{opacity:.5}
.ar-crumb .cur{animation:arCrumb .45s ease both}
@keyframes arCrumb{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
.ar-view{display:flex;border:1px solid var(--o-line);border-radius:6px;overflow:hidden}
.ar-view button{font:600 12px var(--f-mono);color:var(--o-ink);background:#1B1B1C;border:0;padding:6px 10px;cursor:pointer}
.ar-view button[aria-pressed="true"]{background:var(--o-cyan);color:var(--o-bg)}
.ar-list{overflow:auto;padding:18px;display:grid;gap:12px;align-content:start;grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.ar-list.lista{grid-template-columns:1fr;gap:6px}
.ar-empty{grid-column:1/-1;color:var(--o-muted);font-size:14px;padding:20px 4px}
.ar-sum{grid-column:1/-1;font:500 12px var(--f-mono);color:var(--o-muted);margin:-4px 0 2px}
/* carpeta colgante con su pestaña */
.ar-f{position:relative;text-align:left;font:inherit;color:var(--o-ink);background:#1F2022;border:1px solid var(--o-line);border-radius:4px 10px 10px 10px;padding:16px 14px 12px;cursor:pointer;display:grid;gap:6px;min-height:118px;transition:transform .2s,border-color .2s,box-shadow .2s}
.ar-f::before{content:"";position:absolute;left:-1px;top:-11px;width:44%;height:12px;border:1px solid var(--o-line);border-bottom:0;border-radius:6px 6px 0 0;background:#1F2022}
.ar-f::after{content:"";position:absolute;left:10px;top:-7px;width:28%;height:4px;border-radius:2px;background:var(--c)}
.ar-f:hover,.ar-f.sel{border-color:var(--c);transform:translateY(-3px);box-shadow:0 10px 22px rgba(0,0,0,.35)}
.ar-f .ex{justify-self:start;font:700 10px var(--f-mono);letter-spacing:.06em;color:#151516;background:var(--c);border-radius:4px;padding:1px 6px}
.ar-f b{font:600 14px/1.3 var(--f-body);overflow-wrap:anywhere}
.ar-f small{font:500 11.5px var(--f-mono);color:var(--o-muted)}
.ar-f img{width:100%;height:88px;object-fit:cover;border-radius:6px;background:#101011}
.ar-list.lista .ar-f{grid-template-columns:56px 1fr auto;align-items:center;min-height:0;padding:10px 12px;border-radius:8px}
.ar-list.lista .ar-f::before,.ar-list.lista .ar-f::after{display:none}
.ar-list.lista .ar-f img{height:36px}
.ar-list.lista .ar-f small{white-space:nowrap}
/* animaciones de búsqueda: las carpetas se hunden en el cajón y las nuevas suben una por una */
.ar-list.closing .ar-f{animation:arDown .24s ease-in both}
.ar-list.opening .ar-f{animation:arUp .5s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 55ms + 120ms)}
@keyframes arDown{to{opacity:0;transform:translateY(34px) scale(.96)}}
@keyframes arUp{from{opacity:0;transform:perspective(600px) translateY(46px) rotateX(-38deg)}60%{opacity:1}to{opacity:1;transform:none}}
.ar-list .finger{grid-column:1/-1;height:3px;border-radius:2px;background:linear-gradient(90deg,transparent,var(--o-amber),transparent);background-size:40% 100%;background-repeat:no-repeat;animation:arScan 1s ease-in-out both;opacity:.9}
@keyframes arScan{from{background-position:-40% 0}to{background-position:140% 0;opacity:0}}
/* vista previa */
.ar-prev{border-left:1px solid var(--o-line);min-width:0;min-height:0;overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr);grid-template-columns:minmax(0,1fr);background:var(--o-panel)}
.ar-prev .pb{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--o-line)}
.ar-prev .pb b{margin-right:auto;min-width:0;flex:1 1 160px;font:700 15px var(--f-display);font-stretch:88%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ar-prev .pb a,.ar-prev .pb button{font:600 12px var(--f-mono);color:var(--o-cyan);background:transparent;border:1px solid var(--o-line);border-radius:5px;padding:5px 10px;cursor:pointer;text-decoration:none;white-space:nowrap}
.ar-prev .pc{overflow:auto;padding:14px 16px}
.ar-prev .pc.dbody{display:block}
.ar-prev .pc .viewer .vbar{display:none}
.ar-prev .pc img{width:100%;border-radius:8px;border:1px solid var(--o-line)}
.ar-prev .pc .ar-note{font:500 13px/1.5 var(--f-body);color:var(--o-muted)}
.ar-prev .pc .big{display:grid;place-items:center;gap:10px;padding:40px 10px;text-align:center}
.ar-prev .pc .big .ico{font:800 34px var(--f-display);color:#151516;background:var(--c);border-radius:10px;padding:14px 18px}
.ar-body.prev .ar-prev{animation:arIn .45s cubic-bezier(.2,.8,.2,1) both}
@keyframes arIn{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:none}}
@media (max-width:860px){
  .archivo{padding:0}.ar-card{height:100vh;border-radius:0}
  .ar-body,.ar-body.prev{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
  .ar-cabwrap{border-right:0;border-bottom:1px solid var(--o-line);padding:10px}
  .ar-cabwrap h5{display:none}
  .ar-cab{grid-auto-flow:column;grid-auto-columns:minmax(150px,1fr);overflow-x:auto;perspective:none;padding:8px}
  .ar-dr.on{transform:translateY(-3px)}.ar-dr .tray{display:none}
  .ar-prev{display:none}
  .ar-body.prev .ar-prev{display:grid;position:absolute;inset:0;z-index:3}
  .ar-head span{display:block}
  .ar-list{padding:14px;grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
  .ar-body{position:relative}
}
@media (prefers-reduced-motion:reduce){.ar-dr,.ar-dr .tray,.ar-dr .tray i,.ar-body{transition:none}.ar-list .ar-f,.ar-crumb .cur,.ar-body.prev .ar-prev{animation:none}.ar-list .finger{display:none}}
`;
  document.head.appendChild(st);

  /* ---------- Estructura ---------- */
  const total = CAJONES.reduce((n, c) => n + c.lista.length, 0);
  const box = document.createElement("div");
  box.className = "archivo"; box.hidden = true; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Archivo de documentos");
  box.innerHTML = `<div class="ar-card">
    <div class="ar-head"><div><b>Archivo de documentos</b><span>${total} archivos en ${CAJONES.length} cajones · se actualiza en cada ronda</span></div>
      <div class="ar-tools"><input type="search" id="arQ" placeholder="Buscar en todo el archivo…" aria-label="Buscar documentos"><button type="button" class="mp-x" id="arX">Cerrar</button></div></div>
    <div class="ar-body" id="arB">
      <div class="ar-cabwrap"><h5>Archivero · elige un cajón</h5><div class="ar-cab" id="arC" role="tablist" aria-orientation="vertical">
        ${CAJONES.map(c => `<button type="button" class="ar-dr" role="tab" data-c="${c.id}" style="--c:${c.col}" aria-selected="false">
          <span class="tray">${c.lista.slice(0, 7).map(() => "<i></i>").join("")}</span>
          <span class="fr"><span class="lab"><b>${esc(c.nombre)}</b><small>${esc(c.sub)}</small></span><span class="hd"></span></span>
          <span class="ct">${c.lista.length}</span></button>`).join("")}
      </div></div>
      <div class="ar-exp"><div class="ar-bar"><div class="ar-crumb" id="arP"></div>
        <div class="ar-view" role="group" aria-label="Vista"><button type="button" data-v="grid" aria-pressed="true">Carpetas</button><button type="button" data-v="lista" aria-pressed="false">Lista</button></div></div>
        <div class="ar-list" id="arL" role="tabpanel"></div></div>
      <aside class="ar-prev" id="arV" aria-live="polite"></aside>
    </div></div>`;
  document.body.appendChild(box);
  const $a = id => box.querySelector("#" + id);

  let cur = null, vista = "grid", selId = null, busy = false, q = "";
  const fecha = f => f ? fechaCorta(f) + (String(f).length >= 4 ? "/" + String(f).slice(0, 4) : "") : "";

  function card(it, i, caj) {
    const c = caj || CAJONES.find(x => x.lista.includes(it));
    const img = it.cap ? `<img src="${esc(it.cap.archivo)}" alt="" loading="lazy">` : "";
    const meta = it.cap ? `${esc(AGN[it.cap.agente] || it.cap.agente)} · ${fecha(it.fecha)} ${esc(it.cap.hora || "")}` : fecha(it.fecha);
    return `<button type="button" class="ar-f${selId === it.id ? " sel" : ""}" data-f="${esc(it.id)}" style="--c:${c.col};--i:${i}">
      ${vista === "lista" ? (img || `<span class="ex">${esc(it.ext)}</span>`) : `<span class="ex">${esc(it.ext)}</span>${img}`}
      <b>${esc(it.titulo)}</b><small>${q ? esc(c.nombre) + " · " : ""}${meta}</small></button>`;
  }
  function renderList(anim) {
    const L = $a("arL");
    L.className = "ar-list" + (vista === "lista" ? " lista" : "") + (anim ? " opening" : "");
    if (q) {
      const t = q.toLowerCase(), hits = [];
      CAJONES.forEach(c => c.lista.forEach(it => { if ((it.titulo + " " + c.nombre + " " + (it.fecha || "")).toLowerCase().includes(t)) hits.push([it, c]); }));
      L.innerHTML = `<div class="ar-sum">${hits.length} resultado${hits.length === 1 ? "" : "s"} para “${esc(q)}” en todo el archivo</div>` +
        (hits.length ? hits.map(([it, c], i) => card(it, i, c)).join("") : `<p class="ar-empty">No hay documentos con ese nombre.</p>`);
      return;
    }
    const c = CAJONES.find(x => x.id === cur);
    L.innerHTML = (anim && !reduce ? `<div class="finger" aria-hidden="true"></div>` : "") +
      (c.lista.length ? c.lista.map((it, i) => card(it, i, c)).join("") : `<p class="ar-empty">Este cajón todavía está vacío.</p>`);
  }
  function crumb() {
    const c = CAJONES.find(x => x.id === cur), it = selId && findItem(selId);
    $a("arP").innerHTML = `<span>Archivo</span><span class="sep">›</span>` + (q ? `<b class="cur">Búsqueda</b>` :
      `<b class="cur" style="color:${c.col}">${esc(c.nombre)}</b>`) + (it ? `<span class="sep">›</span><b class="cur">${esc(it[0].titulo)}</b>` : "");
  }
  const findItem = id => { for (const c of CAJONES) { const it = c.lista.find(x => x.id === id); if (it) return [it, c]; } return null; };

  // Cambiar de cajón: se hunden las carpetas, se cierra el cajón viejo, se abre el nuevo y suben las carpetas nuevas
  function abrirCajon(id, luego) {
    if (busy) return;
    const first = cur === null;
    if (id === cur && !q) { if (luego) luego(); return; }
    busy = true;
    const L = $a("arL");
    if (!first && !reduce) L.classList.add("closing");
    setTimeout(() => {
      box.querySelectorAll(".ar-dr").forEach(d => { const on = d.dataset.c === id; d.classList.toggle("on", false); d.setAttribute("aria-selected", String(on)); });
      setTimeout(() => {
        cur = id; q = ""; $a("arQ").value = "";
        box.querySelector(`.ar-dr[data-c="${id}"]`).classList.add("on");
        if (window.archivo3D) window.archivo3D.abrir(CAJONES.findIndex(c => c.id === id));
        if (!luego) cerrarPrev();
        renderList(true); crumb(); busy = false;
        if (luego) luego();
      }, first ? 0 : 260 * T);
    }, first ? 0 : 240 * T);
  }

  function preview(id) {
    const f = findItem(id); if (!f) return;
    const [it, c] = f; selId = id;
    box.querySelectorAll(".ar-f").forEach(b => b.classList.toggle("sel", b.dataset.f === id));
    let head = "", body = "";
    if (it.doc) {
      const d = it.doc;
      head = `<a href="${esc(d.url)}" target="_blank" rel="noopener">Abrir en GitHub</a>`;
      body = d.csv || d.md ? `<div class="pc dbody">${docView(d, false)}</div>` :
        `<div class="pc"><div class="big" style="--c:${c.col}"><span class="ico">${esc(it.ext)}</span><p class="ar-note">${esc(d.nota || "")}</p><a class="gh" href="${esc(d.url)}" target="_blank" rel="noopener" style="color:var(--o-cyan)">Abrir ${esc(it.ext)} en GitHub</a></div></div>`;
    } else if (it.ger) {
      head = `<a href="${esc(it.ger.url)}" target="_blank" rel="noopener">Abrir en Google Docs</a>`;
      body = `<div class="pc"><div class="big" style="--c:${c.col}"><span class="ico">DOC</span><p class="ar-note">Informe ${esc(it.ger.tipo)} del Gerente del ${fecha(it.fecha)}. Está en la carpeta INFORME DIARIO de Google Drive y se abre solo con la cuenta de Santi.</p></div></div>`;
    } else if (it.cat) {
      const k = it.cat, img = /^(JPG|JPEG|PNG|WEBP)$/.test(it.ext), CAN = { whatsapp: "WhatsApp", messenger: "Messenger", web: "su página web", correo: "correo" };
      const pr = (k.precios || []).map(p => `<tr><td>${esc(p.producto)}</td><td>${esc(p.estado || "")}</td><td style="text-align:right">Bs ${Number(p.precio_bs).toLocaleString("es-BO")}</td></tr>`).join("");
      head = k.hay_archivo ? `<a href="${esc(k.archivo)}" target="_blank" rel="noopener">Abrir ${esc(it.ext)}</a>` : "";
      body = `<div class="pc">${k.hay_archivo ? (img ? `<img src="${esc(k.archivo)}" alt="${esc(it.titulo)}">` : `<iframe src="${esc(k.archivo)}" title="${esc(it.titulo)}" style="width:100%;height:52vh;border:0;border-radius:8px;background:#fff"></iframe>`) : ""}
        <p class="ar-note"><b>${esc(k.tienda)}</b> · ${fecha(it.fecha)} ${esc(k.hora || "")} · llegó por ${esc(CAN[k.canal] || k.canal || "")}${k.productos ? ` · ${esc(k.productos)} productos` : ""}<br>${esc(k.descripcion || "")}${k.notas ? "<br>" + esc(k.notas) : ""}</p>
        ${pr ? `<p class="ar-note"><b>Precios de la lista que vigilamos</b> (ya están en precios-cochabamba.csv)</p><table style="width:100%;font-size:13px">${pr}</table>` : `<p class="ar-note">Ningún producto de la lista que vigilamos tenía precio en este catálogo.</p>`}</div>`;
    } else if (it.cap) {
      head = `<a href="${esc(it.cap.archivo)}" target="_blank" rel="noopener">Ver en grande</a>`;
      body = `<div class="pc"><img src="${esc(it.cap.archivo)}" alt="${esc(it.titulo)}"><p class="ar-note"><b>${esc(AGN[it.cap.agente] || it.cap.agente)}</b> · ${fecha(it.fecha)} ${esc(it.cap.hora || "")}<br>${esc(it.titulo)}</p></div>`;
    }
    $a("arV").innerHTML = `<div class="pb" style="--c:${c.col}"><b>${esc(it.titulo)}</b>${head}<button type="button" id="arPX">Cerrar ✕</button></div>${body}`;
    const B = $a("arB"); B.classList.remove("prev"); void B.offsetWidth; B.classList.add("prev");
    crumb();
  }
  function cerrarPrev() { selId = null; $a("arB").classList.remove("prev"); $a("arV").innerHTML = ""; box.querySelectorAll(".ar-f.sel").forEach(b => b.classList.remove("sel")); if (cur) crumb(); }

  /* ---------- Eventos ---------- */
  $a("arC").addEventListener("click", e => { const d = e.target.closest(".ar-dr"); if (d) abrirCajon(d.dataset.c); });
  $a("arC").addEventListener("keydown", e => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = CAJONES.findIndex(c => c.id === cur), n = CAJONES[(i + (e.key === "ArrowDown" ? 1 : CAJONES.length - 1)) % CAJONES.length];
    abrirCajon(n.id); box.querySelector(`.ar-dr[data-c="${n.id}"]`).focus();
  });
  $a("arL").addEventListener("click", e => {
    const f = e.target.closest(".ar-f"); if (!f) return;
    if (q) { const hit = findItem(f.dataset.f); if (hit) { const id = f.dataset.f; abrirCajon(hit[1].id, () => preview(id)); } return; }
    preview(f.dataset.f);
  });
  $a("arV").addEventListener("click", e => { if (e.target.closest("#arPX")) cerrarPrev(); });
  box.querySelector(".ar-view").addEventListener("click", e => {
    const b = e.target.closest("[data-v]"); if (!b) return;
    vista = b.dataset.v; box.querySelectorAll(".ar-view button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderList(false);
  });
  let tq = null;
  $a("arQ").addEventListener("input", e => { clearTimeout(tq); tq = setTimeout(() => { q = e.target.value.trim(); cerrarPrev(); renderList(!!q); crumb(); }, 180); });
  box.addEventListener("click", e => { if (e.target === box) close(); });
  $a("arX").onclick = () => close();
  document.addEventListener("keydown", e => {
    if (box.hidden || e.key !== "Escape") return;
    e.stopImmediatePropagation();
    if (selId) cerrarPrev(); else close();
  }, true);

  let lastFocus = null;
  function open(cajon) {
    lastFocus = document.activeElement; box.hidden = false;
    const id = cajon || cur || (CAJONES.find(c => c.lista.length) || CAJONES[0]).id;
    if (cur !== id) abrirCajon(id); else { renderList(true); crumb(); }
    box.querySelector(`.ar-dr[data-c="${id}"]`).focus();
  }
  function close() { box.hidden = true; cerrarPrev(); if (window.archivo3D) window.archivo3D.abrir(-1); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  window.abrirArchivo = open;
  window.ARCHIVO_CAJONES = CAJONES.map(c => ({ id: c.id, nombre: c.nombre, col: c.col, n: c.lista.length }));
  document.addEventListener("click", e => { const b = e.target.closest("[data-archivo]"); if (b) open(b.dataset.archivo || undefined); });
})();
