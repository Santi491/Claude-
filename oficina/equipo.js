/* Paneles del equipo: necesidades e ideas de cada agente (con aprobación de Santi), el tablero de todos los agentes,
   el simulador de pedido y los gráficos de precios. Usa D (datos.js), AG, STATES, P y las funciones de la página.
   Las decisiones de Santi se guardan en la colección `decisiones` de la base de datos de la oficina (solo el dueño
   puede escribir); la próxima ronda las pasa a plan.csv, ideas.csv y necesidades.csv con aplicar_decisiones.py. */
(function () {
  const C = { nuevo: "#2A9DB3", usado: "#B565CC", local: "#C27A22", green: "#5CD69A", amber: "#F2A541", red: "#F07A7A", muted: "#7F9AAD", ink: "#D8E8F2", line: "#1E3A4C" };
  const NOMBRE = id => (AG.find(a => a.id === id) || {}).name || ({ local: "Ronda local", santi: "Santi" }[id] || id);
  const DEC = {};           // decisiones guardadas en la oficina: id -> datos
  let db = null, owner = false, listo = false;

  /* ---------- estilos propios (mismo lenguaje que el panel del Gerente) ---------- */
  const css = document.createElement("style");
  css.textContent = `
.hudbtns{display:flex;flex-wrap:wrap;gap:6px;margin-left:auto}
.hudbtns button{font:600 12px var(--f-mono);background:#12293A;color:var(--o-ink);border:1px solid var(--o-line);border-radius:999px;padding:6px 11px;cursor:pointer;min-height:32px}
.hudbtns button:hover{border-color:var(--o-amber)}
.hudbtns .n{display:inline-block;min-width:18px;margin-left:6px;padding:0 5px;border-radius:9px;background:var(--o-amber);color:#0B1620;font-weight:700}
.eq-body{overflow:auto;padding:14px 16px 22px;display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-content:start}
.eq-body>*,.sim,.gr-wrap{min-width:0}
.sim{display:grid;grid-template-columns:minmax(0,1fr);gap:4px}
.eq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.eq-card{background:var(--o-panel);border:1px solid var(--o-line);border-radius:10px;padding:12px;display:grid;gap:8px;align-content:start}
.eq-card h4{margin:0;display:flex;align-items:center;gap:8px;font:700 16px var(--f-display);font-stretch:85%}
.eq-card h4 .dot{width:10px;height:10px;border-radius:50%;flex:none}
.eq-card .st{font:500 12px var(--f-mono);color:var(--o-muted)}
.eq-sec{font:600 11px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--o-muted);margin-top:4px}
.eq-it{border-top:1px solid var(--o-line);padding-top:8px;display:grid;gap:6px}
.eq-it p{margin:0;font-size:14px;line-height:1.4}
.eq-it small{color:var(--o-muted);font-size:12px}
.eq-it .k{font:600 10px var(--f-mono);letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:4px;justify-self:start}
.k-nec{background:#3A2814;color:#F2A541}.k-idea{background:#1E2A44;color:#9DB4F5}.k-plan{background:#10303A;color:#4FD1E8}
.eq-acts{display:flex;flex-wrap:wrap;gap:6px}
.eq-acts button{font:600 13px var(--f-body);border-radius:6px;padding:7px 12px;min-height:36px;cursor:pointer;border:1px solid var(--o-line);background:#0D1D2A;color:var(--o-ink)}
.eq-acts .ok{background:#123323;border-color:#2C6B4A;color:#8FE3B5}.eq-acts .no{background:#3A1818;border-color:#7A3434;color:#F3A3A3}
.eq-acts button:disabled{opacity:.45;cursor:not-allowed}
.eq-done{font:600 12px var(--f-mono);color:var(--o-green,#5CD69A)}
.eq-note{font-size:13px;color:var(--o-muted);margin:0}
.eq-empty{font-size:13px;color:var(--o-muted)}
.eq-filter{display:flex;flex-wrap:wrap;gap:6px}
.eq-filter button{font:600 12px var(--f-mono);background:#0D1D2A;color:var(--o-ink);border:1px solid var(--o-line);border-radius:999px;padding:6px 10px;min-height:32px;cursor:pointer}
.eq-filter button[aria-pressed="true"]{background:var(--o-amber);color:#0B1620;border-color:var(--o-amber)}
.eq-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:60;background:#102230;border:1px solid var(--o-line);color:var(--o-ink);padding:10px 14px;border-radius:8px;font-size:14px}
.sim table{width:100%;border-collapse:collapse;font-size:13px}
.sim th,.gr-table th{background:transparent;color:var(--o-muted)}
.sim td,.gr-table td{background:transparent;color:var(--o-ink);white-space:nowrap}
.sim th{font:600 11px var(--f-mono);text-transform:uppercase;letter-spacing:.06em;color:var(--o-muted);text-align:left;padding:6px 6px;border-bottom:1px solid var(--o-line)}
.sim td{padding:6px;border-bottom:1px solid var(--o-line);vertical-align:middle}
.sim td.n,.sim th.n{text-align:right;font-variant-numeric:tabular-nums}
.sim input,.sim select{font:500 13px var(--f-mono);background:#0D1D2A;color:var(--o-ink);border:1px solid var(--o-line);border-radius:6px;padding:6px 7px;min-height:34px;width:100%}
.sim input[type=number]{max-width:96px}
.sim .x{background:none;border:0;color:var(--o-muted);font-size:18px;cursor:pointer;min-width:34px;min-height:34px}
.sim .scroll{overflow-x:auto}
.sim .scroll table{min-width:640px}
.sim .opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}
.sim .opt{background:var(--o-panel);border:1px solid var(--o-line);border-radius:10px;padding:12px}
.sim .opt.best{border-color:var(--o-amber)}
.sim .opt b{display:block;font:800 22px var(--f-display);font-variant-numeric:tabular-nums}
.sim .opt span{font:500 12px var(--f-mono);color:var(--o-muted)}
.sim .row{display:flex;flex-wrap:wrap;gap:10px;align-items:end}
.sim .row label{display:grid;gap:4px;font:600 11px var(--f-mono);color:var(--o-muted);text-transform:uppercase}
.sim .add{font:600 13px var(--f-body);background:#12293A;color:var(--o-ink);border:1px solid var(--o-line);border-radius:6px;padding:8px 12px;min-height:36px;cursor:pointer}
.sim .via{font:700 11px var(--f-mono);padding:2px 6px;border-radius:4px;background:#10303A;color:#4FD1E8}
.sim .via.b{background:#3A2814;color:#F2A541}
.sim .pos{color:#8FE3B5}.sim .neg{color:#F3A3A3}
.gr-wrap{display:grid;gap:12px}
.gr-big{background:var(--o-panel);border:1px solid var(--o-line);border-radius:10px;padding:12px;position:relative}
.gr-big svg{width:100%;height:auto;display:block}
.gr-legend{display:flex;flex-wrap:wrap;gap:12px;font:500 12px var(--f-mono);color:var(--o-ink)}
.gr-legend i{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
.gr-tip{position:absolute;pointer-events:none;background:#07111A;border:1px solid var(--o-line);border-radius:6px;padding:7px 9px;font:500 12px var(--f-mono);color:var(--o-ink);white-space:nowrap;display:none}
.gr-mini{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.gr-mini button{all:unset;cursor:pointer;background:var(--o-panel);border:1px solid var(--o-line);border-radius:10px;padding:10px;display:grid;gap:4px}
.gr-mini button[aria-pressed="true"]{border-color:var(--o-amber)}
.gr-mini b{font:700 13px var(--f-body)}
.gr-mini small{font:500 11px var(--f-mono);color:var(--o-muted)}
.gr-mini svg{width:100%;height:46px}
.gr-table{width:100%;border-collapse:collapse;font:500 12px var(--f-mono)}
.gr-table th,.gr-table td{padding:5px 6px;border-bottom:1px solid var(--o-line);text-align:right}
.gr-table th:first-child,.gr-table td:first-child{text-align:left}
@media (max-width:640px){.gp-card{height:100vh;border-radius:0}.gpanel{padding:0}.eq-grid{grid-template-columns:1fr}}
`;
  document.head.appendChild(css);

  /* ---------- pendientes ---------- */
  const hoyHora = () => { const d = new Date(); const p = n => String(n).padStart(2, "0"); return { fecha: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: `${p(d.getHours())}:${p(d.getMinutes())}` }; };
  function pendientes(agente) {
    const out = [];
    (D.necesidades || []).forEach(n => out.push({ key: `necesidad-${n.id}`, tipo: "necesidad", ref: n.id, agente: n.agente, texto: n.necesita, por: n.para_que ? `Para ${n.para_que}` : "", fecha: n.fecha }));
    (D.ideas || []).filter(i => i.estado === "propuesta").forEach(i => out.push({ key: `idea-${i.id}`, tipo: "idea", ref: i.id, agente: i.agente, texto: i.idea, por: i.por_que, fecha: i.fecha }));
    (D.plan || []).filter(t => t.estado === "propuesto").forEach(t => out.push({ key: `plan-${t.id}`, tipo: "plan", ref: t.id, agente: t.agente, texto: t.tarea, por: t.motivo, fecha: t.fecha_para, n: t.id.split("-").pop() }));
    return agente ? out.filter(x => x.agente === agente) : out;
  }
  const sinDecidir = agente => pendientes(agente).filter(x => !DEC[x.key]).length;
  window.pendientesDe = sinDecidir;

  function toast(t) { const e = document.createElement("div"); e.className = "eq-toast"; e.setAttribute("role", "status"); e.textContent = t; document.body.appendChild(e); setTimeout(() => e.remove(), 3200); }

  async function decidir(it, decision) {
    if (!db || !owner) return;
    const { fecha, hora } = hoyHora();
    try {
      await db.collection("decisiones").doc(it.key).set({ tipo: it.tipo, ref: String(it.ref), agente: it.agente, decision, fecha, hora, aplicado: false });
      toast(decision === "resuelta" ? "Anotado como resuelto. El equipo lo ve en su próxima ronda." : `Tarea ${decision === "aprobado" ? "aprobada" : "rechazada"}. Se anota en la próxima ronda.`);
    } catch (e) { toast("No se pudo guardar. Prueba de nuevo en un rato."); }
  }
  async function deshacer(it) {
    if (!db || !owner) return;
    try { await db.collection("decisiones").doc(it.key).delete(); toast("Decisión borrada."); } catch (e) { toast("No se pudo deshacer."); }
  }

  /* ---------- panel genérico ---------- */
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
  let volver = null;
  function abrir(el) { volver = document.activeElement; el.hidden = false; document.body.style.overflow = "hidden"; const b = el.querySelector("[data-cerrar]"); if (b) b.focus(); }
  function cerrar(el) { el.hidden = true; document.body.style.overflow = ""; if (volver && volver.focus) volver.focus(); }

  /* ---------- Necesidades e ideas / tablero del equipo ---------- */
  let filtro = "";
  function itemHtml(it) {
    const d = DEC[it.key];
    const tipo = { necesidad: ["Necesita", "k-nec"], idea: ["Idea", "k-idea"], plan: [`Plan · tarea ${it.n}`, "k-plan"] }[it.tipo];
    let acts;
    if (d) acts = `<span class="eq-done">✓ ${d.decision === "resuelta" ? "Resuelto" : d.decision === "aprobado" ? "Aprobado" : "Rechazado"} en la oficina ${esc(fechaCorta(d.fecha))} ${esc(d.hora)}${d.aplicado ? " · ya anotado" : " · se anota en la próxima ronda"}</span>${owner && !d.aplicado ? `<button type="button" data-deshacer="${esc(it.key)}">Deshacer</button>` : ""}`;
    else if (it.tipo === "necesidad") acts = `<button type="button" class="ok" data-dec="resuelta" data-key="${esc(it.key)}" ${owner ? "" : "disabled"}>Ya está resuelto</button>`;
    else acts = `<button type="button" class="ok" data-dec="aprobado" data-key="${esc(it.key)}" ${owner ? "" : "disabled"}>Aprobar</button><button type="button" class="no" data-dec="rechazado" data-key="${esc(it.key)}" ${owner ? "" : "disabled"}>Rechazar</button>`;
    return `<div class="eq-it"><span class="k ${tipo[1]}">${tipo[0]}</span><p>${esc(it.texto)}</p>${it.por ? `<small>${esc(it.por)}</small>` : ""}<div class="eq-acts">${acts}</div></div>`;
  }
  function cardHtml(id) {
    const a = AG.find(x => x.id === id), its = pendientes(id);
    const st = a ? STATES[a.state] : { t: "", c: C.muted };
    const ult = D.actividad.filter(x => x.agente === id).slice(-1)[0];
    const grupos = [["necesidad", "Lo que necesita"], ["idea", "Sus ideas"], ["plan", "Tareas propuestas para aprobar"]];
    return `<section class="eq-card" aria-label="${esc(NOMBRE(id))}"><h4><span class="dot" style="background:${st.c}"></span>${esc(NOMBRE(id))}</h4>
      <div class="st">${esc(a ? (a.liveText || st.t) : "")}${ult ? ` · ${fechaCorta(ult.fecha)} ${esc(ult.hora || "")}` : ""}</div>
      ${ult ? `<p class="eq-note">${esc(String(ult.texto).slice(0, 180))}${String(ult.texto).length > 180 ? "…" : ""}</p>` : ""}
      ${its.length ? grupos.map(([t, lbl]) => { const g = its.filter(x => x.tipo === t); return g.length ? `<div class="eq-sec">${lbl} · ${g.length}</div>${g.map(itemHtml).join("")}` : ""; }).join("") : `<div class="eq-empty">Nada pendiente: tiene lo que necesita.</div>`}</section>`;
  }
  function renderTablero() {
    const el = panel("pTablero", "Necesidades e ideas del equipo", "lo que cada agente necesita, sus ideas y el plan · solo Santi aprueba");
    const ids = [...new Set([...AG.map(a => a.id), ...pendientes().map(x => x.agente)])];
    const total = pendientes().length, falta = sinDecidir();
    const nota = !listo ? "Conectando con la oficina…" : owner ? `Tienes ${falta} de ${total} cosas por decidir. Lo que apruebes aquí lo anota el equipo en su próxima ronda (Mac 10:30, PC 16:00 o el Gerente 20:00).`
      : "Solo Santi puede aprobar desde aquí (abre la oficina con su cuenta de Claude). Los demás ven el tablero en modo lectura.";
    const ver = filtro ? [filtro] : ids.filter(id => pendientes(id).length || AG.some(a => a.id === id));
    el.querySelector(".eq-body").innerHTML = `<p class="eq-note">${esc(nota)}</p>
      <div class="eq-filter" role="group" aria-label="Agente">${["", ...ids].map(id => `<button type="button" data-filtro="${id}" aria-pressed="${filtro === id}">${id ? esc(NOMBRE(id)) : "Todos"}${(id ? sinDecidir(id) : falta) ? ` · ${id ? sinDecidir(id) : falta}` : ""}</button>`).join("")}</div>
      <div class="eq-grid">${ver.map(cardHtml).join("")}</div>`;
    return el;
  }
  window.abrirTablero = function (agente) { filtro = agente || ""; abrir(renderTablero()); };
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-dec],[data-deshacer],[data-filtro],[data-abrir]"); if (!t) return;
    if (t.dataset.abrir) { e.preventDefault(); const w = t.dataset.abrir; if (w === "tablero") window.abrirTablero(t.dataset.agente || ""); if (w === "sim") window.abrirSimulador(); if (w === "graf") window.abrirGraficos(t.dataset.prod); return; }
    if (t.dataset.filtro != null) { filtro = t.dataset.filtro; renderTablero(); return; }
    const it = pendientes().find(x => x.key === (t.dataset.key || t.dataset.deshacer)); if (!it) return;
    if (t.dataset.dec) decidir(it, t.dataset.dec); else deshacer(it);
  });

  /* pantalla grande del tablero en la pared (la dibuja oficina3d.js con TEX.tablero) */
  function tableroCanvas() {
    const c = TEX.tablero || document.createElement("canvas"); c.width = 1600; c.height = 900; const g = c.getContext("2d");
    g.fillStyle = "#07111A"; g.fillRect(0, 0, 1600, 900); g.fillStyle = "#12293A"; g.fillRect(0, 0, 1600, 86);
    g.fillStyle = "#ECEDEF"; g.font = "800 44px Archivo, sans-serif"; g.fillText("TABLERO DEL EQUIPO", 36, 58);
    g.fillStyle = "#F2A541"; g.font = "600 30px 'IBM Plex Mono', monospace"; g.textAlign = "right";
    g.fillText(`${sinDecidir()} por decidir`, 1564, 56); g.textAlign = "left";
    const ids = AG.map(a => a.id), cols = 3, w = (1600 - 36 * 2 - 24 * (cols - 1)) / cols, h = 172;
    ids.forEach((id, k) => {
      const a = AG.find(x => x.id === id), st = STATES[a.state], x = 36 + (k % cols) * (w + 24), y = 112 + Math.floor(k / cols) * (h + 18);
      g.fillStyle = "#102230"; g.fillRect(x, y, w, h);
      g.fillStyle = st.c; g.beginPath(); g.arc(x + 30, y + 38, 12, 0, 7); g.fill();
      g.fillStyle = "#ECEDEF"; g.font = "700 32px Archivo, sans-serif"; g.fillText(a.name.slice(0, 22), x + 54, y + 49);
      g.fillStyle = "#8D949C"; g.font = "500 22px 'IBM Plex Mono', monospace"; g.fillText(String(a.liveText || st.t).slice(0, 34), x + 22, y + 92);
      const its = pendientes(id), nec = its.filter(i => i.tipo === "necesidad" && !DEC[i.key]).length, ide = its.filter(i => i.tipo !== "necesidad" && !DEC[i.key]).length;
      g.font = "600 24px 'IBM Plex Mono', monospace";
      g.fillStyle = nec ? "#F2A541" : "#56626C"; g.fillText(`necesita ${nec}`, x + 22, y + 142);
      g.fillStyle = ide ? "#9DB4F5" : "#56626C"; g.fillText(`ideas ${ide}`, x + 230, y + 142);
    });
    TEX.tablero = c; window.tableroVersion = (window.tableroVersion || 0) + 1;
  }
  tableroCanvas();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(tableroCanvas);

  /* botón en el panel de cada agente */
  const _draw = drawDrawer;
  drawDrawer = function () {
    _draw();
    if (!sel || sel === "docs" || sel === "jefe") return;
    const n = pendientes(sel).length, f = sinDecidir(sel);
    const b = document.createElement("div");
    b.innerHTML = `<button type="button" class="openmap" data-abrir="tablero" data-agente="${esc(sel)}">Necesidades e ideas${n ? ` · ${f} por decidir` : " · nada pendiente"}</button>`
      + (sel === "ana" ? `<button type="button" class="openmap" data-abrir="graf">Abrir pantalla · gráficos de precios</button><button type="button" class="openmap" data-abrir="sim">Simulador de pedido</button>` : "");
    $("dBody").prepend(b);
  };

  /* ---------- Simulador de pedido ---------- */
  const SIM = { lineas: [], cajas: 1 };
  function precioDe(p, cond) { const o = cond === "usado" ? p.us : p.nw; return o ? +(tot(o)).toFixed(2) : 0; }
  function nuevaLinea(nombre) {
    const p = P.find(x => x.name === nombre) || ranking[0] && ranking[0].p || P[0];
    return { prod: p.name, cond: p.nw ? "nuevo" : "usado", usd: precioDe(p, p.nw ? "nuevo" : "usado"), qty: 2, g: p.g || 350 };
  }
  function costoB(lineas, cajas) {
    if (!lineas.length) return { usd: 0, kg: 0, g: 0 };
    const g = lineas.reduce((s, l) => s + l.g * l.qty, 0) + 300 * cajas;
    const kg = Math.max(1, Math.ceil(g / 500) / 2);
    return { usd: kg * 28, kg, g };
  }
  const costoA = (lineas, tax) => lineas.reduce((s, l) => s + l.qty * (10 + l.usd * tax), 0);
  function simular() {
    const tax = (+$("tax").value || 0) / 100, tc = +$("tc").value || 0, L = SIM.lineas.filter(l => l.qty > 0);
    const opciones = [];
    const evalua = mask => { const A = L.filter((_, i) => mask & (1 << i)), B = L.filter((_, i) => !(mask & (1 << i))); const b = costoB(B, SIM.cajas); return { mask, A, B, a: costoA(A, tax), b, envio: costoA(A, tax) + b.usd }; };
    const todoA = evalua((1 << L.length) - 1), todoB = evalua(0);
    let mejor = todoB; for (let m = 0; m < (1 << L.length) && L.length <= 10; m++) { const r = evalua(m); if (r.envio < mejor.envio - 1e-9) mejor = r; }
    opciones.push(["Todo por el courier A", todoA], ["Todo por el courier B", todoB]);
    const mixta = mejor.mask !== 0 && mejor.mask !== (1 << L.length) - 1;
    if (mixta) opciones.push(["Combinación más barata", mejor]);
    const ebay = L.reduce((s, l) => s + l.usd * l.qty, 0);
    // costo por unidad con la mejor opción: A = 10 + tax por unidad; B = el envío repartido por peso (con la caja exterior)
    const gB = mejor.B.reduce((s, l) => s + l.g * l.qty, 0);
    const filas = L.map((l, i) => {
      const enA = !!(mejor.mask & (1 << i)), p = P.find(x => x.name === l.prod);
      const env = enA ? 10 + l.usd * tax : gB ? mejor.b.usd * (l.g / gB) : 0;
      const cu = (l.usd + env) * tc, best = p ? minOf(refs(p)) : null;
      return { l, enA, env, cu, local: best ? best.bs : null, gan: best ? (best.bs - cu) * l.qty : null };
    });
    return { L, tax, tc, ebay, opciones, mejor, mixta, filas };
  }
  function renderSim() {
    const el = panel("pSim", "Simulador de pedido", "precio de eBay + courier A o B, con la caja y los tramos de 0,5 kg");
    if (!SIM.lineas.length) SIM.lineas = [nuevaLinea()];
    const r = simular(), bs = v => v == null ? "—" : `Bs ${fmt(v)}`, usd = v => `USD ${fmt(v, 2)}`;
    const libre = r.mejor.B.length ? Math.round(r.mejor.b.kg * 1000 - r.mejor.b.g) : null;
    const ganT = r.filas.every(f => f.gan != null) ? r.filas.reduce((s, f) => s + f.gan, 0) : null;
    el.querySelector(".eq-body").innerHTML = `<div class="sim">
      <p class="eq-note">Elige los productos y cuántos. El precio de eBay viene del último dato real (con envío dentro de EE.UU.); puedes cambiarlo. Courier A: USD 10 por producto + ${fmt(r.tax * 100, 1)} % de tax de Florida. Courier B: USD 28 por kg de la caja completa (productos + ${300 * SIM.cajas} g de caja exterior), mínimo 1 kg y de 0,5 en 0,5 kg. Aduana incluida en los dos. Dólar ${fmt(r.tc, 2)} Bs.</p>
      <div class="scroll"><table><thead><tr><th>Producto</th><th>Estado</th><th class="n">USD c/u</th><th class="n">Cant.</th><th class="n">Peso g c/u</th><th></th></tr></thead><tbody>
      ${SIM.lineas.map((l, i) => `<tr><td><select data-sim="prod" data-i="${i}" aria-label="Producto">${P.map(p => `<option ${p.name === l.prod ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></td>
        <td><select data-sim="cond" data-i="${i}" aria-label="Estado"><option value="nuevo" ${l.cond === "nuevo" ? "selected" : ""}>nuevo</option><option value="usado" ${l.cond === "usado" ? "selected" : ""}>usado</option></select></td>
        <td class="n"><input type="number" min="0" step="0.01" data-sim="usd" data-i="${i}" value="${l.usd}" aria-label="Precio en USD"></td>
        <td class="n"><input type="number" min="0" step="1" data-sim="qty" data-i="${i}" value="${l.qty}" aria-label="Cantidad"></td>
        <td class="n"><input type="number" min="0" step="10" data-sim="g" data-i="${i}" value="${l.g}" aria-label="Peso en gramos con caja"></td>
        <td><button type="button" class="x" data-simdel="${i}" aria-label="Quitar">×</button></td></tr>`).join("")}
      </tbody></table></div>
      <div class="row" style="margin-top:10px"><button type="button" class="add" data-simadd>+ Agregar producto</button>
        <label>Cajas para el courier B<input type="number" min="1" step="1" data-simcajas value="${SIM.cajas}" style="max-width:80px"></label></div>
      <div class="eq-sec" style="margin-top:14px">Envío</div>
      <div class="opts">${r.opciones.map(([t, o]) => `<div class="opt ${o === r.mejor ? "best" : ""}"><span>${esc(t)}${o === r.mejor ? " · la más barata" : ""}</span><b>${usd(o.envio)}</b><span>${[o.B.length ? `B: ${fmt(o.b.kg, 1)} kg cobrados (${fmt(o.b.g)} g)` : "", o.A.length ? `A: ${o.A.reduce((s, l) => s + l.qty, 0)} u` : "", `Bs ${fmt(o.envio * r.tc)}`].filter(Boolean).join(" · ")}</span></div>`).join("")}</div>
      ${libre != null ? `<p class="eq-note">Con el courier B te quedan <b>${fmt(libre)} g</b> libres antes del siguiente medio kilo${libre >= 350 ? ": entra otro procesador sin pagar más envío" : ""}.</p>` : ""}
      <div class="eq-sec" style="margin-top:14px">Costo puesto en Cochabamba (con la opción más barata)</div>
      <div class="scroll"><table><thead><tr><th>Producto</th><th>Va por</th><th class="n">Envío c/u</th><th class="n">Costo c/u</th><th class="n">Mejor local</th><th class="n">Ganancia</th></tr></thead><tbody>
      ${r.filas.map(f => `<tr><td>${f.l.qty}× ${esc(f.l.prod)} <small style="color:var(--o-muted)">${f.l.cond}</small></td><td><span class="via ${f.enA ? "" : "b"}">${f.enA ? "A" : "B"}</span></td><td class="n">${usd(f.env)}</td><td class="n">${bs(f.cu)}</td><td class="n">${bs(f.local)}</td><td class="n ${f.gan == null ? "" : f.gan >= 0 ? "pos" : "neg"}">${f.gan == null ? "sin precio local" : `${f.gan >= 0 ? "+" : "−"}Bs ${fmt(Math.abs(f.gan))}`}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="opts" style="margin-top:12px">
        <div class="opt"><span>Pagas en eBay</span><b>${usd(r.ebay)}</b><span>Bs ${fmt(r.ebay * r.tc)}</span></div>
        <div class="opt"><span>Total puesto en Cochabamba</span><b>${bs((r.ebay + r.mejor.envio) * r.tc)}</b><span>${usd(r.ebay + r.mejor.envio)}</span></div>
        <div class="opt ${ganT != null && ganT >= 0 ? "best" : ""}"><span>Ganancia potencial vendiendo al mejor precio local</span><b>${ganT == null ? "—" : `${ganT >= 0 ? "+" : "−"}Bs ${fmt(Math.abs(ganT))}`}</b><span>${ganT == null ? "falta precio local de algún producto" : "es potencial: todavía no hay ventas"}</span></div>
      </div>
      <p class="eq-note" style="margin-top:10px">Los costos de envío son los que pasaste de los couriers; cuando lleguen los pedidos de prueba se comparan con lo que cobraron de verdad. El simulador no compra nada.</p></div>`;
    return el;
  }
  window.abrirSimulador = function () { abrir(renderSim()); };
  document.addEventListener("change", e => {
    const t = e.target; if (!t.closest || !t.closest("#pSim")) return;
    if (t.dataset.simcajas != null) SIM.cajas = Math.max(1, Math.round(+t.value || 1));
    else if (t.dataset.sim) {
      const l = SIM.lineas[+t.dataset.i], k = t.dataset.sim;
      if (k === "prod") { const p = P.find(x => x.name === t.value); Object.assign(l, { prod: t.value, g: p.g || 350, usd: precioDe(p, l.cond) }); }
      else if (k === "cond") { const p = P.find(x => x.name === l.prod); l.cond = t.value; l.usd = precioDe(p, l.cond); }
      else l[k] = Math.max(0, +t.value || 0);
    }
    const f = t.dataset.sim ? `[data-sim="${t.dataset.sim}"][data-i="${t.dataset.i}"]` : null;
    renderSim(); if (f) { const n = document.querySelector("#pSim " + f); if (n) n.focus(); }
  });
  document.addEventListener("click", e => {
    if (e.target.closest("#pSim [data-simadd]")) { SIM.lineas.push(nuevaLinea()); renderSim(); return; }
    const d = e.target.closest("#pSim [data-simdel]"); if (d) { SIM.lineas.splice(+d.dataset.simdel, 1); renderSim(); }
  });

  /* ---------- Gráficos de precios ---------- */
  const dias = () => [...new Set(D.movimientos.filter(m => m.tipo !== "dolar").map(m => m.fecha))].sort();
  const tcDia = f => { const a = D.dolar.filter(x => x.fecha <= f && x.usado); return a.length ? +a[a.length - 1].usado : +$("tc").value || 0; };
  function puesto(p, usd, f) {   // costo puesto por unidad, en Bs, con el courier más barato para la cantidad de la tabla
    if (usd == null) return null;
    const n = S.qty, tax = (+$("tax").value || 0) / 100, a = 10 + usd * tax, b = courierB(p.g, n).per;
    return (usd + Math.min(a, b)) * tcDia(f);
  }
  function series(p) {
    const todos = dias(), tiene = d => ["nuevo", "usado", "local"].some(k => serieDia(p.name, k, d) != null), ds = todos.filter(tiene);
    return { ds, s: [
      { k: "nuevo", lbl: "Costo puesto · eBay nuevo", col: C.nuevo, v: ds.map(d => puesto(p, serieDia(p.name, "nuevo", d), d)) },
      { k: "usado", lbl: "Costo puesto · eBay usado", col: C.usado, v: ds.map(d => puesto(p, serieDia(p.name, "usado", d), d)) },
      { k: "local", lbl: "Mejor precio en Cochabamba", col: C.local, v: ds.map(d => serieDia(p.name, "local", d)) }] };
  }
  // el precio local se mantiene hasta que aparece otro (es el último visto), así la línea no se corta entre días sin dato
  function arrastrar(v) { let u = null; return v.map(x => (x != null ? (u = x) : u)); }
  const niceMax = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), k = v / p; return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 5 ? 5 : 10) * p; };
  function grande(p) {
    const { ds, s } = series(p); s[2].v = arrastrar(s[2].v);
    const W = 760, H = 300, L = 62, R = 16, T = 14, B = 34, all = s.flatMap(x => x.v).filter(v => v != null);
    if (!all.length || ds.length < 1) return `<p class="eq-note">Todavía no hay precios de este producto.</p>`;
    const paso = niceMax((Math.max(...all) - Math.min(...all)) / 4 || Math.max(...all) / 4), lo = Math.max(0, Math.floor(Math.min(...all) * 0.97 / paso) * paso), hi = Math.ceil(Math.max(...all) * 1.03 / paso) * paso, X = i => L + (ds.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (ds.length - 1)), Y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    let g = ""; for (let v = lo; v <= hi + 1e-9; v += paso) { const y = Y(v); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${C.line}" stroke-width="1"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" fill="${C.muted}" font-size="11" font-family="IBM Plex Mono">${fmt(v)}</text>`; }
    ds.forEach((d, i) => { if (ds.length <= 12 || i % Math.ceil(ds.length / 10) === 0) g += `<text x="${X(i)}" y="${H - 12}" text-anchor="middle" fill="${C.muted}" font-size="11" font-family="IBM Plex Mono">${fechaCorta(d)}</text>`; });
    s.forEach(x => {
      let path = "", on = false; x.v.forEach((v, i) => { if (v == null) { on = false; return; } path += `${on ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; on = true; });
      g += `<path d="${path}" fill="none" stroke="${x.col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      x.v.forEach((v, i) => { if (v != null) g += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="4" fill="${x.col}" stroke="#102230" stroke-width="2"/>`; });
      const li = x.v.map((v, i) => v != null ? i : -1).filter(i => i >= 0).pop();
      if (li != null) g += `<text x="${Math.min(X(li) + 8, W - R - 4)}" y="${Y(x.v[li]) - 8}" text-anchor="${X(li) + 60 > W ? "end" : "start"}" fill="${C.ink}" font-size="11" font-family="IBM Plex Mono">${fmt(x.v[li])}</text>`;
    });
    g += `<line class="gr-x" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="${C.muted}" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>`;
    g += `<rect class="gr-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>`;
    return `<div class="gr-legend">${s.map(x => `<span><i style="background:${x.col}"></i>${x.lbl}</span>`).join("")}</div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Precios por día de ${esc(p.name)} en bolivianos" data-gr="${esc(p.name)}">${g}</svg><div class="gr-tip"></div>
      <p class="eq-note">En bolivianos por unidad. El costo puesto suma eBay (con envío en EE.UU.), el courier más barato para ${S.qty} unidades y el dólar de cada día. El precio local es el más bajo visto que cuenta (se mantiene hasta el siguiente dato).</p>
      <table class="gr-table"><thead><tr><th>Día</th>${s.map(x => `<th>${x.k === "local" ? "Local" : "eBay " + x.k}</th>`).join("")}</tr></thead><tbody>${ds.map((d, i) => `<tr><td>${fechaCorta(d)}</td>${s.map(x => `<td>${fmt(x.v[i])}</td>`).join("")}</tr>`).reverse().join("")}</tbody></table>`;
  }
  function mini(p) {
    const { ds, s } = series(p); const v = s[0].v.map((x, i) => x != null ? x : s[1].v[i]), loc = arrastrar(s[2].v);
    const all = [...v, ...loc].filter(x => x != null); if (!all.length) return "";
    const lo = Math.min(...all) * 0.95, hi = Math.max(...all) * 1.05, X = i => 4 + (ds.length === 1 ? 96 : i * 192 / Math.max(1, ds.length - 1)), Y = x => 4 + 38 * (1 - (x - lo) / ((hi - lo) || 1));
    const line = (a, col) => { let d = "", on = false; a.forEach((x, i) => { if (x == null) { on = false; return; } d += `${on ? "L" : "M"}${X(i).toFixed(1)},${Y(x).toFixed(1)}`; on = true; }); return `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round"/>`; };
    return `<svg viewBox="0 0 200 46" aria-hidden="true">${line(v, C.nuevo)}${line(loc, C.local)}</svg>`;
  }
  let grSel = null;
  function renderGraf() {
    const el = panel("pGraf", "Gráficos de precios", "costo puesto (eBay + courier) contra el mejor precio de Cochabamba, por día");
    const p = P.find(x => x.name === grSel) || (ranking[0] && ranking[0].p) || P[0]; grSel = p.name;
    el.querySelector(".eq-body").innerHTML = `<div class="gr-wrap"><div class="gr-big"><h4 style="margin:0 0 8px;font:700 18px var(--f-display)">${esc(p.name)}</h4>${grande(p)}</div>
      <div class="eq-sec">Todos los productos · toca uno para verlo grande (línea azul: eBay; naranja: local)</div>
      <div class="gr-mini">${P.map(q => { const c = calc(q); return `<button type="button" data-grsel="${esc(q.name)}" aria-pressed="${q.name === p.name}"><b>${esc(q.name)}</b>${mini(q)}<small>${c.margin == null ? "sin comparación" : `margen ${fmt(c.margin * 100)} % hoy`}</small></button>`; }).join("")}</div></div>`;
    return el;
  }
  window.abrirGraficos = function (prod) { if (prod) grSel = prod; abrir(renderGraf()); };
  document.addEventListener("click", e => { const b = e.target.closest("#pGraf [data-grsel]"); if (b) { grSel = b.dataset.grsel; renderGraf(); el2top(); } });
  const el2top = () => { const b = document.querySelector("#pGraf .eq-body"); if (b) b.scrollTop = 0; };
  // hover: línea vertical y valores del día más cercano
  document.addEventListener("pointermove", e => {
    const svg = e.target.closest && e.target.closest("#pGraf svg[data-gr]"); const tip = document.querySelector("#pGraf .gr-tip"); if (!tip) return;
    if (!svg) { tip.style.display = "none"; const x = document.querySelector("#pGraf .gr-x"); if (x) x.setAttribute("visibility", "hidden"); return; }
    const p = P.find(x => x.name === svg.dataset.gr), { ds, s } = series(p); s[2].v = arrastrar(s[2].v);
    const r = svg.getBoundingClientRect(), W = 760, L = 62, R = 16, sx = (e.clientX - r.left) / r.width * W;
    const i = ds.length === 1 ? 0 : Math.max(0, Math.min(ds.length - 1, Math.round((sx - L) / ((W - L - R) / (ds.length - 1)))));
    const xi = L + (ds.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (ds.length - 1));
    const ln = svg.querySelector(".gr-x"); ln.setAttribute("x1", xi); ln.setAttribute("x2", xi); ln.setAttribute("visibility", "visible");
    tip.innerHTML = `<b>${fechaCorta(ds[i])}</b><br>` + s.map(x => `<span style="color:${x.col}">●</span> ${x.k === "local" ? "Local" : "eBay " + x.k}: ${x.v[i] == null ? "—" : "Bs " + fmt(x.v[i])}`).join("<br>");
    const box = svg.parentElement.getBoundingClientRect(); tip.style.display = "block";
    let left = e.clientX - box.left + 14; if (left + 200 > box.width) left = e.clientX - box.left - 210; tip.style.left = left + "px"; tip.style.top = (e.clientY - box.top + 12) + "px";
  });

  /* ---------- pantallas de los agentes nuevos ---------- */
  const F = D.finanzas || {}, DM = D.demanda || {};
  const bs = v => v == null ? "—" : `Bs ${fmt(v)}`;
  TEX.fin = termCanvas("finanzas --resumen", F.hay_datos ? [
    ["k", `Invertido  ${bs(F.invertido_bs)}`], ["y", `En camino  ${F.unidades_en_camino} u`], ["g", `En stock   ${F.unidades_en_stock} u · ${bs(F.valor_stock_bs)}`],
    ["", `Vendidas   ${F.unidades_vendidas} u · ${bs(F.ventas_bs)}`], [F.ganancia_bs >= 0 ? "g" : "r", `Ganancia   ${bs(F.ganancia_bs)}`]]
    : [["", "Sin compras del negocio todavía."], ["k", "Los pedidos de prueba no cuentan."], ["", "Con el primer pedido real se arma"], ["", "el inventario y la ganancia real."]]);
  TEX.dem = termCanvas("demanda --cochabamba", DM.hay_datos ? DM.productos.slice(0, 6).map(x => [x.lectura.startsWith("candidato") ? "g" : x.lectura.startsWith("se mueve poco") ? "r" : "k", `${short(x.producto).padEnd(16)} ${String(x.anuncios_prom).padStart(4)} anuncios`])
    : [["", "Sin datos de demanda todavía."], ["k", "Marketplace cuenta anuncios y"], ["k", "cuáles desaparecen en cada ronda."], ["", "Con 3 días ya hay lectura."]]);
  window.pantallaEquipo = function (a) {
    const drawn = cap => `<img src="${shotUrl(a.id)}" alt="Pantalla de ${esc(a.name)}"><p class="cap">${cap}</p>`;
    if (a.id === "fin") return `<div class="shot">${drawn(`armado con pedidos.csv y ventas.csv · solo totales (la página es pública)`)}<pre class="term"><span class="k">$ python3 finanzas.py</span>\n${esc(F.hay_datos ? `Invertido ${bs(F.invertido_bs)} en ${F.unidades_compradas} u · en camino ${F.unidades_en_camino} · en stock ${F.unidades_en_stock} · vendidas ${F.unidades_vendidas}\nVentas ${bs(F.ventas_bs)} · ganancia real ${bs(F.ganancia_bs)}` : "Sin compras ni ventas del negocio todavía (los pedidos de prueba no cuentan).")}</pre></div>`;
    if (a.id === "dem") return `<div class="shot">${drawn(DM.hay_datos ? `${DM.dias} días con datos · demanda.csv` : "armado con demanda.csv")}<pre class="term"><span class="k">$ python3 demanda.py</span>\n${esc(DM.hay_datos ? DM.productos.slice(0, 8).map(x => `${x.producto}${x.vigilado ? "" : " (candidato)"}: ${x.anuncios_prom} anuncios · ${x.lectura}`).join("\n") : "Sin datos de demanda todavía: la ronda de Marketplace empieza a contar anuncios en demanda.csv.")}</pre></div>`;
    return "";
  };

  try { drawHud(P.map(p => ({ p, c: calc(p) }))); } catch (e) {}

  /* ---------- base de datos: decisiones de Santi ---------- */
  (async () => {
    try {
      if (!window.claude || !window.claude.use) { listo = true; return; }
      const [d, u] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      db = d; owner = u ? !!(await u.isOwner()) : false; listo = true;
      if (!db) return;
      db.collection("decisiones").onSnapshot(snap => {
        Object.keys(DEC).forEach(k => delete DEC[k]);
        snap.docs.forEach(x => { if (x.exists) DEC[x.id] = x.data(); });
        tableroCanvas();
        const t = document.getElementById("pTablero"); if (t && !t.hidden) renderTablero();
        if (typeof drawHud === "function" && typeof P !== "undefined") drawHud(P.map(p => ({ p, c: calc(p) })));
        if (open && sel && sel !== "docs") drawDrawer();
      }, () => {});
    } catch (e) { listo = true; }
  })();
})();
