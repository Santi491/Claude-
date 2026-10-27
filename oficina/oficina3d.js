/* Oficina de agentes en 3D (Three.js r128). Usa los mismos datos y el mismo panel que la versión 2D
   (AG, TEX, STATES, D, drawDrawer, sel, open...). Si no hay WebGL, la página sigue con la oficina 2D. */
(function () {
  if (!window.THREE || !THREE.OrbitControls) return;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return; }
  if (!renderer.getContext()) return;
  window.OFICINA_3D = true;

  const stage = $("stage"), cv2d = $("cv");
  /* Resolución (Santi, 27/10: "se ve a baja resolución"): quieta, la oficina se dibuja nítida a la resolución de la pantalla;
     mientras se mueve puede bajar para ir fluida, nunca por debajo de la normal en compu, y vuelve a nítida al soltar. */
  const COARSE = matchMedia("(pointer:coarse)").matches;
  const PR_MAX = Math.min(2, window.devicePixelRatio || 1), PR_MIN = Math.min(PR_MAX, COARSE ? 0.85 : 1);
  let prMove = COARSE ? Math.min(PR_MAX, 1.25) : PR_MAX, prIdle = PR_MAX, pr = prIdle;   // en compu arranca al máximo también moviéndose (como el probador)
  /* Modo liviano: celulares y computadoras con poca memoria (o si el visitante lo elige con el botón) cargan 2 personas
     en vez de 6 y sin sombras. La elección se recuerda en este navegador. */
  let guardado = null; try { guardado = localStorage.getItem("cb-modo"); } catch (e) { }
  const LIVIANO = guardado ? guardado === "liviano" : !!(COARSE || (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4));
  renderer.setPixelRatio(pr);
  const ANISO = Math.min(LIVIANO ? 4 : 16, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);   // piso y paredes nítidos de costado
  renderer.shadowMap.enabled = !LIVIANO;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;   // las sombras se recalculan unas veces por segundo, no en cada cuadro (ver loop)
  renderer.shadowMap.needsUpdate = true;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;   // misma luz que el probador de personas (Santi, 27/10)
  const el = renderer.domElement;
  el.id = "cv3d"; el.tabIndex = 0;
  el.setAttribute("aria-label", "Oficina 3D con los agentes. Arrastra para girar, rueda o pellizco para acercar, flechas para cambiar de agente.");
  cv2d.style.display = "none";
  stage.insertBefore(el, cv2d);
  const layer = document.createElement("div");
  layer.className = "labels3d";
  stage.appendChild(layer);
  $("hint").textContent = matchMedia("(pointer:coarse)").matches
    ? "Arrastra para girar · pellizca para zoom · toca un agente"
    : "Arrastra para girar · clic derecho para mover · rueda para zoom · clic en un agente · «Manejar a Santi» para caminar";

  /* ---------- Escena, cámara, luces: hangar grafito ---------- */
  const scene = new THREE.Scene();
  if (/[?&]debug3d/.test(location.search)) window.__o3d = { renderer, scene };   // solo para medir rendimiento
  scene.background = new THREE.Color(0x121417);
  scene.fog = new THREE.Fog(0x121417, 80, 170);
  const XC0 = 7;   // centro del hangar (x), igual a XC más abajo
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const HOME = { pos: new THREE.Vector3(23, 26, 33), target: new THREE.Vector3(5, 0, 1.5) };
  camera.position.copy(HOME.pos);
  const controls = new THREE.OrbitControls(camera, el);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.target.copy(HOME.target);
  controls.maxPolarAngle = Math.PI * 0.46; controls.minDistance = 3; controls.maxDistance = 100;
  controls.screenSpacePanning = true;

  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x15171a, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(25, 22, 16); sun.target.position.set(XC0, 0, 3); scene.add(sun.target); sun.castShadow = !LIVIANO;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 28, bottom: -28, near: 1, far: 90 });
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdfe8f2, 0.1); fill.position.set(-14, 8, 14); scene.add(fill);

  /* ---------- Utilidades ---------- */
  const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.72, metalness: 0.04 }, o || {}));
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || scene).add(m); return m;
  }
  function cyl(rt, rb, h, mat, x, y, z, parent, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 20), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || scene).add(m); return m;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = ANISO; return t;
  }
  // semilla fija: el mármol y el concreto salen iguales en cada visita
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  function mottle(g, w, h, n, light, alpha) {
    for (let i = 0; i < n; i++) {
      const r = 4 + rnd() * 60, l = light + (rnd() - .5) * 14;
      g.fillStyle = `hsla(210,4%,${l}%,${alpha})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, 7); g.fill();
    }
  }
  function marble(base, vein, alpha, n) {
    return canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      mottle(g, w, h, 500, base === "#1a1b1e" ? 16 : 86, .05);
      for (let v = 0; v < n; v++) {
        let x = rnd() * w, y = -20, ang = 0.5 + rnd() * 0.9;
        const main = v % 3 === 0;
        g.strokeStyle = vein; g.globalAlpha = (main ? .75 : .35) * alpha; g.lineWidth = main ? 1.6 + rnd() * 2.2 : .5 + rnd();
        g.shadowColor = vein; g.shadowBlur = main ? 6 : 2;
        g.beginPath(); g.moveTo(x, y);
        while (y < h + 20 && x > -40 && x < w + 40) {
          ang += (rnd() - .5) * .5; x += Math.cos(ang) * 14; y += Math.abs(Math.sin(ang)) * 14 + 4; g.lineTo(x, y);
          if (rnd() < .025) { g.stroke(); g.lineWidth *= .7; g.beginPath(); g.moveTo(x, y); }
        }
        g.stroke();
      }
      g.globalAlpha = 1; g.shadowBlur = 0;
    });
  }
  const marbleW = marble("#e4e3df", "#7d7f84", 1, 22);   // mármol claro (cubiertas)
  const marbleN = marble("#1a1b1e", "#e8e8e6", .9, 26);  // mármol negro con vetas blancas
  const ledM = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

  /* ---------- Hangar ---------- */
  /* Plano (27/10): al fondo la oficina de Santi y la sala de reuniones (vidrio) y el lounge; detrás del lounge, por una
     puerta, el cobertizo de paquetería; al centro la sala de operaciones (3 filas de 3 puestos mirando al videowall);
     a la derecha el gym; adelante la recepción. */
  const RW = 44, RD = 20, WH = 7.2; // ancho (x), fondo (z), alto de muros
  const XL = -15, XR = XL + RW, XC = (XL + XR) / 2;   // el muro izquierdo no se mueve
  const ZB = -RD / 2, ZF = 19, DEP = ZF - ZB, ZM = (ZB + ZF) / 2;
  const XLO = 9, MB = 3.0, PUERTA = [16.9, 18.1];   // desde x 9 el muro del fondo es bajo (3 m) y tiene la puerta al cobertizo
  // piso de epoxi claro con vetas de mármol, pulido
  const conc = marble("#e6e1d7", "#b3a791", .7, 16);
  conc.wrapS = conc.wrapT = THREE.RepeatWrapping; conc.repeat.set(3, 3.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, DEP), M(0xc9c4ba, { map: conc, roughness: 0.2, metalness: 0.1 }));
  floor.position.set(XC, 0, ZM); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // muros de microcemento grafito con juntas de panel
  function wallTex(rep) {
    const t = canvasTex(1024, 512, (g, w, h) => {
      g.fillStyle = "#34373c"; g.fillRect(0, 0, w, h); mottle(g, w, h, 900, 23, .06);
      g.fillStyle = "rgba(12,14,16,.5)"; for (let k = 1; k < 4; k++) g.fillRect(k * w / 4 - 1, 0, 2, h);
    });
    t.wrapS = THREE.RepeatWrapping; t.repeat.set(rep, 1); return t;
  }
  const muroM = w => M(0xffffff, { map: wallTex(Math.max(1, w / 8)), roughness: 0.85 });
  const HW = XLO - XL;   // tramo alto del muro del fondo (detrás de la oficina de Santi y la sala de reuniones)
  box(HW, WH, 0.3, muroM(HW), XL + HW / 2, WH / 2, ZB - 0.15);
  // tramo bajo detrás del lounge, con la puerta al cobertizo
  [[XLO, PUERTA[0]], [PUERTA[1], XR]].forEach(([a, b]) => box(b - a, MB, 0.3, muroM(b - a), (a + b) / 2, MB / 2, ZB - 0.15));
  box(PUERTA[1] - PUERTA[0], MB - 2.25, 0.3, muroM(2), (PUERTA[0] + PUERTA[1]) / 2, 2.25 + (MB - 2.25) / 2, ZB - 0.15);
  box(0.3, WH, DEP, muroM(DEP), XL - 0.15, WH / 2, ZM);  // muro izquierdo
  // zócalos (cortados en la puerta)
  [[XL, PUERTA[0]], [PUERTA[1], XR]].forEach(([a, b]) => box(b - a, 0.14, 0.05, M(0x17191c), (a + b) / 2, 0.07, ZB + 0.03));
  box(0.05, 0.14, DEP, M(0x17191c), XL + 0.03, 0.07, ZM);

  // columnas de acero del hangar
  const steelDk = M(0x1d2023, { metalness: .6, roughness: .4 });
  [-14.6, -7.2, 1.0, 8.8].forEach(x => box(0.35, WH, 0.3, steelDk, x, WH / 2, ZB + 0.16));
  [-5, 14.5].forEach(z => box(0.3, WH, 0.35, steelDk, XL + 0.16, WH / 2, z));

  // LED blanco en los bordes de arriba y en las esquinas
  box(HW, 0.06, 0.08, ledM, XL + HW / 2, WH - 0.12, ZB + 0.05).castShadow = false;
  box(XR - XLO, 0.06, 0.08, ledM, (XLO + XR) / 2, MB - 0.06, ZB + 0.05).castShadow = false;
  box(0.08, 0.06, DEP, ledM, XL + 0.05, WH - 0.12, ZM).castShadow = false;
  [[XL + 0.05, ZB + 0.05], [XL + 0.05, ZF - 0.04]].forEach(([x, z]) => { box(0.06, WH, 0.06, ledM, x, WH / 2, z).castShadow = false; });
  [[XL, PUERTA[0]], [PUERTA[1], XR]].forEach(([a, b]) => box(b - a, 0.03, 0.05, ledM, (a + b) / 2, 0.16, ZB + 0.05).castShadow = false);   // línea fina a ras del piso
  box(0.05, 0.03, DEP, ledM, XL + 0.05, 0.16, ZM).castShadow = false;
  // (las luces puntuales altas de las paredes se sacaron por rendimiento: con más de ~30 luces la placa de video se traba;
  //  esa luz pareja la dan ahora el hemisferio y la luz de relleno, un poco más fuertes)

  // ventanas altas del hangar con el cielo de noche (solo en el tramo alto del muro del fondo)
  const sky = canvasTex(1024, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#0e1622"); gr.addColorStop(1, "#273444");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,.7)"; for (let i = 0; i < 60; i++) g.fillRect(rnd() * w, rnd() * h * .7, 1.5, 1.5);
  });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(HW - 2, 0.9), new THREE.MeshBasicMaterial({ map: sky }));
  win.position.set(XL + HW / 2, WH - 0.75, ZB + 0.02); scene.add(win);
  for (let x = XL + 1; x <= XLO - 1; x += 1.4) box(0.05, 0.9, 0.04, steelDk, x, WH - 0.75, ZB + 0.05).castShadow = false;
  box(HW - 2, 0.05, 0.05, steelDk, XL + HW / 2, WH - 1.2, ZB + 0.05);

  // vigas negras del techo con spots
  [-6.5, -1.5, 3.5, 8.5].forEach(z => {
    box(RW, 0.3, 0.16, steelDk, XC, WH - 0.15, z).castShadow = false;
    for (let x = XL + 1.5; x < XR; x += 2.5) { const d = cyl(0.07, 0.07, 0.03, ledM, x, WH - 0.31, z, scene, 12); d.castShadow = false; }
  });
  // muro de mármol negro con el nombre del negocio, en la recepción (adelante)
  const REC = { x: 2, z: 16.4 };
  const slab = box(7.2, 3.8, 0.25, M(0xffffff, { map: marbleN, roughness: 0.18, metalness: 0.08 }), REC.x, 1.9, REC.z - 2.2);
  slab.castShadow = false;
  box(7.3, 0.04, 0.3, ledM, REC.x, 3.82, REC.z - 2.2).castShadow = false;
  // texto con letras espaciadas, centrado
  function spaced(g, text, x, y, sp) {
    const ws = [...text].map(ch => g.measureText(ch).width), tot = ws.reduce((a, b) => a + b, 0) + sp * (ws.length - 1);
    let cx = x - tot / 2; g.textAlign = "left"; [...text].forEach((ch, i) => { g.fillText(ch, cx, y); cx += ws[i] + sp; });
  }
  // logo de Cargo Brothers (monolínea) con brillo de LED, nombre y eslogan
  function brandArt(g, w, h, markSize, top, glow) {
    const mk = typeof cbCanvas === "function" ? cbCanvas(markSize, "#EDEEF0") : null;
    if (mk) { g.save(); g.shadowColor = "rgba(255,255,255,.6)"; g.shadowBlur = glow; g.drawImage(mk, (w - markSize) / 2, top); g.restore(); }
    g.fillStyle = "#EDEEF0"; g.font = `500 ${Math.round(markSize * 0.15)}px Archivo, system-ui, sans-serif`;
    spaced(g, "CARGO BROTHERS", w / 2, top + markSize + markSize * 0.3, markSize * 0.06);
    g.fillStyle = "#A9AFB6"; g.font = `500 ${Math.round(markSize * 0.062)}px 'IBM Plex Mono', monospace`;
    spaced(g, "IMPORTACIÓN DE COMPONENTES", w / 2, top + markSize + markSize * 0.47, markSize * 0.03);
  }
  const logo = canvasTex(1024, 768, (g, w, h) => { g.clearRect(0, 0, w, h); brandArt(g, w, h, 360, 70, 22); });
  const lg = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.45), new THREE.MeshBasicMaterial({ map: logo, transparent: true, toneMapped: false }));
  lg.position.set(REC.x, 2.05, REC.z - 2.06); scene.add(lg);
  // cuando cargan las fuentes de la página, se vuelve a dibujar el nombre con la tipografía correcta
  if (document.fonts) document.fonts.ready.then(() => { const g = logo.image.getContext("2d"); g.clearRect(0, 0, 1024, 768); brandArt(g, 1024, 768, 360, 70, 22); logo.needsUpdate = true; });

  /* ---------- Muebles y decoración ---------- */
  const marbleWM = M(0xffffff, { map: marbleW, roughness: 0.22, metalness: 0.04 });
  function plant(x, z, s) {
    s = s || 1;
    cyl(0.34 * s, 0.28 * s, 0.62 * s, marbleWM, x, 0.31 * s, z, scene, 28);
    const leaf = M(0x2f7a52, { roughness: .8 });
    [[0, 1.05, 0, .55], [.25, .9, .15, .4], [-.22, .95, -.1, .42], [.05, 1.35, -.05, .38]].forEach(([dx, dy, dz, r]) => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 0), leaf);
      m.position.set(x + dx * s, dy * s, z + dz * s); m.castShadow = true; scene.add(m);
    });
  }
  plant(XL + 1, ZB + 1); plant(-14.2, 11.6, .8); plant(XR - 1.4, ZF - 1.4, 1.1); plant(13.6, ZF - 1.4, 1.0);

  // materiales cálidos de las zonas de lujo (oficina de Santi, reuniones, lounge, recepción)
  const marmolCalido = M(0xffffff, { map: marble("#d9c4a5", "#6e4a22", .8, 18), roughness: .16, metalness: .04 });
  const bronce = M(0xc9a45c, { metalness: .85, roughness: .28 }), cromo = M(0xd9dee3, { metalness: .95, roughness: .16 });
  const cueroNegro = M(0x1a1512, { roughness: .42 }), cueroCognac = M(0x2e170b, { roughness: .4 }), negroM = M(0x0f1113, { roughness: .5 });
  // columna y base de 5 patas con rueditas (las sillas se arriman y se alejan del escritorio)
  function ruedas(ch, mat) {
    cyl(0.03, 0.03, 0.38, mat, 0, 0.27, 0, ch, 8); cyl(0.045, 0.05, 0.06, mat, 0, 0.09, 0, ch, 10);
    for (let k = 0; k < 5; k++) {
      const pata = new THREE.Group(); pata.rotation.y = k * Math.PI * 2 / 5; ch.add(pata);
      box(0.045, 0.03, 0.26, mat, 0, 0.085, 0.13, pata).rotation.x = 0.12;
      box(0.03, 0.04, 0.03, mat, 0, 0.06, 0.255, pata);
      cyl(0.026, 0.026, 0.024, negroM, 0, 0.026, 0.27, pata, 12).rotation.z = Math.PI / 2;
    }
  }
  // silla de puesto: asiento a 0,47 m (la altura que usan las animaciones sentadas de Mixamo)
  function silla(p, x, z, rot, mat, metal) {
    const ch = new THREE.Group(); ch.position.set(x, 0, z); ch.rotation.y = rot || 0; p.add(ch);
    box(0.5, 0.08, 0.5, mat, 0, 0.47, 0, ch); box(0.5, 0.62, 0.07, mat, 0, 0.82, 0.24, ch);
    ruedas(ch, metal); return ch;
  }
  // silla ejecutiva: respaldo alto acolchado, cabecera, apoyabrazos y base cromada con rueditas
  function sillaEjecutiva(p, x, z, rot, cuero) {
    const ch = new THREE.Group(); ch.position.set(x, 0, z); ch.rotation.y = rot; p.add(ch);
    box(0.58, 0.1, 0.56, cuero, 0, 0.47, 0, ch); box(0.52, 0.05, 0.5, cuero, 0, 0.54, -0.01, ch);   // asiento con almohadón
    const resp = new THREE.Group(); resp.position.set(0, 0.55, 0.27); resp.rotation.x = 0.1; ch.add(resp);
    box(0.56, 0.78, 0.1, cuero, 0, 0.42, 0, resp); [0.18, 0.4, 0.62].forEach(y => box(0.5, 0.17, 0.04, cuero, 0, y, -0.06, resp));   // acolchado
    box(0.42, 0.2, 0.11, cuero, 0, 0.92, 0.01, resp);                                                                              // cabecera
    [-1, 1].forEach(s => { box(0.06, 0.05, 0.4, cuero, s * 0.32, 0.72, -0.02, ch); box(0.04, 0.22, 0.04, cromo, s * 0.32, 0.6, 0.06, ch); });
    ruedas(ch, cromo); return ch;
  }
  // planta de lujo: maceta alta de mármol con aro de bronce y un arbolito con varias copas
  function plantaLujo(x, z, alto) {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g); alto = alto || 1;
    cyl(0.3, 0.22, 0.85, marmolCalido, 0, 0.425, 0, g, 24); cyl(0.31, 0.31, 0.04, bronce, 0, 0.8, 0, g, 24); cyl(0.27, 0.27, 0.02, M(0x2a2018), 0, 0.84, 0, g, 20);
    cyl(0.03, 0.045, 1.1 * alto, M(0x4a3426, { roughness: .9 }), 0, 0.85 + 0.55 * alto, 0, g, 8);
    const hoja = [M(0x2f5a3c, { roughness: .8, flatShading: true }), M(0x3e6e47, { roughness: .8, flatShading: true }), M(0x264a32, { roughness: .8, flatShading: true })];
    [[0, 2.05, 0, .42], [.24, 1.82, .1, .3], [-.22, 1.86, -.08, .32], [.06, 1.66, -.24, .26], [-.1, 1.7, .24, .27], [.16, 2.25, -.1, .25]].forEach(([hx, hy, hz, r], i) => {
      const h = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), hoja[i % 3]); h.position.set(hx, 0.85 + (hy - 0.85) * alto, hz); h.castShadow = true; g.add(h); });
  }
  // alfombra con borde dorado
  function alfombra(x, z, w, d, color, borde) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), M(color, { roughness: .95 })); a.position.set(x, 0.008, z); a.receiveShadow = true; scene.add(a);
    if (borde) { const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.01, d + 0.12), M(borde, { roughness: .6, metalness: .3 })); b.position.set(x, 0.005, z); scene.add(b); }
  }

  // Rack de servidores (la nube), contra el muro izquierdo junto a la sala de operaciones
  const rackG = new THREE.Group(); rackG.position.set(XL + 1.1, 0, 13.4); scene.add(rackG);
  box(1.2, 2.6, 1, M(0x1e2124, { metalness: .5, roughness: .4 }), 0, 1.3, 0, rackG);
  const leds = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    m.position.set(0.62, 0.4 + i * 0.24, -0.3 + (i % 3) * 0.25); m.rotation.y = Math.PI / 2; rackG.add(m); leds.push(m);
  }

  // sala de operaciones: 3 filas de 3 puestos mirando al videowall. Se leen de izquierda a derecha empezando por la fila
  // de adelante: el Gerente está en el puesto 2 (el del medio de la primera fila)
  const STATION = { wa: [-10, 0.6], gerente: [-3, 0.6], mkt: [4, 0.6],
    ebay: [-10, 4.8], ana: [-3, 4.8], pedidos: [4, 4.8],
    fin: [-10, 9.0], dem: [-3, 9.0], nube: [4, 9.0] };
  const PASILLO_X = 8.6, FRENTE_Z = -1.6;   // pasillo entre operaciones y gym/lounge, y pasillo frente a las salas de vidrio
  // lámparas LED lineales colgantes sobre los escritorios
  function ledBar(x, z, len, y, rotY) {
    y = y || 3.72;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g);
    [-len / 2 + 0.2, len / 2 - 0.2].forEach(dx => cyl(0.006, 0.006, WH - y, M(0x0d0d0d), dx, y + (WH - y) / 2, 0, g, 4).castShadow = false);
    box(len, 0.07, 0.12, M(0x141517, { metalness: .6, roughness: .35 }), 0, y, 0, g).castShadow = false;
    box(len - 0.06, 0.012, 0.08, ledM, 0, y - 0.04, 0, g).castShadow = false;
    // sin luz puntual por puesto (Santi, 27/10): eran 9 luces que cada píxel calculaba y bajaban la resolución; la barra brilla igual
  }
  Object.values(STATION).forEach(([x, z]) => ledBar(x, z + 0.2, 3.0));

  // pasillos marcados en el piso
  box(XLO - XL - 1, 0.01, 0.05, M(0xd9dde2, { roughness: .5 }), (XL + XLO) / 2, 0.005, FRENTE_Z);
  box(0.05, 0.01, 14, M(0xd9dde2, { roughness: .5 }), PASILLO_X, 0.005, 5.6);

  // Cajas como llegan de verdad (cartón con cinta de eBay, USPS Priority Mail, cartón con etiqueta): las usan las
  // estanterías del cobertizo de paquetería y el pallet de los pedidos (ver "Paquetería")
  const lineM = M(0xd9dde2, { roughness: .5 });
  const blackSteel = M(0x18191b, { metalness: .6, roughness: .45 });
  const KR = "#b58e5c";
  function kraftBase(g, w, h) { g.fillStyle = KR; g.fillRect(0, 0, w, h); g.globalAlpha = .08; for (let i = 0; i < 260; i++) { g.fillStyle = rnd() < .5 ? "#6b4a24" : "#e8c995"; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 30, 1); } g.globalAlpha = 1; }
  function ebayTape(g, w, h, vertical) {
    g.save(); if (vertical) { g.translate(w / 2, 0); g.rotate(Math.PI / 2); g.translate(0, -w / 2); }
    const L = vertical ? h : w, T = 46, y0 = (vertical ? w : h) / 2 - T / 2;
    g.fillStyle = "#f4f4f2"; g.fillRect(0, y0, L, T);
    g.font = "800 34px Archivo, Arial, sans-serif"; g.textBaseline = "middle";
    for (let x = 10; x < L; x += 110) [["e", "#e53238"], ["b", "#0064d2"], ["a", "#f5af02"], ["y", "#86b817"]].forEach(([c, col], i) => { g.fillStyle = col; g.fillText(c, x + i * 18, y0 + T / 2 + 1); });
    g.restore();
  }
  function plainTape(g, w, h) { g.fillStyle = "rgba(205,170,120,.75)"; g.fillRect(0, h / 2 - 22, w, 44); }
  // etiqueta de envío de mentira: nunca lleva un número de seguimiento real
  function shipLabel(g, x, y, kind) {
    g.fillStyle = "#fbfbf9"; g.fillRect(x, y, 150, 104); g.strokeStyle = "#222"; g.lineWidth = 2; g.strokeRect(x, y, 150, 104);
    g.fillStyle = "#111"; g.font = "800 22px Arial, sans-serif"; g.fillText(kind === "usps" ? "P" : "G", x + 8, y + 26);
    g.font = "700 11px Arial, sans-serif"; g.fillText(kind === "usps" ? "USPS PRIORITY MAIL" : "USPS GROUND ADVANTAGE", x + 34, y + 20);
    for (let i = 0; i < 46; i++) { const bw = 1 + (i * 7 % 3); g.fillRect(x + 10 + i * 2.8, y + 40, bw, 40); }
    g.font = "600 9px 'IBM Plex Mono', monospace"; g.fillText("TRACKING #", x + 10, y + 96);
  }
  const boxFace = (draw) => canvasTex(256, 256, draw);
  const TEXB = {
    kraft: boxFace((g, w, h) => kraftBase(g, w, h)),
    kraftTop: boxFace((g, w, h) => { kraftBase(g, w, h); plainTape(g, w, h); }),
    kraftFront: boxFace((g, w, h) => { kraftBase(g, w, h); shipLabel(g, 60, 90, "ground"); }),
    ebayTop: boxFace((g, w, h) => { kraftBase(g, w, h); ebayTape(g, w, h); }),
    ebayFront: boxFace((g, w, h) => { kraftBase(g, w, h); ebayTape(g, w, h, true); shipLabel(g, 6, 140, "ground"); }),
    uspsSide: boxFace((g, w, h) => { g.fillStyle = "#f6f7f8"; g.fillRect(0, 0, w, h); g.fillStyle = "#004b87"; g.fillRect(0, 0, w, 54); g.fillStyle = "#da291c"; g.fillRect(0, 54, w, 8); }),
    uspsFront: boxFace((g, w, h) => {
      g.fillStyle = "#f6f7f8"; g.fillRect(0, 0, w, h); g.fillStyle = "#004b87"; g.fillRect(0, 0, w, 70); g.fillStyle = "#da291c"; g.fillRect(0, 70, w, 9);
      g.fillStyle = "#fff"; g.font = "900 30px Arial, sans-serif"; g.fillText("PRIORITY", 14, 34); g.font = "900 24px Arial, sans-serif"; g.fillText("MAIL", 14, 60);
      g.fillStyle = "#004b87"; g.font = "800 20px Arial, sans-serif"; g.fillText("USPS.COM", 14, 108); shipLabel(g, 92, 136, "usps");
    }),
    uspsTop: boxFace((g, w, h) => { g.fillStyle = "#f6f7f8"; g.fillRect(0, 0, w, h); g.fillStyle = "#004b87"; for (let x = -h; x < w; x += 60) { g.save(); g.translate(x, 0); g.rotate(.5); g.fillRect(0, 0, 14, h * 2); g.restore(); } }),
  };
  const bm = t => M(0xffffff, { map: TEXB[t], roughness: .85 });
  const BOXMAT = {
    kraft: [bm("kraft"), bm("kraft"), bm("kraftTop"), bm("kraft"), bm("kraftFront"), bm("kraft")],
    ebay: [bm("kraft"), bm("kraft"), bm("ebayTop"), bm("kraft"), bm("ebayFront"), bm("kraft")],
    usps: [bm("uspsSide"), bm("uspsSide"), bm("uspsTop"), bm("uspsSide"), bm("uspsFront"), bm("uspsSide")],
  };
  function parcel(kind, w, h, d, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), BOXMAT[kind]); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  const KINDS = ["ebay", "usps", "kraft", "ebay", "usps", "ebay", "kraft"];
  // estantería de acero de 4,25 m con LED en cada estante y cajas surtidas
  function shelf(x, z, parent) {
    const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
    [[-2.1, -.42], [2.1, -.42], [-2.1, .42], [2.1, .42]].forEach(([sx, sz]) => box(0.06, 2.6, 0.06, blackSteel, sx, 1.3, sz, g));
    [0.12, 0.85, 1.58, 2.31].forEach((y, k) => {
      box(4.25, 0.04, 0.9, blackSteel, 0, y, 0, g);
      box(4.2, 0.012, 0.04, ledM, 0, y - 0.03, 0.44, g).castShadow = false;
      if (k === 3) return;
      let cx = -2.0;
      while (cx < 1.75) {
        const kind = KINDS[Math.floor(rnd() * KINDS.length)];
        const bw = kind === "usps" ? 0.42 + rnd() * .12 : 0.45 + rnd() * .2, bh = kind === "usps" ? 0.3 + rnd() * .1 : 0.3 + rnd() * .22;
        if (cx + bw > 2.0) break;
        parcel(kind, bw, bh, 0.5, cx + bw / 2, y + 0.02 + bh / 2, (rnd() - .5) * 0.06, g).rotation.y = (rnd() - .5) * 0.06;
        cx += bw + 0.05;
      }
      // cajas chicas encima del último estante
      if (k === 2) for (let i = 0; i < 4; i++) parcel(i % 2 ? "usps" : "ebay", 0.32, 0.18, 0.28, -1.6 + i * 1.05, 2.43, 0, g);
    });
    return g;
  }

  /* ---------- Puestos de trabajo ---------- */
  const skin = M(0xe7b98f, { roughness: .6 }), hairM = M(0x2b2018), deskM = marbleWM,
    legM = M(0x1f2a33, { metalness: .5, roughness: .4 }), chairM = M(0x2a2d31, { roughness: .8 });
  const ST = {};
  // medidas del puesto (en z, desde el centro del escritorio hacia la silla): cubierta a 0,68 m porque ahí apoyan las
  // manos las animaciones de teclear de Mixamo; la silla metida y corrida 0,5 m para pararse
  const DESK = { frente: 0.675, sillaDentro: 0.895, sillaFuera: 1.395 };
  const RM0 = 0.477;   // cuánto retrocede la cadera al sentarse en la animación de Mixamo (m)
  AG.forEach(a => {
    const pos = STATION[a.id]; if (!pos) return;
    const g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]); scene.add(g);
    // alfombra del puesto, escritorio ancho, cajonera y planta propia
    const rugP = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.015, 3.4), M(0x2c3036, { roughness: 1 })); rugP.position.set(0, 0.008, 0.55); rugP.receiveShadow = true; g.add(rugP);
    box(4.0, 0.006, 3.2, M(0x3a3f46, { roughness: 1 }), 0, 0.017, 0.55, g).castShadow = false;
    box(3.0, 0.08, 1.35, deskM, 0, 0.64, 0, g);
    [[-1.42, -.55], [1.42, -.55], [-1.42, .55], [1.42, .55]].forEach(([x, z]) => box(0.06, 0.6, 0.06, legM, x, 0.3, z, g));
    box(0.5, 0.56, 0.6, M(0x24282d, { roughness: .5 }), 1.05, 0.28, -0.2, g);
    [0.15, 0.4].forEach(y => box(0.18, 0.025, 0.02, M(0xc9a35a, { metalness: .6, roughness: .3 }), 1.05, y, 0.11, g));
    cyl(0.2, 0.16, 0.42, marbleWM, -1.85, 0.21, -0.35, g, 20);
    [[0, .62, 0, .3], [.12, .55, .08, .22], [-.1, .74, -.04, .2]].forEach(([dx, dy, dz, r]) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), M(0x2f7a52, { roughness: .8 })); m.position.set(-1.85 + dx, dy, -0.35 + dz); m.castShadow = true; g.add(m); });
    // monitor (el Gerente tiene dos, un poco girados hacia él)
    const dual = a.id === "gerente";
    const mons = (dual ? [[-0.64, 0.2], [0.64, -0.2]] : [[0, 0]]).map(([mx, rot]) => {
      const mg = new THREE.Group(); mg.position.set(mx, 0, 0); mg.rotation.y = rot; g.add(mg);
      const w = dual ? 1.24 : 1.62, h = dual ? 0.74 : 0.96, y = dual ? 1.28 : 1.36;
      box(0.1, 0.38, 0.08, legM, 0, 0.86, -0.38, mg); box(0.4, 0.03, 0.25, legM, 0, 0.69, -0.38, mg);
      box(w, h, 0.06, M(0x10181f, { metalness: .3, roughness: .4 }), 0, y, -0.42, mg);
      const sc = document.createElement("canvas"); sc.width = 1024; sc.height = 576;
      const stex = new THREE.CanvasTexture(sc); stex.encoding = THREE.sRGBEncoding; stex.anisotropy = ANISO;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, h - 0.1), new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }));
      screen.position.set(0, y, -0.385); mg.add(screen);
      return { screen, stex, sc, ctx: sc.getContext("2d") };
    });
    const { screen, stex, sc } = mons[0];
    // teclado bajo la mano izquierda y mouse con su pad donde va la derecha (la animación usa el mouse un tercio del tiempo)
    box(0.42, 0.015, 0.14, M(0x1b252d), -0.08, 0.6875, 0.335, g);
    box(0.24, 0.003, 0.2, M(0x23262b, { roughness: .95 }), 0.28, 0.6815, 0.29, g).castShadow = false;
    const raton = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), M(0x1b252d)); raton.scale.set(0.9, 0.45, 1.4); raton.position.set(0.27, 0.688, 0.29); raton.castShadow = true; g.add(raton);
    cyl(0.07, 0.06, 0.13, M(0xe8e2d2), 0.85, 0.745, 0.1, g);
    box(0.28, 0.02, 0.2, M(0xeae6dc), -0.8, 0.69, 0.05, g);
    // placa con el nombre del agente en el borde del escritorio
    box(0.66, 0.17, 0.04, M(0x16181b, { metalness: .4, roughness: .4 }), -1.05, 0.765, 0.6, g).castShadow = false;
    const np = textPlane(0.62, 0.15, 512, 124, (c, w, h) => { c.fillStyle = "#16181b"; c.fillRect(0, 0, w, h); c.fillStyle = "#E9EBEE"; c.font = "600 52px Archivo, system-ui, sans-serif"; c.textAlign = "center"; c.fillText(a.name.slice(0, 18), w / 2, 80); }, { transparent: false });
    np.position.set(-1.05, 0.765, 0.623); g.add(np);
    // silla con rueditas (se arrima y se aleja con la persona)
    const ch = silla(g, 0, DESK.sillaDentro, 0, chairM, legM);
    // persona sentada simple: solo se ve si no cargan las personas de Mixamo
    const p = new THREE.Group(); p.position.set(0, 0, 0.92); g.add(p);
    const shirt = M(new THREE.Color(a.shirt), { roughness: .7 });
    const torso = cyl(0.22, 0.26, 0.62, shirt, 0, 0.88, 0, p, 16);
    const headG = new THREE.Group(); headG.position.set(0, 1.33, 0); p.add(headG);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 16), skin); head.castShadow = true; headG.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
    hair.rotation.x = 0.35; hair.position.set(0, 0.03, 0.02); headG.add(hair);
    box(0.36, 0.14, 0.5, M(0x2a3540), 0, 0.6, -0.15, p);           // muslos
    const arms = [-1, 1].map(sx => {
      const sh = new THREE.Group(); sh.position.set(sx * 0.27, 1.08, 0); p.add(sh);
      const arm = box(0.1, 0.1, 0.5, shirt, 0, -0.05, -0.25, sh); arm.rotation.x = -0.35;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin); hand.position.set(0, -0.15, -0.5); sh.add(hand);
      return sh;
    });
    // aro de estado en el piso y luz del monitor
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 48), new THREE.MeshBasicMaterial({ color: 0x7f9aad, transparent: true, opacity: .35, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.03, 0.9); g.add(ring);
    const glow = { color: new THREE.Color(0x4fd1e8), intensity: 0 };   // antes una luz cian por escritorio (9 luces); el estado ya se ve en el anillo y la etiqueta
    ST[a.id] = { g, screen, stex, sc, ctx: sc.getContext("2d"), mons, torso, headG, arms, ring, glow, silla: ch, simple: p, x: pos[0], z: pos[1], src: null, st: null, ver: -1 };
  });


  /* ---------- Lounge (al fondo a la derecha, del muro bajo hasta el pasillo) ---------- */
  // (27/10) el entrepiso del jefe se sacó: la oficina de Santi pasó a planta baja, al fondo a la izquierda
  const nero = M(0xffffff, { map: marbleN, roughness: .18, metalness: .06 });
  const sofaM = M(0x7b7f84, { roughness: .95 });
  function sofa(x, z, w, d, rotY) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    box(w, 0.42, d, sofaM, 0, 0.21, 0, g); box(w, 0.42, 0.28, sofaM, 0, 0.62, d / 2 - 0.14, g);
    for (let k = 0; k < Math.round(w / 0.9); k++) box(w / Math.round(w / 0.9) - 0.06, 0.16, d - 0.34, M(0x868a8f, { roughness: 1 }), -w / 2 + (k + 0.5) * w / Math.round(w / 0.9), 0.5, -0.12, g);
    return g;
  }
  const LG = { tvX: 12.5, sofaZ: -7.6 };
  alfombra(12.9, -6.6, 6.6, 4.6, 0x2b2622, 0x8a6d3e);
  // pantalla con el logo en el muro del fondo, sobre el sofá
  const tvArt = canvasTex(1024, 576, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#1d2024"); gr.addColorStop(1, "#0d0e10");
    g.fillStyle = gr; g.fillRect(0, 0, w, h); brandArt(g, w, h, 250, 70, 14);
  });
  if (document.fonts) document.fonts.ready.then(() => { const g = tvArt.image.getContext("2d"), gr = g.createLinearGradient(0, 0, 1024, 576); gr.addColorStop(0, "#1d2024"); gr.addColorStop(1, "#0d0e10"); g.fillStyle = gr; g.fillRect(0, 0, 1024, 576); brandArt(g, 1024, 576, 250, 70, 14); tvArt.needsUpdate = true; });
  box(2.5, 1.45, 0.06, M(0x0a0a0b, { metalness: .4, roughness: .3 }), LG.tvX, 1.75, ZB + 0.04);
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.35), new THREE.MeshBasicMaterial({ map: tvArt, toneMapped: false }));
  tv.position.set(LG.tvX, 1.75, ZB + 0.075); scene.add(tv);
  // sofá seccional: base de tela, almohadones de cuero cognac, cojines y chaise a la derecha
  const tela = M(0x34383e, { roughness: .95 });
  const sofaG = new THREE.Group(); sofaG.position.set(LG.tvX, 0, LG.sofaZ); scene.add(sofaG);
  box(3.2, 0.3, 0.95, tela, 0, 0.15, 0, sofaG); box(3.2, 0.72, 0.24, tela, 0, 0.5, -0.38, sofaG);
  box(0.24, 0.55, 0.95, tela, -1.48, 0.3, 0, sofaG);
  [-0.9, 0, 0.9].forEach(x => { box(0.86, 0.12, 0.72, cueroCognac, x, 0.36, 0.08, sofaG); box(0.84, 0.42, 0.14, cueroCognac, x, 0.68, -0.22, sofaG).rotation.x = -0.12; });
  [[-1.15, 0x8a6d3e], [1.12, 0xe9dfd0], [0.75, 0x2f5a3c]].forEach(([x, c], i) => { const k = box(0.36, 0.34, 0.1, M(c, { roughness: .9 }), x, 0.6, -0.08, sofaG); k.rotation.set(-0.25, i ? -0.2 : 0.25, i ? 0.12 : -0.1); });
  box(0.95, 0.3, 1.4, tela, 2.07, 0.15, 0.7, sofaG); box(0.86, 0.12, 1.3, cueroCognac, 2.07, 0.36, 0.72, sofaG); box(0.24, 0.55, 1.4, tela, 2.55, 0.3, 0.7, sofaG);
  // mesa redonda de mármol con pie de bronce, taza y libro
  cyl(0.55, 0.55, 0.05, marmolCalido, LG.tvX - 0.2, 0.42, -6.0, scene, 40); cyl(0.07, 0.2, 0.4, bronce, LG.tvX - 0.2, 0.2, -6.0, scene, 16);
  cyl(0.07, 0.06, 0.18, M(0xf4f6f8), LG.tvX, 0.53, -5.9, scene, 12); box(0.3, 0.04, 0.22, M(0x8a6d3e), LG.tvX - 0.4, 0.465, -6.1);
  // sillón de cuero mirando al sofá (asiento a 0,42 m, como el sofá)
  function sillon(x, z, rot) {
    const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = rot; scene.add(s);
    box(0.9, 0.36, 0.85, cueroCognac, 0, 0.24, 0, s); box(0.9, 0.55, 0.2, cueroCognac, 0, 0.64, 0.33, s).rotation.x = 0.15;
    [-0.42, 0.42].forEach(x2 => box(0.14, 0.32, 0.85, cueroCognac, x2, 0.5, 0, s));
    [-0.35, 0.35].forEach(x2 => [-0.3, 0.3].forEach(z2 => cyl(0.02, 0.015, 0.06, bronce, x2, 0.03, z2, s, 6)));
    return s;
  }
  sillon(10.6, -5.8, -0.8);
  // lámpara de pie de bronce con pantalla cálida
  cyl(0.18, 0.18, 0.03, bronce, 10.2, 0.015, -9.2, scene, 20); cyl(0.015, 0.015, 1.6, bronce, 10.2, 0.8, -9.2, scene, 6);
  cyl(0.18, 0.24, 0.3, M(0xf1e4cc, { emissive: 0xffc98a, emissiveIntensity: .5, roughness: .9 }), 10.2, 1.68, -9.2, scene, 20);
  // barra de café contra el muro del fondo con 3 banquetas de cuero
  const BAR = { x: 23.2, z: ZB + 0.45 };
  box(3.6, 1.0, 0.62, marmolCalido, BAR.x, 0.5, BAR.z); box(3.66, 0.04, 0.7, bronce, BAR.x, 0.82, BAR.z); box(3.7, 0.05, 0.72, nero, BAR.x, 1.03, BAR.z);
  box(0.45, 0.5, 0.4, M(0x111214, { metalness: .4 }), BAR.x - 1.1, 1.3, BAR.z - 0.05); box(0.36, 0.05, 0.05, ledM, BAR.x - 1.1, 1.42, BAR.z + 0.16);   // máquina de café
  [[-0.3, 0xf4f6f8], [-0.15, 0xf4f6f8], [0, 0x2b2420]].forEach(([dx, c]) => cyl(0.04, 0.035, 0.1, M(c), BAR.x + dx, 1.1, BAR.z - 0.05, scene, 12));
  box(3.2, 0.04, 0.3, nero, BAR.x, 1.95, ZB + 0.16); box(3.2, 0.012, 0.02, M(0xffd9a0, { emissive: 0xffc070, emissiveIntensity: 1.2 }), BAR.x, 1.925, ZB + 0.3);   // repisa con luz
  [-1, 0, 1].forEach(d => { const x = BAR.x + d; cyl(0.2, 0.2, 0.06, cueroCognac, x, 0.78, BAR.z + 0.75, scene, 20); cyl(0.025, 0.025, 0.75, bronce, x, 0.38, BAR.z + 0.75, scene, 8); cyl(0.2, 0.22, 0.02, bronce, x, 0.01, BAR.z + 0.75, scene, 20); });
  // rincón de charla: dos sillones y una mesita, con planta
  alfombra(26.6, -5.6, 3.6, 3.0, 0x2a2420, 0x8a6d3e);
  sillon(25.6, -5.6, -Math.PI / 2); sillon(27.6, -5.6, Math.PI / 2);
  cyl(0.32, 0.32, 0.04, marmolCalido, 26.6, 0.5, -5.6, scene, 30); cyl(0.05, 0.16, 0.48, bronce, 26.6, 0.24, -5.6, scene, 14);
  plantaLujo(28.3, ZB + 0.8); plantaLujo(PUERTA[0] - 0.9, ZB + 0.8, 0.9);
  // puerta al cobertizo de paquetería: marco de bronce y letrero
  PUERTA.forEach(x => box(0.06, 2.25, 0.36, bronce, x, 1.125, ZB - 0.15)); box(1.26, 0.06, 0.36, bronce, (PUERTA[0] + PUERTA[1]) / 2, 2.25, ZB - 0.15);
  const pqSign = textPlane(1.5, 0.28, 512, 96, (g, w, h) => { g.fillStyle = "#16181b"; g.fillRect(0, 0, w, h); g.fillStyle = "#E9EBEE"; g.font = "700 44px 'IBM Plex Mono', monospace"; g.textAlign = "center"; g.fillText("PAQUETERÍA ↑", w / 2, 63); }, { transparent: false });
  pqSign.position.set((PUERTA[0] + PUERTA[1]) / 2, 2.6, ZB + 0.02); scene.add(pqSign);
  pointL(LG.tvX, 2.8, -6.6, 0.5, 9); pointL(BAR.x, 2.6, -7.5, 0.4, 8);

  /* ---------- Gym (a la derecha de la sala de operaciones) ---------- */
  const gym = new THREE.Group(); gym.position.set(21, 0, 9); scene.add(gym);
  const gmat = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.035, 4.0), M(0x1b1d20, { roughness: 1 })); gmat.position.y = 0.018; gmat.receiveShadow = true; gym.add(gmat);
  [[0, -2.0, 12.6, .04], [0, 2.0, 12.6, .04], [-6.3, 0, .04, 4.0], [6.3, 0, .04, 4.0]].forEach(([x, z, w, d]) => { const e = box(w, 0.012, d, ledM, x, 0.04, z, gym); e.castShadow = false; });
  const steel = M(0xa7aeb5, { metalness: .85, roughness: .28 }), black = M(0x141414, { roughness: .6 }), rubber = M(0x101010, { roughness: .9 }), pad = M(0x2b2d31, { roughness: .6 });
  const hcyl = (r, len, mat, x, y, z, axis) => { const c = cyl(r, r, len, mat, x, y, z, gym, 20); if (axis === "x") c.rotation.z = Math.PI / 2; else c.rotation.x = Math.PI / 2; return c; };
  // jaula de sentadillas (power rack) sobre plataforma de madera, con barra cargada
  const rx = -4.9;
  box(2.4, 0.06, 2.4, M(0x8b6a48, { roughness: .7 }), rx, 0.05, -0.3, gym);
  [[-0.65, -1.0], [0.65, -1.0], [-0.65, 0.3], [0.65, 0.3]].forEach(([dx, dz]) => box(0.08, 2.35, 0.08, black, rx + dx, 1.2, dz, gym));
  [-1.0, 0.3].forEach(dz => box(1.38, 0.08, 0.08, black, rx, 2.36, dz, gym));
  [-0.65, 0.65].forEach(dx => box(0.08, 0.08, 1.38, black, rx + dx, 2.36, -0.35, gym));
  hcyl(0.018, 2.2, steel, rx, 1.35, 0.3, "x");
  [-0.85, -0.95, 0.85, 0.95].forEach((dx, i) => hcyl(i % 2 ? 0.17 : 0.23, 0.05, rubber, rx + dx, 1.35, 0.3, "x"));
  // banco de press plano frente a la jaula
  box(0.32, 0.08, 1.2, pad, rx, 0.45, 1.3, gym); box(0.06, 0.4, 0.06, steel, rx, 0.22, 0.85, gym); box(0.06, 0.4, 0.06, steel, rx, 0.22, 1.75, gym);
  // árbol de discos
  const tx = -3.0;
  cyl(0.3, 0.3, 0.04, black, tx, 0.04, -1.3, gym, 20); cyl(0.03, 0.03, 1.1, black, tx, 0.58, -1.3, gym, 8);
  [[0.35, .23], [0.6, .2], [0.85, .16]].forEach(([y, r]) => { [-1, 1].forEach(s => { hcyl(0.015, 0.25, steel, tx + s * 0.12, y, -1.3, "x"); hcyl(r, 0.06, rubber, tx + s * 0.22, y, -1.3, "x"); }); });
  // rack de mancuernas (2 niveles) con pares
  const dx0 = -1.2;
  box(2.6, 0.06, 0.55, black, dx0, 0.45, -1.55, gym); box(2.6, 0.06, 0.55, black, dx0, 0.85, -1.55, gym);
  [-1.25, 1.25].forEach(e => box(0.06, 0.88, 0.55, black, dx0 + e, 0.44, -1.55, gym));
  for (let row = 0; row < 2; row++) for (let k = 0; k < 5; k++) {
    const x = dx0 - 1.0 + k * 0.5, y = 0.55 + row * 0.4, r = 0.055 + k * 0.012 + row * 0.01;
    hcyl(0.02, 0.3, steel, x, y, -1.55, "z");
    [-0.14, 0.14].forEach(dz => hcyl(r, 0.07, black, x, y, -1.55 + dz, "z"));
  }
  // banco ajustable y pesas rusas
  const ab = box(0.32, 0.08, 1.1, pad, -1.2, 0.5, 0.2, gym); ab.rotation.x = -0.25;
  box(0.06, 0.42, 0.06, steel, -1.2, 0.22, -0.2, gym); box(0.06, 0.32, 0.06, steel, -1.2, 0.18, 0.6, gym);
  [0.14, 0.17, 0.2].forEach((r, i) => { const x = 0.5 + i * 0.45; const b = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), black); b.position.set(x, r, -1.6); b.castShadow = true; gym.add(b); const h = new THREE.Mesh(new THREE.TorusGeometry(r * 0.6, r * 0.13, 8, 16, Math.PI), black); h.position.set(x, r * 1.8, -1.6); gym.add(h); });
  // cinta de correr con pantalla
  const tm = new THREE.Group(); tm.position.set(1.4, 0, 0.6); gym.add(tm);
  box(0.85, 0.2, 2.0, M(0x1d1f22, { metalness: .4, roughness: .5 }), 0, 0.12, 0, tm); box(0.62, 0.02, 1.8, rubber, 0, 0.23, 0.05, tm);
  [-0.4, 0.4].forEach(dx => { const u = box(0.06, 1.25, 0.08, M(0x2a2c30, { metalness: .5 }), dx, 0.75, -0.85, tm); u.rotation.x = 0.18; });
  box(0.8, 0.06, 0.2, M(0x2a2c30, { metalness: .5 }), 0, 1.32, -0.95, tm);
  const tmScr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshBasicMaterial({ color: 0x3d7fbf, toneMapped: false })); tmScr.position.set(0, 1.48, -0.98); tmScr.rotation.x = -0.35; tm.add(tmScr);
  box(0.46, 0.3, 0.04, M(0x111214), 0, 1.48, -1.0, tm).rotation.x = -0.35;
  // bicicleta fija
  const bk = new THREE.Group(); bk.position.set(2.9, 0, 0.6); gym.add(bk);
  box(0.12, 0.06, 1.1, black, 0, 0.04, 0, bk); box(0.6, 0.05, 0.08, black, 0, 0.04, -0.5, bk); box(0.6, 0.05, 0.08, black, 0, 0.04, 0.5, bk);
  const fw = hcyl(0.26, 0.08, M(0x2a2c30, { metalness: .6 }), 0, 0.42, -0.35, "x"); fw.parent.remove(fw); bk.add(fw);
  const stem = box(0.08, 0.8, 0.08, black, 0, 0.55, 0.2, bk); stem.rotation.x = -0.25;
  box(0.26, 0.06, 0.32, pad, 0, 0.98, 0.32, bk);
  const hb = box(0.08, 0.7, 0.08, black, 0, 0.75, -0.35, bk); hb.rotation.x = 0.2;
  box(0.5, 0.05, 0.06, black, 0, 1.12, -0.45, bk);
  // saco de boxeo en su pórtico
  const sx = 4.9;
  [-0.8, 0.8].forEach(d => box(0.1, 3.0, 0.1, black, sx + d, 1.5, -0.6, gym)); box(1.7, 0.1, 0.1, black, sx, 3.0, -0.6, gym);
  cyl(0.006, 0.006, 0.5, M(0x777777), sx, 2.72, -0.6, gym, 4);
  cyl(0.24, 0.24, 1.2, M(0xe8e6e1, { roughness: .7 }), sx, 1.85, -0.6, gym, 24);
  // colchoneta, balones medicinales y botella
  box(0.6, 0.012, 1.7, M(0x5d6b78, { roughness: 1 }), 3.9, 0.04, 1.2, gym);
  [[5.6, 1.2, 0.16], [5.6, 1.6, 0.14]].forEach(([x, z, r]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), M(0x2c2f33, { roughness: .8 })); b.position.set(x, r + 0.03, z); b.castShadow = true; gym.add(b); });
  cyl(0.035, 0.035, 0.22, M(0xd6dde3, { metalness: .6, roughness: .25 }), -4.3, 0.56, 1.75, gym, 12);
  // letrero GYM colgado de la viga
  const gymSign = canvasTex(512, 160, (g, w, h) => { g.fillStyle = "#1c1e21"; g.fillRect(0, 0, w, h); g.fillStyle = "#E9EBEE"; g.font = "900 96px Archivo, sans-serif"; g.textAlign = "center"; g.fillText("GYM", w / 2, 116); });
  const gs = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: gymSign, side: THREE.DoubleSide })); gs.position.set(0, 4.1, -0.4); gym.add(gs);
  [-0.7, 0.7].forEach(d => cyl(0.005, 0.005, WH - 4.35, M(0x111111), d, 4.35 + (WH - 4.35) / 2, -0.4, gym, 4));

  /* ---------- Decoración del jefe: escritorio con su avatar, rincón gym ---------- */
  const rgbMats = [];
  const rgb = () => { const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff00ff, emissiveIntensity: 1.6 }); rgbMats.push(m); return m; };
  function person(parent, x, z, shirtHex, scale) {
    const p = new THREE.Group(); p.position.set(x, 0, z); p.scale.setScalar(scale || 1); parent.add(p);
    const shirt = M(shirtHex, { roughness: .7 });
    cyl(0.24, 0.28, 0.66, shirt, 0, 0.9, 0, p, 16);
    const hg = new THREE.Group(); hg.position.set(0, 1.37, 0); p.add(hg);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skin); h.castShadow = true; hg.add(h);
    const hr = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM); hr.rotation.x = 0.3; hr.position.set(0, 0.04, 0.02); hg.add(hr);
    box(0.38, 0.14, 0.52, M(0x1c232b), 0, 0.6, -0.15, p);
    [-1, 1].forEach(sx => { const sh = new THREE.Group(); sh.position.set(sx * 0.29, 1.1, 0); p.add(sh); const a = box(0.11, 0.11, 0.5, shirt, 0, -0.05, -0.25, sh); a.rotation.x = -0.3; });
    p.userData.head = hg;
    return p;
  }
  // Oficina de Santi (27/10): sala de vidrio al fondo a la izquierda, en planta baja. El escritorio mira a la sala de operaciones
  const SANTI = { x: -9, z: -6.2 };
  const boss = new THREE.Group(); boss.position.set(SANTI.x, 0, SANTI.z); boss.rotation.y = Math.PI; scene.add(boss);
  alfombra(SANTI.x, SANTI.z - 0.4, 5.8, 4.0, 0x24201c, 0x8a6d3e);
  const darkWood = M(0xffffff, { map: marbleN, roughness: .18, metalness: .06 });
  box(4.4, 0.08, 1.5, darkWood, 0, 0.64, 0, boss); box(4.42, 0.025, 1.52, bronce, 0, 0.59, 0, boss);
  box(4.4, 0.58, 0.08, darkWood, 0, 0.29, -0.7, boss);
  box(0.08, 0.6, 1.4, darkWood, -2.16, 0.3, 0, boss); box(0.08, 0.6, 1.4, darkWood, 2.16, 0.3, 0, boss);
  // tres monitores: uno recto al centro y dos curvos a los costados, girados hacia el jefe
  const bossScreens = [], bezelM = M(0x10181f, { metalness: .3, roughness: .4 });
  function bossCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = ANISO; return { c, t }; }
  {
    const { c, t } = bossCanvas(768, 450);
    box(1.5, 0.9, 0.06, bezelM, 0, 1.38, -0.45, boss);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.83), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    m.position.set(0, 1.38, -0.415); boss.add(m); bossScreens.push({ c, t, i: 1 });
    box(0.08, 0.36, 0.08, legM, 0, 0.86, -0.47, boss); box(0.45, 0.02, 0.25, legM, 0, 0.69, -0.45, boss);
  }
  [[-1.5, 0.42, 0], [1.5, -0.42, 2]].forEach(([x, rot, i]) => {
    const g = new THREE.Group(); g.position.set(x, 0, -0.32); g.rotation.y = rot; boss.add(g);
    const R = 1.9, L = 1.4 / R, cz = -0.06 + R;
    const back = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.035, R + 0.035, 0.9, 32, 1, true, Math.PI - (L + 0.04) / 2, L + 0.04), bezelM);
    back.position.set(0, 1.38, cz); g.add(back);
    const { c, t } = bossCanvas(768, 450); t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1;
    const scr = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.83, 32, 1, true, Math.PI - L / 2, L), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, toneMapped: false }));
    scr.position.set(0, 1.38, cz); g.add(scr); bossScreens.push({ c, t, i });
    box(0.08, 0.36, 0.08, legM, 0, 0.86, -0.12, g); box(0.4, 0.02, 0.24, legM, 0, 0.69, -0.1, g);
  });
  box(0.42, 0.015, 0.14, M(0x1b1d20), -0.08, 0.6875, 0.41, boss);
  box(0.24, 0.003, 0.2, M(0x23262b, { roughness: .95 }), 0.28, 0.6815, 0.37, boss).castShadow = false;
  { const r = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), M(0x1b1d20)); r.scale.set(0.9, 0.45, 1.4); r.position.set(0.27, 0.688, 0.37); r.castShadow = true; boss.add(r); }
  cyl(0.045, 0.04, 0.11, M(0xf4f6f8), 1.3, 0.735, 0.3, boss, 14);                       // taza
  box(0.22, 0.03, 0.3, M(0x2b2420), 1.0, 0.695, 0.25, boss);                             // libreta de cuero
  cyl(0.05, 0.12, 0.28, M(0xd4af37, { metalness: .9, roughness: .25 }), -1.85, 0.82, 0.4, boss);   // trofeo
  { const copa = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(0xd4af37, { metalness: .9, roughness: .25 })); copa.rotation.x = Math.PI; copa.position.set(-1.85, 1.06, 0.4); boss.add(copa); }
  const bossChair = sillaEjecutiva(boss, 0, 0.97, 0, cueroNegro);
  const bossP = person(boss, 0, 0.92, 0x111111, 1.08);   // Santi simple: solo se ve si no cargan las personas de Mixamo
  // mueble bajo con luz cálida y una planta, contra el muro del fondo
  box(4.0, 0.6, 0.45, darkWood, -5.6, 0.3, ZB + 0.3); box(4.0, 0.02, 0.02, M(0xffd9a0, { emissive: 0xffc070, emissiveIntensity: 1.2 }), -5.6, 0.61, ZB + 0.53);
  plantaLujo(-3.6, -3.3, 0.8);
  // izquierda: qué conviene traer · centro: el día de Cargo Brothers (dólar, oportunidades, pedidos, tiendas) · derecha: agentes
  function paintBoss() {
    const rank = typeof ranking !== "undefined" ? ranking : [], fx = typeof lastFx !== "undefined" ? lastFx : null, wait = typeof waiting !== "undefined" ? waiting : [];
    bossScreens.forEach(({ c, t, i }) => {
      const g = c.getContext("2d"), W = c.width, H = c.height;
      g.fillStyle = "#0b0d10"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#16191d"; g.fillRect(0, 0, W, 50); g.fillStyle = "#ECEDEF"; g.font = "700 25px Archivo, sans-serif"; g.textAlign = "left";
      if (i === 0) {
        g.fillText("Qué conviene traer", 18, 34);
        rank.slice(0, 6).forEach((r, k) => {
          const m = r.c.margin; g.fillStyle = m >= .15 ? "#5CD69A" : m >= .05 ? "#F2A541" : "#F07A7A";
          g.fillRect(250, 78 + k * 60, Math.max(4, Math.min(1, Math.abs(m) / .4) * 480), 30);
          g.fillStyle = "#ECEDEF"; g.font = "600 21px Archivo, sans-serif"; g.fillText(short(r.p.name).slice(0, 18), 16, 100 + k * 60);
          g.font = "600 19px 'IBM Plex Mono', monospace"; g.fillStyle = "#0b0d10"; g.fillText(`${(m * 100).toFixed(0)}%`, 258, 101 + k * 60);
        });
      } else if (i === 1) {
        if (typeof cbCanvas === "function") g.drawImage(cbCanvas(36, "#ECEDEF"), 14, 7);
        g.fillStyle = "#ECEDEF"; g.fillText("Hoy en Cargo Brothers", 60, 34);
        const ok = rank.filter(r => r.c.status === "good").length, ped = (D.pedidos || []).filter(p => !p.prueba);
        const enCamino = ped.filter(p => !/entregado/i.test(p.estado || "")).length;
        const kpis = [["Dólar", fx ? (+fx.usado).toFixed(2) + " Bs" : "—", "#ECEDEF"], ["Conviene", `${ok} de ${typeof P !== "undefined" ? P.length : rank.length}`, "#5CD69A"], ["Pedidos en camino", String(enCamino), "#4FD1E8"], ["Tiendas esperando", String(wait.length), "#F2A541"]];
        kpis.forEach(([lab, val, col], k) => {
          const x = 16 + k * 186; g.fillStyle = "#16191d"; g.fillRect(x, 64, 176, 92);
          g.fillStyle = "#8D949C"; g.font = "500 15px 'IBM Plex Mono', monospace"; g.fillText(lab.toUpperCase(), x + 12, 90);
          g.fillStyle = col; g.font = "700 34px Archivo, sans-serif"; g.fillText(val, x + 12, 136);
        });
        g.fillStyle = "#8D949C"; g.font = "500 15px 'IBM Plex Mono', monospace"; g.fillText("MEJOR OPORTUNIDAD", 16, 192);
        const best = rank[0];
        g.fillStyle = "#ECEDEF"; g.font = "700 24px Archivo, sans-serif";
        g.fillText(best ? `${short(best.p.name)}  ·  +${(best.c.margin * 100).toFixed(0)}%  ·  Bs ${fmt(best.c.gain)} por unidad` : "—", 16, 224);
        g.fillStyle = "#8D949C"; g.font = "500 15px 'IBM Plex Mono', monospace"; g.fillText("PEDIDOS", 16, 266);
        if (!ped.length) { g.fillStyle = "#6F7780"; g.font = "500 20px Archivo, sans-serif"; g.fillText("Sin pedidos cargados todavía. El agente Pedidos los mostrará aquí.", 16, 298); }
        ped.slice(0, 4).forEach((p, k) => {
          const y = 300 + k * 36, done = /entregado/i.test(p.estado || "");
          g.fillStyle = done ? "#5CD69A" : "#4FD1E8"; g.beginPath(); g.arc(24, y - 7, 7, 0, 7); g.fill();
          g.fillStyle = "#ECEDEF"; g.font = "600 20px Archivo, sans-serif"; g.fillText(`${p.cantidad || 1}× ${String(p.producto).slice(0, 28)}`, 42, y);
          g.fillStyle = "#8D949C"; g.font = "500 17px 'IBM Plex Mono', monospace"; g.fillText(String(p.estado || "").slice(0, 22) + (p.eta ? ` · llega ${p.eta}` : ""), 420, y);
        });
      } else {
        g.fillText("Agentes", 18, 34);
        AG.forEach((a, k) => {
          const st = STATES[a.state]; g.fillStyle = st.c; g.beginPath(); g.arc(30, 92 + k * 56, 11, 0, 7); g.fill();
          g.fillStyle = "#ECEDEF"; g.font = "600 22px Archivo, sans-serif"; g.fillText(a.name, 52, 100 + k * 56);
          g.fillStyle = "#8D949C"; g.font = "500 18px 'IBM Plex Mono', monospace"; g.fillText(String(a.liveText || st.t).slice(0, 34), 270, 100 + k * 56);
        });
      }
      t.needsUpdate = true;
    });
  }

  // Tablero del equipo: pantalla grande en el muro izquierdo, junto a la sala de operaciones, con las necesidades e ideas
  // de cada agente (toca para abrir)
  const tabG = new THREE.Group(); tabG.position.set(XL + 0.12, 3.6, 4.8); tabG.rotation.y = Math.PI / 2; scene.add(tabG);
  box(6.3, 3.6, 0.1, M(0x0c0f12, { metalness: .4, roughness: .35 }), 0, 0, 0, tabG);
  const tabTex = new THREE.CanvasTexture(TEX.tablero || document.createElement("canvas")); tabTex.encoding = THREE.sRGBEncoding; tabTex.anisotropy = ANISO;
  const tabScr = new THREE.Mesh(new THREE.PlaneGeometry(6.1, 3.43), new THREE.MeshBasicMaterial({ map: tabTex, toneMapped: false }));
  tabScr.position.z = 0.056; tabG.add(tabScr);
  let tabVer = -1;
  ST.tablero = { g: tabG };

  // Archivo de documentos: archiveros en la oficina de Santi, contra el muro del fondo; se arma más abajo
  const cabG = new THREE.Group(); cabG.position.set(-11.6, 0, ZB + 0.55); scene.add(cabG);
  ST.docs = { g: cabG };
  ST.jefe = { g: boss };

  /* ---------- Zonas nuevas de la nave ampliada (15/10): centro de operaciones, recepción, sala de reuniones,
     logística con muelle, señalética, relojes, pizarra del plan y acabados ---------- */
  const FN = "Archivo, system-ui, sans-serif", MONO = "'IBM Plex Mono', monospace";
  const hoyISO = (D.generado || "").split(" ")[0];
  const nombreAg = id => (AG.find(a => a.id === id) || {}).name || id;
  function textPlane(w, h, cw, ch, draw, opts) {
    const t = canvasTex(cw, ch, draw);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial(Object.assign({ map: t, transparent: true, toneMapped: false }, opts || {})));
    m.userData.tex = t; return m;
  }
  // letrero colgado del techo con dos cables
  function hangSign(text, x, z, rotY, y, w) {
    w = w || 2.8; y = y || 4.6;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY || 0; scene.add(g);
    box(w, 0.62, 0.06, M(0x1c1e21, { roughness: .6 }), 0, 0, 0, g).castShadow = false;
    const cwid = Math.round(1024 * (w - 0.1) / 2.7);
    const s = textPlane(w - 0.1, 0.5, cwid, 180, (c, cw, chh) => { c.clearRect(0, 0, cw, chh); c.fillStyle = "#E9EBEE"; let fs = chh * .42; do { c.font = `600 ${Math.round(fs)}px ${FN}`; fs -= 2; } while (c.measureText(text).width + text.length * chh * .07 > cw * .9 && fs > 20); spaced(c, text, cw / 2, chh * .66, chh * .07); });
    s.position.z = 0.035; g.add(s);
    const s2 = s.clone(); s2.rotation.y = Math.PI; s2.position.z = -0.035; g.add(s2);
    [-w / 2 + 0.2, w / 2 - 0.2].forEach(d => cyl(0.005, 0.005, WH - y - 0.3, M(0x111111), d, (WH - y - 0.3) / 2 + 0.31, 0, g, 4).castShadow = false);
  }
  // rótulo pintado en el piso
  function floorText(text, x, z, w, rotY) {
    const m = textPlane(w, w * 0.16, 1024, 164, (c, cw, ch) => {
      c.clearRect(0, 0, cw, ch); c.fillStyle = "rgba(40,43,48,.62)";
      // la letra se achica hasta que el texto entra entero en la placa (los nombres largos se cortaban en los bordes)
      let fs = Math.round(ch * .5), sp;
      const ancho = () => { c.font = `700 ${fs}px ${FN}`; sp = fs * .24; return [...text].reduce((a, k) => a + c.measureText(k).width, 0) + sp * (text.length - 1); };
      while (ancho() > cw * .94 && fs > 20) fs -= 2;
      spaced(c, text, cw / 2, ch * .5 + fs * .36, sp); }, { toneMapped: true });
    m.rotation.x = -Math.PI / 2; m.rotation.z = rotY || 0; m.position.set(x, 0.021, z); scene.add(m);
  }
  const lineF = (x, z, w, d) => box(w, 0.01, d, M(0xe9ecef, { roughness: .5 }), x, 0.006, z).castShadow = false;

  // ---- Archivo de documentos: 4 archiveros altos con 4 cajones cada uno; los 7 cajones rotulados son los del
  //      explorador (archivo.js) y el que se abre ahí sale también acá (window.archivo3D.abrir) ----
  const cabDrawers = [], cabTarget = [];
  {
    const steelC = M(0x3a3f45, { metalness: .45, roughness: .4 }), frontC = M(0x464c53, { metalness: .4, roughness: .38 });
    const brass = M(0xc9a35a, { metalness: .7, roughness: .3 }), CWc = 1.15, CHc = 2.3, CDc = 0.75, NC = 4;
    box(NC * CWc + 0.5, 0.012, 1.9, M(0x23262a, { roughness: 1 }), 0, 0.008, 0.55, cabG).castShadow = false;   // alfombra del archivo
    const cajones = window.ARCHIVO_CAJONES || [];
    // orden de los rótulos: fila a la altura del pecho primero, de izquierda a derecha
    const slots = []; [2, 1, 3, 0].forEach(r => { for (let c = 0; c < NC; c++) slots.push([c, r]); });
    for (let c = 0; c < NC; c++) {
      const x = (c - (NC - 1) / 2) * (CWc + 0.04);
      box(CWc, CHc, CDc, steelC, x, CHc / 2, 0, cabG);
      box(CWc + 0.02, 0.03, CDc + 0.02, M(0x1f2226, { metalness: .5 }), x, CHc + 0.015, 0, cabG);
    }
    slots.forEach(([c, r], k) => {
      const x = (c - (NC - 1) / 2) * (CWc + 0.04), y = 0.08 + r * 0.55 + 0.26;
      const dg = new THREE.Group(); dg.position.set(x, y, CDc / 2); cabG.add(dg);
      box(CWc - 0.08, 0.5, 0.04, frontC, 0, 0, 0.02, dg);
      box(CWc - 0.14, 0.46, 0.5, M(0x2a2e33, { metalness: .3 }), 0, -0.01, -0.25, dg);           // cuerpo del cajón (se ve al abrirlo)
      box(0.32, 0.045, 0.05, brass, 0, -0.14, 0.06, dg);
      const cj = cajones[k];
      if (cj) {
        const lab = textPlane(0.78, 0.2, 384, 98, (g, w, h) => { g.fillStyle = "#EDE8DC"; g.fillRect(0, 0, w, h); g.fillStyle = cj.col; g.fillRect(0, 0, 10, h);
          g.fillStyle = "#2a2620"; let fs = 44; do { g.font = `700 ${fs}px Archivo, sans-serif`; fs -= 1; } while (g.measureText(cj.nombre).width > w - 26 && fs > 14);
          g.textBaseline = "middle"; g.fillText(cj.nombre, 18, h / 2 + 1); }, { transparent: false });
        lab.position.set(0, 0.1, 0.043); dg.add(lab);
        // carpetas colgantes con el color del cajón (se ven cuando sale)
        for (let f = 0; f < Math.min(6, Math.max(2, cj.n)); f++) box(CWc - 0.24, 0.3, 0.012, M(new THREE.Color(cj.col), { roughness: .8 }), 0, 0.12, -0.08 - f * 0.07, dg).castShadow = false;
      }
      cabDrawers.push(dg); cabTarget.push(0);
    });
    // letrero, LED y lámpara del archivo
    hangSign("ARCHIVO", -11.6, ZB + 1.6, 0, 4.0, 2.4);
    box(NC * (CWc + 0.04), 0.03, 0.06, ledM, 0, CHc + 0.05, CDc / 2 - 0.05, cabG).castShadow = false;
    const al = new THREE.PointLight(0xfff3dc, 0.45, 6, 2); al.position.set(0, 2.9, 1.4); cabG.add(al);
    floorText("ARCHIVO DE DOCUMENTOS", -11.6, ZB + 1.7, 4.4);
  }
  // el explorador avisa qué cajón abrió (-1 = cerrar todos)
  window.archivo3D = { abrir(i) { cabTarget.forEach((_, k) => { cabTarget[k] = k === i ? 0.48 : 0; }); } };

  // ---- borde de la nave en el piso y pasillo principal hacia el frente ----
  box(RW, 0.012, 0.06, ledM, XC, 0.01, ZF - 0.03).castShadow = false;
  box(0.06, 0.012, DEP, ledM, XR - 0.03, 0.01, ZM).castShadow = false;
  lineF(XC, 12.4, RW - 2, 0.05); lineF(XC, 13.2, RW - 2, 0.05);
  for (let x = XL + 1.2; x < XR - 0.6; x += 1.6) lineF(x, 12.8, 0.7, 0.05);

  // ---- 1. Centro de operaciones: videowall en la franja sobre el vidrio de las salas del fondo, frente a los puestos ----
  const VW = 13, VH = 3.6, VX = -3, VY = 5.0, BANDA = -2.45;   // BANDA: cara de la franja oscura que mira a la sala
  box(VW + 1.0, VH + 0.6, 0.06, M(0x24272b, { roughness: 1 }), VX, VY, BANDA + 0.03).castShadow = false;   // panel acústico de fondo
  box(VW + 0.12, VH + 0.12, 0.12, M(0x08090a, { metalness: .4, roughness: .3 }), VX, VY, BANDA + 0.09).castShadow = false;
  const opsCv = document.createElement("canvas"); opsCv.width = 2048; opsCv.height = 576;
  const opsTex = new THREE.CanvasTexture(opsCv); opsTex.encoding = THREE.sRGBEncoding; opsTex.anisotropy = ANISO;
  const opsScr = new THREE.Mesh(new THREE.PlaneGeometry(VW, VH), new THREE.MeshBasicMaterial({ map: opsTex, toneMapped: false }));
  opsScr.position.set(VX, VY, BANDA + 0.16); scene.add(opsScr);
  box(VW + 0.3, 0.03, 0.08, ledM, VX, VY + VH / 2 + 0.12, BANDA + 0.1).castShadow = false;
  const STEPG = [/entregado|cochabamba|delivered/i, /bolivia|vuelo|aduana|camino|bodega|courier|miami|warehouse|enviado|recibido|tr[aá]nsito|en ruta/i];
  const etapa = e => STEPG[0].test(e || "") ? 2 : STEPG[1].test(e || "") ? 1 : 0;
  function paintOps() {
    const g = opsCv.getContext("2d"), W = 2048, H = 576, CW = W / 4;
    const rank = typeof ranking !== "undefined" ? ranking : [], fx = typeof lastFx !== "undefined" ? lastFx : null, wait = typeof waiting !== "undefined" ? waiting : [];
    g.fillStyle = "#0a0c0f"; g.fillRect(0, 0, W, H);
    const head = (k, t) => { g.fillStyle = "#14171b"; g.fillRect(k * CW, 0, CW, 58); g.fillStyle = "#8D949C"; g.font = `600 24px ${MONO}`; g.textAlign = "left"; g.fillText(t, k * CW + 22, 38); };
    // envíos por etapa (sin guías ni números de pedido)
    head(0, "ENVÍOS");
    const ped = (D.pedidos || []).filter(p => !p.prueba), cnt = [0, 0, 0]; ped.forEach(p => cnt[etapa(p.estado)]++);
    const nodes = [["EE.UU.", "en espera", cnt[0]], ["Miami → Bolivia", "en camino", cnt[1]], ["Cochabamba", "entregados", cnt[2]]];
    nodes.forEach(([n, l, v], i) => {
      const x = 70 + i * 165, y = 300;
      if (i < 2) { g.strokeStyle = "#3a4048"; g.lineWidth = 4; g.setLineDash([10, 10]); g.beginPath(); g.moveTo(x + 30, y); g.lineTo(x + 135, y); g.stroke(); g.setLineDash([]); }
      g.fillStyle = ["#4FD1E8", "#F2A541", "#5CD69A"][i]; g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill();
      g.fillStyle = "#ECEDEF"; g.font = `700 64px ${FN}`; g.textAlign = "center"; g.fillText(String(v), x, y - 50);
      g.fillStyle = "#8D949C"; g.font = `500 21px ${FN}`; g.fillText(l, x, y + 56); g.fillStyle = "#ECEDEF"; g.font = `600 20px ${FN}`; g.fillText(n, x, y + 84);
    });
    g.textAlign = "left"; g.fillStyle = "#6F7780"; g.font = `500 19px ${MONO}`; g.fillText(ped.length ? `${ped.length} pedido${ped.length > 1 ? "s" : ""} del negocio` : "sin pedidos del negocio todavía", 22, H - 30);
    // números del día
    head(1, "HOY · " + (hoyISO ? hoyISO.split("-").reverse().slice(0, 2).join("/") : ""));
    const msgsHoy = (D.mensajes || []).filter(m => m.fecha === hoyISO).length;
    const ok = rank.filter(r => r.c.status === "good").length, tot = typeof P !== "undefined" ? P.length : rank.length;
    [["DÓLAR", fx ? (+fx.usado).toFixed(2) + " Bs" : "—", "#ECEDEF"], ["CONVIENE", `${ok} de ${tot}`, "#5CD69A"], ["TIENDAS ESPERANDO", String(wait.length), "#F2A541"], ["MENSAJES HOY", String(msgsHoy), "#4FD1E8"]].forEach(([l, v, c], k) => {
      const x = CW + 22 + (k % 2) * 245, y = 80 + Math.floor(k / 2) * 240;
      g.fillStyle = "#14171b"; g.fillRect(x, y, 228, 215); g.fillStyle = "#8D949C"; g.font = `500 19px ${MONO}`; g.fillText(l, x + 16, y + 40);
      g.fillStyle = c; g.font = `700 ${v.length > 6 ? 54 : 70}px ${FN}`; g.fillText(v, x + 16, y + 140);
    });
    // qué conviene traer
    head(2, "QUÉ CONVIENE TRAER");
    rank.slice(0, 6).forEach((r, k) => {
      const m = r.c.margin, y = 100 + k * 76, col = m >= .15 ? "#5CD69A" : m >= .05 ? "#F2A541" : "#F07A7A";
      g.fillStyle = "#ECEDEF"; g.font = `600 24px ${FN}`; g.fillText(short(r.p.name).slice(0, 20), 2 * CW + 22, y);
      g.fillStyle = "#1c2026"; g.fillRect(2 * CW + 22, y + 12, 400, 22); g.fillStyle = col; g.fillRect(2 * CW + 22, y + 12, Math.max(6, Math.min(1, Math.abs(m) / .4) * 400), 22);
      g.fillStyle = col; g.font = `700 24px ${MONO}`; g.fillText(`${(m * 100).toFixed(0)}%`, 2 * CW + 434, y + 32);
    });
    // equipo
    head(3, "EQUIPO");
    AG.forEach((a, k) => {
      const st = STATES[a.state], y = 98 + k * (440 / Math.max(6, AG.length));
      g.fillStyle = st.c; g.beginPath(); g.arc(3 * CW + 36, y - 8, 10, 0, 7); g.fill();
      g.fillStyle = "#ECEDEF"; g.font = `600 23px ${FN}`; g.fillText(a.name.slice(0, 18), 3 * CW + 58, y);
      g.fillStyle = "#8D949C"; g.font = `500 18px ${MONO}`; g.fillText(String(a.liveText || st.t).slice(0, 16), 3 * CW + 300, y);
    });
    // marcos entre pantallas (4 × 2)
    g.fillStyle = "#050607"; for (let k = 1; k < 4; k++) g.fillRect(k * CW - 3, 0, 6, H); g.fillRect(0, H / 2 - 3, W, 6);
    opsTex.needsUpdate = true;
  }
  paintOps();
  floorText("OPERACIONES", -3, 11.6, 7);

  // ---- 2. Relojes de dos ciudades (hora real) ----
  const clocks = [["Cochabamba", "America/La_Paz", -12.9], ["Miami", "America/New_York", -11.1]].map(([n, tz, x]) => {
    const c = textPlane(1.05, 1.05, 256, 256, () => {}, { transparent: true });
    c.position.set(x, 5.55, BANDA + 0.05); scene.add(c);
    cyl(0.56, 0.56, 0.06, M(0x111214, { metalness: .5, roughness: .3 }), x, 5.55, BANDA + 0.01).rotation.x = Math.PI / 2;
    const lab = textPlane(1.6, 0.26, 512, 84, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = "#C9CED4"; g.font = `600 34px ${MONO}`; spaced(g, n.toUpperCase(), w / 2, 56, 6); });
    lab.position.set(x, 4.82, BANDA + 0.05); scene.add(lab);
    return { c, tz };
  });
  function paintClocks() {
    clocks.forEach(({ c, tz }) => {
      let hh = 0, mm = 0;
      try { new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date()).forEach(p => { if (p.type === "hour") hh = +p.value % 24; if (p.type === "minute") mm = +p.value; }); } catch (e) { }
      const g = c.userData.tex.image.getContext("2d"), R = 120; g.clearRect(0, 0, 256, 256);
      g.fillStyle = "#ECEDEF"; g.beginPath(); g.arc(128, 128, R, 0, 7); g.fill();
      g.strokeStyle = "#1a1c1f"; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; g.lineWidth = k % 3 ? 3 : 7; g.beginPath(); g.moveTo(128 + Math.sin(a) * (R - 10), 128 - Math.cos(a) * (R - 10)); g.lineTo(128 + Math.sin(a) * (R - 26), 128 - Math.cos(a) * (R - 26)); g.stroke(); }
      const hand = (a, l, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = "round"; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(a) * l, 128 - Math.cos(a) * l); g.stroke(); };
      hand((hh % 12 + mm / 60) * Math.PI / 6, 60, 9, "#1a1c1f"); hand(mm * Math.PI / 30, 92, 6, "#1a1c1f");
      g.fillStyle = "#1a1c1f"; g.beginPath(); g.arc(128, 128, 8, 0, 7); g.fill();
      c.userData.tex.needsUpdate = true;
    });
  }
  paintClocks();

  // ---- 3. Pizarra de vidrio con el plan del día (plan.csv) ----
  const piz = new THREE.Group(); piz.position.set(11.2, 0, 2.8); scene.add(piz);
  [-1.55, 1.55].forEach(d => { box(0.05, 2.75, 0.05, M(0x18191b, { metalness: .6 }), d, 1.37, 0, piz); box(0.5, 0.04, 0.06, M(0x18191b, { metalness: .6 }), d, 0.02, 0, piz); });
  const pizBoard = textPlane(3.0, 1.8, 1024, 614, () => {}, { transparent: true });
  pizBoard.position.set(0, 1.75, 0.03); piz.add(pizBoard);
  const pizBack = pizBoard.clone(); pizBack.rotation.y = Math.PI; pizBack.position.z = -0.03; piz.add(pizBack);
  function paintPizarra() {
    const g = pizBoard.userData.tex.image.getContext("2d"), W = 1024, H = 614;
    g.clearRect(0, 0, W, H); g.fillStyle = "rgba(236,240,243,.93)"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
    const planes = (D.plan || []).filter(p => p.fecha_para);
    const dias = [...new Set(planes.map(p => p.fecha_para))].sort();
    const dia = dias.includes(hoyISO) ? hoyISO : dias.filter(d => d <= hoyISO).pop() || dias.pop();
    const lista = planes.filter(p => p.fecha_para === dia);
    g.fillStyle = "#1b1e22"; g.font = `800 44px ${FN}`; g.textAlign = "left";
    g.fillText("PLAN DEL DÍA" + (dia ? " · " + dia.split("-").reverse().slice(0, 2).join("/") : ""), 36, 70);
    g.fillStyle = "#1b1e22"; g.fillRect(36, 88, 420, 4);
    if (!lista.length) { g.fillStyle = "#59606a"; g.font = `500 30px ${FN}`; g.fillText("Sin tareas cargadas todavía.", 36, 160); }
    const CH = { hecho: ["#2f9e6b", "✓ hecho"], aprobado: ["#2f6fb0", "aprobado"], propuesto: ["#c98a1c", "por decidir"], rechazado: ["#8a8f96", "rechazado"] };
    lista.slice(0, 7).forEach((p, k) => {
      const y = 150 + k * 64, [col, lab] = CH[p.estado] || ["#8a8f96", p.estado || ""];
      g.fillStyle = col; g.fillRect(36, y - 32, 170, 42); g.fillStyle = "#fff"; g.font = `700 22px ${FN}`; g.fillText(lab, 48, y - 4);
      g.fillStyle = "#1b1e22"; g.font = `700 25px ${FN}`; const ag = nombreAg(p.agente); g.fillText(ag.slice(0, 16), 222, y - 4);
      g.fillStyle = "#3a3f46"; g.font = `500 23px ${FN}`; let t = String(p.tarea || ""); while (g.measureText(t).width > 560 && t.length > 4) t = t.slice(0, -4) + "…"; g.fillText(t, 440, y - 4);
    });
    if (lista.length > 7) { g.fillStyle = "#59606a"; g.font = `500 22px ${FN}`; g.fillText(`+ ${lista.length - 7} tareas más en el tablero del equipo`, 36, H - 26); }
    pizBoard.userData.tex.needsUpdate = true; pizBack.material.map.needsUpdate = true;
  }
  paintPizarra();

  // ---- 4. Recepción en la entrada: mostrador de mármol, pared de mármol negro con el logo, espera y jardín vertical ----
  box(4.6, 1.08, 0.7, nero, REC.x, 0.54, REC.z);
  box(4.8, 0.05, 0.86, marbleWM, REC.x, 1.105, REC.z - 0.04);
  box(4.5, 0.012, 0.03, ledM, REC.x, 0.06, REC.z + 0.36).castShadow = false;
  box(4.2, 0.05, 0.6, M(0x2a2d31), REC.x, 0.76, REC.z - 0.7);
  box(0.55, 0.36, 0.04, M(0x0d0e10), REC.x + 1.2, 1.32, REC.z - 0.25).rotation.y = Math.PI;
  cyl(0.12, 0.09, 0.3, marbleWM, REC.x - 1.8, 1.27, REC.z - 0.05, scene, 18);
  [[0, .32, 0, .14], [.06, .4, .04, .1]].forEach(([dx, dy, dz, r]) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), M(0x2f7a52, { roughness: .8 })); m.position.set(REC.x - 1.8 + dx, 1.27 + dy - 0.1, REC.z - 0.05 + dz); scene.add(m); });
  box(0.04, 0.28, 0.22, M(0x0d0e10), REC.x + 1.05, 1.27, REC.z - 0.25);
  sofa(-13.4, 16.6, 1.0, 0.95, Math.PI / 2); sofa(-13.4, 18.0, 1.0, 0.95, Math.PI / 2);
  cyl(0.38, 0.38, 0.05, marbleWM, -12.3, 0.44, 17.3, scene, 36); cyl(0.2, 0.24, 0.42, M(0x2a2c30, { roughness: .4 }), -12.3, 0.21, 17.3, scene, 24);
  // jardín vertical en el muro izquierdo
  const leaves = canvasTex(512, 512, (g, w, h) => { g.fillStyle = "#1f3b2a"; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = `hsl(${120 + rnd() * 30},${35 + rnd() * 25}%,${18 + rnd() * 22}%)`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 10, 3 + rnd() * 5, rnd() * 3, 0, 7); g.fill(); } });
  leaves.wrapS = leaves.wrapT = THREE.RepeatWrapping; leaves.repeat.set(2, 1.4);
  const gw = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.2), M(0xffffff, { map: leaves, roughness: 1 })); gw.rotation.y = Math.PI / 2; gw.position.set(XL + 0.05, 1.9, 16.85); scene.add(gw);
  for (let i = 0; i < 46; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 + rnd() * 0.12, 0), M(0x2f7a52 + Math.floor(rnd() * 3) * 0x020301, { roughness: .8 })); m.position.set(XL + 0.12 + rnd() * 0.15, 0.4 + rnd() * 3.0, 14.85 + rnd() * 3.9); scene.add(m); }
  box(0.12, 0.08, 4.3, ledM, XL + 0.12, 3.55, 16.85).castShadow = false;
  // alfombra de entrada con el logo
  const mat = textPlane(3.2, 1.6, 512, 256, (g, w, h) => { g.fillStyle = "#1c1e21"; g.fillRect(0, 0, w, h); if (typeof cbCanvas === "function") g.drawImage(cbCanvas(150, "#9aa0a8"), (w - 150) / 2, 34); }, { toneMapped: true, transparent: false });
  mat.rotation.x = -Math.PI / 2; mat.position.set(REC.x, 0.02, ZF - 1.1); scene.add(mat);
  floorText("RECEPCIÓN", REC.x + 4.6, REC.z + 0.4, 3.6);
  pointL(REC.x, 3.4, REC.z, 0.6, 9);

  // ---- 5. Salas de vidrio del fondo: oficina de Santi (x -15 a -3) y sala de reuniones (x -3 a 9) ----
  const VID_Z = -2.6;   // frente de vidrio; arriba va la franja oscura con el videowall
  const glassM = new THREE.MeshStandardMaterial({ color: 0xd6e2ec, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const frost = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  function glassWall(x1, z1, x2, z2) {
    const len = Math.hypot(x2 - x1, z2 - z1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, ang = Math.atan2(z2 - z1, x2 - x1);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.8), glassM); gl.position.set(cx, 1.4, cz); gl.rotation.y = -ang; scene.add(gl);
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.18), frost); fr.position.set(cx, 1.15, cz); fr.rotation.y = -ang; scene.add(fr);
    [0.03, 2.82].forEach(y => { const f = box(len, 0.06, 0.06, M(0x16181a, { metalness: .6 }), cx, y, cz); f.rotation.y = -ang; f.castShadow = false; });
  }
  const PU_SANTI = [-5.4, -4.2], PU_REU = [6.0, 7.2];   // puertas
  glassWall(XL, VID_Z, PU_SANTI[0], VID_Z); glassWall(PU_SANTI[1], VID_Z, PU_REU[0], VID_Z); glassWall(PU_REU[1], VID_Z, XLO, VID_Z);
  glassWall(-3, ZB, -3, VID_Z); glassWall(XLO, ZB, XLO, VID_Z);
  [...PU_SANTI, ...PU_REU].forEach(x => box(0.07, 2.8, 0.07, M(0x16181a, { metalness: .6 }), x, 1.4, VID_Z));
  box(XLO - XL, WH - 2.85, 0.3, muroM(XLO - XL), (XL + XLO) / 2, 2.85 + (WH - 2.85) / 2, VID_Z);   // franja sobre el vidrio
  box(XLO - XL, 0.03, 0.06, ledM, (XL + XLO) / 2, 2.87, VID_Z + 0.17).castShadow = false;
  floorText("SANTI", SANTI.x, -3.4, 3.0); floorText("REUNIONES", 3, -3.4, 3.6);

  // sala de reuniones: mesa ovalada de mármol cálido con borde de bronce sobre dos pies esculpidos, 10 sillas ejecutivas
  // de cuero cognac, lámpara colgante de luz cálida y la pantalla con el informe del Gerente
  const SR = { x0: -3, x1: XLO, z0: ZB, z1: VID_Z };
  const srCx = (SR.x0 + SR.x1) / 2, srCz = -6.4;
  alfombra(srCx, srCz, 8.4, 4.6, 0x2a2420, 0x8a6d3e);
  { const top = cyl(1, 1, 0.07, marmolCalido, srCx, 0.75, srCz, scene, 48); top.scale.set(2.7, 1, 1.0);
    const canto = cyl(1, 1, 0.03, bronce, srCx, 0.705, srCz, scene, 48); canto.scale.set(2.72, 1, 1.02);
    [-1.5, 1.5].forEach(d => { cyl(0.18, 0.38, 0.68, marmolCalido, srCx + d, 0.34, srCz, scene, 24); cyl(0.4, 0.4, 0.03, bronce, srCx + d, 0.015, srCz, scene, 24); });
    [-1.8, -0.6, 0.6, 1.8].forEach(d => { sillaEjecutiva(scene, srCx + d, srCz - 1.4, Math.PI, cueroCognac); sillaEjecutiva(scene, srCx + d, srCz + 1.4, 0, cueroCognac); });
    sillaEjecutiva(scene, srCx - 3.25, srCz, -Math.PI / 2, cueroCognac); sillaEjecutiva(scene, srCx + 3.25, srCz, Math.PI / 2, cueroCognac);
    cyl(0.01, 0.01, WH - 2.95, bronce, srCx, 2.95 + (WH - 2.95) / 2, srCz, scene, 6);
    const lamp = cyl(1, 1, 0.08, bronce, srCx, 2.95, srCz, scene, 40); lamp.scale.set(2.0, 1, 0.35); lamp.castShadow = false;
    const brillo = cyl(1, 1, 0.01, new THREE.MeshBasicMaterial({ color: 0xffe2b0 }), srCx, 2.905, srCz, scene, 40); brillo.scale.set(1.95, 1, 0.32); brillo.castShadow = false;
    const calida = new THREE.PointLight(0xffc98a, .8, 8, 2); calida.position.set(srCx, 2.6, srCz); scene.add(calida); }
  // pantalla en el muro del fondo: logo y el informe del Gerente
  box(2.6, 1.5, 0.1, M(0x0a0a0b, { metalness: .4, roughness: .3 }), srCx, 1.75, ZB + 0.06);
  const srScr = textPlane(2.45, 1.38, 1024, 576, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#1d2024"); gr.addColorStop(1, "#0d0e10"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    brandArt(g, w, h, 220, 50, 10);
    g.fillStyle = "#8D949C"; g.font = `500 24px ${MONO}`; g.textAlign = "center"; g.fillText("informe del Gerente · todos los días 20:00", w / 2, h - 40); g.textAlign = "left";
  }, { transparent: false });
  srScr.position.set(srCx, 1.75, ZB + 0.12); scene.add(srScr);
  const srSign = textPlane(4.4, 0.5, 1024, 116, (g, w, h) => { g.fillStyle = "rgba(22,24,27,.88)"; g.fillRect(0, 0, w, h); g.fillStyle = "#E9EBEE"; g.font = `600 52px ${FN}`; spaced(g, "SALA DE REUNIONES", w / 2, 78, 10); });
  srSign.position.set(1.6, 2.3, VID_Z + 0.02); scene.add(srSign);
  plantaLujo(SR.x1 - 0.7, ZB + 0.8, 0.9);

  // ---- 6. Paquetería: cobertizo trasero detrás del lounge (se entra por la puerta del muro del fondo), lejos de los agentes ----
  const PQ = { x0: 12, x1: 23, z0: -17, z1: ZB }, PQH = 3.0;
  const WZ = new THREE.Group(); scene.add(WZ);
  { const piso = new THREE.Mesh(new THREE.PlaneGeometry(PQ.x1 - PQ.x0, PQ.z1 - PQ.z0), M(0x8f9398, { roughness: .55, metalness: .05 }));
    piso.rotation.x = -Math.PI / 2; piso.position.set((PQ.x0 + PQ.x1) / 2, 0.002, (PQ.z0 + PQ.z1) / 2); piso.receiveShadow = true; WZ.add(piso); }
  const DOCK = { z: -13.4, w: 3.2, h: 2.5 };   // portón de carga en la pared derecha
  box(0.2, PQH, PQ.z1 - PQ.z0, muroM(7), PQ.x0, PQH / 2, (PQ.z0 + PQ.z1) / 2, WZ);
  box(PQ.x1 - PQ.x0 + 0.2, PQH, 0.2, muroM(11), (PQ.x0 + PQ.x1) / 2, PQH / 2, PQ.z0, WZ);
  [[PQ.z0, DOCK.z - DOCK.w / 2], [DOCK.z + DOCK.w / 2, PQ.z1 - 0.3]].forEach(([a, b]) => box(0.2, PQH, b - a, muroM(2), PQ.x1, PQH / 2, (a + b) / 2, WZ));
  box(0.2, PQH - DOCK.h, DOCK.w, muroM(1), PQ.x1, DOCK.h + (PQH - DOCK.h) / 2, DOCK.z, WZ);
  box(PQ.x1 - PQ.x0, 0.03, 0.05, ledM, (PQ.x0 + PQ.x1) / 2, PQH - 0.03, PQ.z0 + 0.12, WZ).castShadow = false;
  // muelle 1: portón enrollable con franjas de seguridad en el piso
  const slats = canvasTex(256, 512, (g, w, h) => { g.fillStyle = "#7d848c"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = "#5e646b"; g.fillRect(0, y + 12, w, 4); g.fillStyle = "#9aa1a8"; g.fillRect(0, y, w, 2); } });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(DOCK.w, DOCK.h), M(0xffffff, { map: slats, metalness: .5, roughness: .45 }));
  door.rotation.y = -Math.PI / 2; door.position.set(PQ.x1 - 0.11, DOCK.h / 2, DOCK.z); WZ.add(door);
  const franjas = canvasTex(256, 32, (g, w, h) => { for (let x = -32; x < w; x += 32) { g.fillStyle = (x / 32) % 2 ? "#111" : "#e8b400"; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, h); g.fill(); } });
  franjas.wrapS = THREE.RepeatWrapping; franjas.repeat.x = 4;
  const fr = new THREE.Mesh(new THREE.PlaneGeometry(DOCK.w, 0.25), M(0xffffff, { map: franjas })); fr.rotation.x = -Math.PI / 2; fr.rotation.z = Math.PI / 2; fr.position.set(PQ.x1 - 0.4, 0.006, DOCK.z); WZ.add(fr);
  const dockSign = textPlane(1.6, 0.36, 1024, 232, (g, w, h) => { g.fillStyle = "#1c1e21"; g.fillRect(0, 0, w, h); g.fillStyle = "#E9EBEE"; g.font = `700 104px ${FN}`; spaced(g, "MUELLE 1", w / 2, 158, 18); }, { transparent: false });
  dockSign.rotation.y = -Math.PI / 2; dockSign.position.set(PQ.x1 - 0.11, DOCK.h + 0.27, DOCK.z); WZ.add(dockSign);
  // estanterías contra la pared del fondo
  shelf(14.6, PQ.z0 + 0.6, WZ); shelf(19.0, PQ.z0 + 0.6, WZ);
  // mesa de empaque con balanza (el courier B cobra por kg)
  const EM = new THREE.Group(); EM.position.set(14.0, 0, -14.1); WZ.add(EM);
  box(3.0, 0.06, 0.95, M(0x9aa3ab, { metalness: .7, roughness: .3 }), 0, 0.92, 0, EM);
  [[-1.42, -0.42], [1.42, -0.42], [-1.42, 0.42], [1.42, 0.42]].forEach(([x, z]) => box(0.06, 0.9, 0.06, M(0x18191b, { metalness: .6 }), x, 0.45, z, EM));
  box(2.9, 0.04, 0.85, M(0x18191b, { metalness: .5 }), 0, 0.25, 0, EM);
  box(0.5, 0.05, 0.42, M(0x1d2023, { metalness: .5 }), -0.7, 0.975, 0, EM);
  parcel("ebay", 0.4, 0.26, 0.32, -0.7, 1.13, 0, EM);
  const scale = textPlane(0.36, 0.13, 256, 92, (g, w, h) => { g.fillStyle = "#0b1a10"; g.fillRect(0, 0, w, h); g.fillStyle = "#7CFF9E"; g.font = `700 48px ${MONO}`; g.textAlign = "center"; g.fillText("1,00 kg", w / 2, 64); }, { transparent: false });
  box(0.42, 0.18, 0.06, M(0x111214), -0.7, 1.06, 0.26, EM); scale.position.set(-0.7, 1.06, 0.295); EM.add(scale);
  const tape = cyl(0.11, 0.11, 0.06, M(0xc9b48a, { roughness: .6 }), 0.45, 1.0, 0.05, EM, 20); tape.rotation.x = Math.PI / 2;
  box(0.3, 0.18, 0.08, M(0x2a2d31), 0.45, 1.0, 0.12, EM);
  const bub = cyl(0.22, 0.22, 0.9, M(0xdfe7ee, { transparent: true, opacity: .75, roughness: .2 }), 1.1, 1.17, -0.05, EM, 20); bub.rotation.z = Math.PI / 2;
  box(0.38, 0.22, 0.3, M(0xeeeeee, { roughness: .6 }), 0.95, 1.06, 0.2, EM);   // impresora de etiquetas
  for (let k = 0; k < 6; k++) box(1.1, 0.012, 0.8, M(0xb58e5c, { roughness: .9 }), 0, 0.28 + k * 0.014, 0, EM);   // cartones planos abajo
  // transpaleta
  const TP = new THREE.Group(); TP.position.set(20.6, 0, -12.6); TP.rotation.y = 0.6; WZ.add(TP);
  [-0.26, 0.26].forEach(d => box(0.17, 0.07, 1.15, M(0xe8b400, { metalness: .4, roughness: .45 }), d, 0.08, 0.4, TP));
  box(0.7, 0.32, 0.26, M(0xe8b400, { metalness: .4, roughness: .45 }), 0, 0.22, -0.25, TP);
  const hd = box(0.05, 1.1, 0.05, M(0x1f2226, { metalness: .5 }), 0, 0.85, -0.45, TP); hd.rotation.x = -0.35;
  box(0.36, 0.05, 0.05, M(0x111111), 0, 1.36, -0.63, TP);
  [-0.15, 0.15].forEach(d => { const wl = cyl(0.09, 0.09, 0.06, M(0x111111), d, 0.09, -0.3, TP, 14); wl.rotation.z = Math.PI / 2; });
  // PAQUETES DE LOS PEDIDOS: una caja por cada pedido real que todavía no llegó (los de prueba no cuentan).
  // Cada pedido nuevo de pedidos.csv suma su caja al pallet; nunca se muestra la guía ni el número de pedido
  const reales = (D.pedidos || []).filter(p => !p.prueba), enCaminoP = reales.filter(p => !/entregado/i.test(p.estado || ""));
  const kindOf = p => /usps/i.test(p.courier || "") && !/ebay/i.test(p.tienda || "") ? "usps" : /ebay/i.test(p.tienda || "") ? "ebay" : /usps/i.test(p.courier || "") ? "usps" : "kraft";
  const PALZ = -11.6;
  [[13.6, PALZ], [15.0, PALZ]].forEach(([px, pz], pi) => {
    const pallet = new THREE.Group(); pallet.position.set(px, 0, pz); WZ.add(pallet);
    box(1.2, 0.14, 1.0, M(0x8a7a5e, { roughness: .9 }), 0, 0.07, 0, pallet);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) for (let d = 0; d < 2; d++) {
      const p = enCaminoP[pi * 12 + r * 4 + c * 2 + d]; if (!p) continue;
      parcel(kindOf(p), 0.52, 0.36, 0.44, -0.28 + c * 0.56, 0.33 + r * 0.38, -0.23 + d * 0.47, pallet);
    }
  });
  // zona marcada en el piso alrededor de los pallets
  [PALZ - 0.75, PALZ + 0.75].forEach(z => box(3.0, 0.01, 0.05, lineM, 14.3, 0.006, z, WZ).castShadow = false);
  [12.8, 15.8].forEach(x => box(0.05, 0.01, 1.5, lineM, x, 0.006, PALZ, WZ).castShadow = false);
  const pedSign = textPlane(2.4, 0.6, 1024, 256, (g, w, h) => { g.fillStyle = "#16181b"; g.fillRect(0, 0, w, h); g.fillStyle = "#E9EBEE"; g.font = `700 64px ${MONO}`; g.textAlign = "center";
    g.fillText("PAQUETES DE LOS PEDIDOS", w / 2, 104); g.fillStyle = "#9fe2b5"; g.font = `600 58px ${MONO}`;
    g.fillText(enCaminoP.length ? `${enCaminoP.length} en camino` : "sin pedidos en camino", w / 2, 196); }, { transparent: false });
  pedSign.position.set(14.3, 2.35, PALZ - 0.66); WZ.add(pedSign);
  [13.15, 15.45].forEach(x => box(0.04, 2.66, 0.04, blackSteel, x, 1.33, PALZ - 0.7, WZ));   // patas del cartel
  floorText("PAQUETERÍA", 18.6, ZB - 0.9, 3.4);
  pointL(17.5, 2.8, -13.5, 0.55, 11);

  // ---- 7. Señalética del resto de la nave ----
  floorText("LOUNGE", 19, -3.4, 3.6);
  floorText("GYM", 21, 11.7, 2.8);

  // ---- 8. Techo y acabados: bandejas de cables, más luz pareja y luces de las zonas nuevas ----
  function pointL(x, y, z, i, d) { const l = new THREE.PointLight(0xf4f7ff, i, d, 2); l.position.set(x, y, z); scene.add(l); return l; }
  // bandejas de cables pegadas a las vigas (no cruzan la vista desde arriba)
  [-6.5, 8.5].forEach(z => box(RW - 2, 0.06, 0.34, M(0x2b2f34, { metalness: .6, roughness: .4 }), XC, WH - 0.36, z + 0.26).castShadow = false);
  // la luz pareja del frente (antes 7 luces puntuales altas) la dan el hemisferio y una luz de relleno desde adelante
  const front = new THREE.DirectionalLight(0xf4f7ff, 0.12); front.position.set(XC, 14, 40); front.target.position.set(XC, 0, 14); scene.add(front, front.target);

  /* ---------- Pantallas: la captura del agente, atenuada si está en espera ---------- */
  function paintScreen(a, s, t) {
    if (s.mons.length > 1) {   // Gerente: sus dos pantallas de métricas, siempre visibles
      s.mons.forEach((m, k) => {
        const src = TEX[a.id + (k ? "2" : "")]; m.ctx.fillStyle = "#07111A"; m.ctx.fillRect(0, 0, 1024, 576);
        if (src && src.width) m.ctx.drawImage(src, 0, 0, 1024, 576);
        m.stex.needsUpdate = true;
      });
      return;
    }
    const g = s.ctx, W = 1024, H = 576, src = TEX[a.id];
    g.fillStyle = "#07111A"; g.fillRect(0, 0, W, H);
    if (src && (src.naturalWidth || src.width)) {
      const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height, r = Math.max(W / iw, H / ih);
      g.drawImage(src, 0, 0, iw * r, ih * r);
    }
    if (a.state === "sleep") {
      g.fillStyle = "rgba(4,10,16,.7)"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#9FB6C7"; g.font = "700 88px 'IBM Plex Mono', monospace"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("EN ESPERA", W / 2, H / 2);
    }
    s.stex.needsUpdate = true;
  }

  /* ---------- Etiquetas HTML sobre cada agente ---------- */
  const tags = {};
  [...AG, { id: "docs", name: "Documentos" }, { id: "jefe", name: "Santi" }, { id: "tablero", name: "Tablero" }].forEach(a => {
    const b = document.createElement("button"); b.type = "button"; b.className = "ag3d"; b.dataset.id = a.id;
    b.innerHTML = `<span class="dot"></span><span class="nm"></span><small></small>`;
    b.addEventListener("click", e => { e.stopPropagation(); focus3D(a.id); });
    layer.appendChild(b); tags[a.id] = b;
  });
  const headPos = new THREE.Vector3();
  // cambia texto y color de una etiqueta solo si son distintos (y entonces hay que volver a medirla)
  // punto de la etiqueta: rojo trabajando, ámbar esperando respuestas, verde sin trabajo ahora (descansa en el lounge o el gym)
  const DOT = { working: "#F07A7A", waiting: "#F2A541", done: "#5CD69A", sleep: "#5CD69A" };
  function setTag(b, nombre, color, extra) {
    if (b._c !== color) { b._c = color; b.style.setProperty("--c", color); }
    if (b._n !== nombre) { b._n = nombre; b.querySelector(".nm").textContent = nombre; b._w = 0; }
    if (b._x !== extra) { b._x = extra; b.querySelector("small").textContent = extra; b._w = 0; }
  }
  function placeTags(W, H) {
    const tmp = new THREE.Vector3();
    Object.keys(tags).forEach(id => {
      const s = ST[id], b = tags[id]; if (!s) { b.hidden = true; return; }
      const cab = PERS && PERS.cabeza(id);
      if (cab) tmp.copy(cab);
      else if (id === "docs") tmp.set(0, 2.75, 0.4).applyMatrix4(s.g.matrixWorld);
      else if (id === "tablero") tmp.set(0, 2.15, 0).applyMatrix4(s.g.matrixWorld);
      else if (id === "jefe") tmp.set(0, 2.55, 0.9).applyMatrix4(s.g.matrixWorld);
      else if (id === "gerente" && GER && GER.caminando()) tmp.set(0, 2.25, 0).applyMatrix4(GER.walker.matrixWorld);
      else tmp.set(0, 2.25, 0.9).applyMatrix4(s.g.matrixWorld);
      tmp.project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15;
      if (b.hidden !== !vis) b.hidden = !vis; if (!vis) return;
      const px = (tmp.x + 1) / 2 * W, py = (1 - tmp.y) / 2 * H;
      if (id === "jefe") {
        const tu = PERS && PERS.manejando;
        setTag(b, "Santi", tu ? "#F07A7A" : "#5CD69A", tu ? "jefe · lo manejas tú" : LIVE_ON ? "jefe · viendo la ronda en vivo" : "jefe · supervisando");
      } else if (id === "tablero") {
        const n = window.pendientesDe ? window.pendientesDe() : 0;
        setTag(b, "Tablero del equipo", n ? "#F2A541" : "#5CD69A", n ? `${n} por decidir · toca para abrir` : "nada pendiente");
      } else if (id === "docs") {
        const nArch = (window.ARCHIVO_CAJONES || []).reduce((t, c) => t + c.n, 0) || D.documentos.length;
        setTag(b, `Archivo · ${nArch} documentos`, "#C9A35A", open && sel === "docs" ? "toca otra vez para abrir" : "");
      } else {
        const a = AG.find(x => x.id === id), st = STATES[a.state];
        const nm = a.name, cc = DOT[a.state] || st.c, hace = PERS && PERS.que(id);
        const extra = id === "gerente" && GER && GER.texto() ? GER.texto() : a.liveText ? a.liveText : hace ? hace + (a.state === "done" ? " · ✓ trabajó hoy" : "") : a.state === "sleep" ? "zZ · en espera" : a.state === "done" ? "✓ trabajó hoy" : a.state === "waiting" ? "… esperando respuestas" : a.state === "working" ? "trabajando" : "";
        const pend = window.pendientesDe ? window.pendientesDe(id) : 0;
        setTag(b, nm, cc, extra + (pend ? ` · ${pend} por decidir` : ""));
      }
      const on = open && sel === id; if (b._on !== on) { b._on = on; b.classList.toggle("on", on); b._w = 0; }
      // En pantallas angostas la etiqueta no se sale por los costados ni por arriba: se corre hacia adentro
      if (!b._w) { b._w = b.offsetWidth; b._h = b.offsetHeight; }
      const m = 6, w = b._w, h = b._h;
      const x = w + 2 * m < W ? Math.min(Math.max(px, w / 2 + m), W - w / 2 - m) : W / 2;
      const y = Math.max(py, h + m);
      const tr = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
      if (b._tr !== tr) { b._tr = tr; b.style.transform = tr; }
    });
  }

  /* ---------- Cámara: acercarse a un agente y volver ---------- */
  let anim = null;
  function flyTo(pos, target, ms) {
    anim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, s: performance.now(), d: reduce ? 1 : (ms || 900) };
  }
  const narrow3 = () => matchMedia("(max-width:760px)").matches;
  function viewOffset() {
    const W = el.clientWidth, H = el.clientHeight, side = open && !narrow3() ? $("drawer").offsetWidth : 0;
    if (side) camera.setViewOffset(W + side, H, side, 0, W, H); else camera.clearViewOffset();
  }
  function focus3D(id) {
    if (PERS && PERS.manejando) PERS.salir();
    if (id === "tablero") { if (window.abrirTablero) window.abrirTablero(); return; }
    if (open && sel === id) { if (id === "docs" && window.abrirArchivo) { window.abrirArchivo(); return; } if (window.tienePantalla && window.tienePantalla(id)) { window.abrirPantalla(id); return; } if (id === "pedidos" && window.abrirMapa) { window.abrirMapa(); return; } if (id === "gerente" && window.abrirPanel) { window.abrirPanel(); return; } close3D(); return; }
    if (id === "docs" && sel !== "docs") cabSel = null;
    sel = id; open = true; $("drawer").hidden = false; drawDrawer(); $("dBody").scrollTop = 0; viewOffset();
    const s = ST[id]; if (!s) return;
    s.g.updateMatrixWorld();
    const tgt = id === "jefe" ? new THREE.Vector3(0, 1.45, -0.45).applyMatrix4(s.g.matrixWorld) : id === "docs" ? new THREE.Vector3(0, 1.2, 0.4).applyMatrix4(s.g.matrixWorld) : new THREE.Vector3(0, 1.45, -0.4).applyMatrix4(s.g.matrixWorld);
    const pos = id === "jefe" ? tgt.clone().add(new THREE.Vector3(2.4, 1.7, -3.6)) : id === "docs" ? tgt.clone().add(new THREE.Vector3(-1.2, 1.4, 5.6)) : tgt.clone().add(new THREE.Vector3(1.2, 0.9, 3.4));
    flyTo(pos, tgt);
    if (narrow3()) requestAnimationFrame(() => $("drawer").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" }));
  }
  function close3D() { open = false; $("drawer").hidden = true; viewOffset(); flyTo(HOME.pos.clone(), HOME.target.clone()); }
  // Panel del jefe: resumen del día
  const _drawDrawer = drawDrawer;
  drawDrawer = function () {
    if (sel !== "jefe") { _drawDrawer(); return; }
    $("dDot").style.background = "#F2A541"; $("dName").textContent = "Santi"; $("dWhere").textContent = "Jefe · supervisa a los agentes";
    $("dState").textContent = LIVE_ON ? "Ronda en vivo" : "Resumen del día"; $("dState").style.color = "#F2A541";
    const top = (typeof ranking !== "undefined" ? ranking : []).slice(0, 5);
    const esp = D.tiendas.filter(t => /esperando/.test(t.estado)).map(t => t.tienda);
    $("dBody").innerHTML = `<div><h4>Qué conviene traer</h4><ul>${top.map(r => `<li>${esc(r.p.name)}: ${r.c.gain >= 0 ? "+" : ""}Bs ${fmt(r.c.gain)} por unidad (${fmt(r.c.margin * 100)} %)</li>`).join("")}</ul></div>
      <div><h4>Agentes</h4><ul>${AG.map(a => `<li>${esc(a.name)}: ${esc(a.liveText || STATES[a.state].t)}</li>`).join("")}</ul></div>
      <div><h4>Tiendas esperando respuesta</h4><p style="margin:0">${esp.length ? esc(esp.join(" · ")) : "Ninguna."}</p></div>
      <div><h4>Pedidos</h4><p style="margin:0">${(D.pedidos || []).length ? (D.pedidos || []).map(p => esc(`${p.producto}: ${p.estado}`)).join(" · ") : "Sin pedidos cargados todavía."}</p></div>`;
  };
  // la página y el teclado usan estas funciones
  focusAgent = focus3D; closeAgent = close3D;
  $("dClose").onclick = close3D; $("zreset").onclick = close3D;
  $("zin").onclick = () => { camera.position.lerp(controls.target, 0.25); };
  $("zout").onclick = () => { const d = camera.position.clone().sub(controls.target).multiplyScalar(1.3); if (d.length() < 100) camera.position.copy(controls.target).add(d); };

  // clic en un agente o en el archivero directamente sobre el 3D
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let down = null;
  el.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener("pointerup", e => {
    if (PERS && PERS.manejando) { down = null; return; }
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
    down = null;
    const r = el.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(Object.values(ST).map(s => s.g), true)[0];
    if (hit) { let o = hit.object; const id = Object.keys(ST).find(k => { let x = o; while (x) { if (x === ST[k].g) return true; x = x.parent; } return false; }); if (id) { focus3D(id); return; } }
    if (open) close3D();
  });
  el.addEventListener("keydown", e => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const i = Math.max(0, AG.findIndex(a => a.id === sel)); const next = AG[(i + (sel == null ? 0 : (e.key === "ArrowRight" ? 1 : AG.length - 1))) % AG.length].id;
      open = false; focus3D(next);
    }
    if (e.key === "d" || e.key === "D") { open = false; focus3D("docs"); }
    if (e.key === "Escape") close3D();
  });


  /* ---------- Gerente animado: único personaje que camina ----------
     Cada tanto (y la primera vez a los pocos segundos de abrir la página) se levanta, pasa por los puestos de los
     agentes que tienen algo para él (pedidos en necesidades.csv o trabajo de hoy), recoge una hoja de cada uno,
     vuelve, deja las hojas a un costado del escritorio y en su segunda pantalla se ve Telegram mientras le escribe
     a Santi. Su primera pantalla y el botón "Abrir pantalla" no cambian. Los mensajes se arman con los datos públicos
     de la oficina: nunca muestran lo que escribió Santi. */
  const GER = (() => {
    const s = ST.gerente; if (!s) return null;
    const seated = s.torso.parent;                              // la persona sentada del puesto
    const shirtG = s.torso.material, legsM = M(0x2a3540), shoeM = M(0x16191c);
    const w = new THREE.Group(); w.visible = false; scene.add(w);
    const body = new THREE.Group(); w.add(body);
    const legs = [-1, 1].map(sx => {
      const hip = new THREE.Group(); hip.position.set(sx * 0.11, 0.86, 0); body.add(hip);
      cyl(0.075, 0.07, 0.8, legsM, 0, -0.4, 0, hip, 10); box(0.12, 0.07, 0.24, shoeM, 0, -0.82, -0.05, hip);
      return hip;
    });
    cyl(0.22, 0.25, 0.62, shirtG, 0, 1.18, 0, body, 16);
    const head = new THREE.Group(); head.position.set(0, 1.66, 0); body.add(head);
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 16), skin); hm.castShadow = true; head.add(hm);
    const hr = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
    hr.rotation.x = 0.35; hr.position.set(0, 0.03, 0.02); head.add(hr);
    const arms = [-1, 1].map(sx => {
      const sh = new THREE.Group(); sh.position.set(sx * 0.28, 1.44, 0); body.add(sh);
      cyl(0.055, 0.05, 0.58, shirtG, 0, -0.29, 0, sh, 8);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin); hand.position.set(0, -0.6, 0); sh.add(hand);
      return sh;
    });
    const paperM = M(0xf3f1ea, { roughness: .9 });
    const carry = new THREE.Group(); carry.position.set(0, 1.07, -0.47); body.add(carry);   // hojas en las manos
    const deskPile = new THREE.Group(); deskPile.position.set(-1.12, 0.69, 0.32); s.g.add(deskPile);  // hojas en el escritorio
    const sheet = (parent, k) => { const m = box(0.3, 0.012, 0.4, paperM, (k % 2) * 0.012, 0.008 + k * 0.014, 0, parent); m.rotation.y = (k % 3 - 1) * 0.08; m.castShadow = false; return m; };

    // puntos donde se para: delante del escritorio, al costado de la silla de cada agente (el Gerente sale de delante de
    // la suya); va por el costado derecho de los escritorios y por el pasillo de su fila
    const standAt = id => { const [x, z] = STATION[id], af = z + DESK.frente + 0.65 - RM0; return id === "gerente" ? { x, z: af } : { x: x + 1.0, z: af }; };
    const sideX = id => STATION[id][0] + 2.1;
    function route(from, to) {   // del puesto "from" al puesto "to" sin atravesar escritorios
      const a = standAt(from), b = standAt(to), ais = STATION[from][1] + 2.6;
      return [a, { x: sideX(from), z: a.z }, { x: sideX(from), z: ais }, { x: sideX(to), z: ais }, { x: sideX(to), z: b.z }, b];
    }

    let plan = [], fase = "sentado", t0 = 0, recogidas = 0, chat = null, proxima = 7;
    let hooks = null, ahora = 0;   // personas de Mixamo (PERS): se levanta y se sienta con animaciones y camina siguiendo al caminante
    const nombre = id => (AG.find(a => a.id === id) || {}).name || id;
    function encargos() {
      const pide = [...new Set((D.necesidades || []).map(n => n.agente).filter(id => STATION[id] && id !== "gerente"))];
      const hoy = AG.filter(a => a.id !== "gerente" && STATION[a.id] && (a.state === "done" || a.state === "working" || a.state === "waiting")).map(a => a.id);
      const ids = [...new Set([...pide, ...hoy])];
      return (ids.length ? ids : ["ana", "wa"]).slice(0, 3);
    }
    function mensajes() {
      const r = (typeof ranking !== "undefined" ? ranking : []).filter(x => x.c && x.c.margin >= 0.15).slice(0, 2);
      const nec = (D.necesidades || []).slice(0, 2), prop = (D.plan || []).filter(p => p.estado === "propuesto").length;
      const out = ["Hola Santi, te cuento cómo vamos."];
      if (r.length) out.push("Hoy conviene: " + r.map(x => `${x.p.name.replace(/\s*\(.*\)/, "")} (+${Math.round(x.c.margin * 100)} %)`).join(" y ") + ".");
      if (nec.length) out.push("El equipo necesita de ti: " + nec.map(n => `${nombre(n.agente)}, ${n.necesita}`).join("; ") + ".");
      if (prop) out.push(`Te dejé ${prop} tareas para aprobar. Responde: apruebo 1 3.`);
      out.push("Pasé por los puestos y ya tengo los informes del día en mi escritorio.");
      return out;
    }
    function empezar(now) {
      plan = []; let desde = "gerente";
      encargos().forEach(id => { plan.push(...route(desde, id).map(p => ({ ...p }))); plan.push({ pausa: 1.3, id }); desde = id; });
      plan.push(...route(desde, "gerente"));
      while (deskPile.children.length) deskPile.remove(deskPile.children[0]);
      while (carry.children.length) carry.remove(carry.children[0]);
      recogidas = 0; t0 = now;
      const a = standAt("gerente"); w.position.set(a.x, 0, a.z);
      if (hooks) { fase = "levantando"; hooks.levantar(() => { fase = "caminando"; }); }
      else { fase = "caminando"; w.visible = true; seated.visible = false; }
    }
    // pantalla de Telegram (segundo monitor del Gerente)
    function pintarChat(now) {
      const m = s.mons[1], g = m.ctx, W = 1024, H = 576, el = (now - chat.t0) / 1000;
      g.fillStyle = "#0e1621"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#17212b"; g.fillRect(0, 0, W, 74);
      g.fillStyle = "#4f8bc9"; g.beginPath(); g.arc(44, 37, 22, 0, 7); g.fill();
      g.fillStyle = "#fff"; g.font = "700 22px Archivo, sans-serif"; g.textAlign = "center"; g.fillText("S", 44, 45); g.textAlign = "left";
      g.font = "700 24px Archivo, sans-serif"; g.fillText("Santi", 80, 34);
      const n = Math.min(chat.msgs.length, Math.floor(el / 3.2) + 1), escribiendo = n < chat.msgs.length || el % 3.2 < 1.4 && n <= chat.msgs.length && el < chat.msgs.length * 3.2;
      g.fillStyle = "#6c8aa8"; g.font = "500 17px 'IBM Plex Mono', monospace"; g.fillText(escribiendo ? "Gerente está escribiendo…" : "en línea", 80, 60);
      let y = H - 24; g.font = "500 21px Archivo, sans-serif";
      const lineas = (t, mw) => { const ws = t.split(" "), L = []; let l = ""; ws.forEach(wd => { if (g.measureText(l + " " + wd).width > mw && l) { L.push(l); l = wd; } else l = l ? l + " " + wd : wd; }); L.push(l); return L; };
      const vis = chat.msgs.slice(0, n - (escribiendo && n > 1 ? 1 : 0)).reverse();
      for (const msg of vis) {
        const L = lineas(msg, 560), bh = L.length * 28 + 22;
        y -= bh; if (y < 84) break;
        g.fillStyle = "#2b5278"; g.beginPath(); g.roundRect ? g.roundRect(W - 640, y, 616, bh, 14) : g.rect(W - 640, y, 616, bh); g.fill();
        g.fillStyle = "#eef3f7"; L.forEach((l, k) => g.fillText(l, W - 624, y + 32 + k * 28));
        y -= 12;
      }
      if (escribiendo && y > 120) { g.fillStyle = "#182533"; g.beginPath(); g.arc(W - 70, y - 30, 26, 0, 7); g.fill(); for (let k = 0; k < 3; k++) { g.fillStyle = (Math.floor(el * 3) % 3) === k ? "#9fc3e6" : "#4d6a86"; g.beginPath(); g.arc(W - 86 + k * 16, y - 30, 5, 0, 7); g.fill(); } }
      m.stex.needsUpdate = true;
    }
    function texto() {
      return fase === "levantando" ? "se levanta a recoger informes" : fase === "sentando" ? "vuelve a su puesto con los informes" : fase === "caminando" ? (recogidas ? `llevando ${recogidas} ${recogidas > 1 ? "informes" : "informe"}` : "recogiendo informes")
        : fase === "chat" ? "escribiéndole a Santi por Telegram" : "";
    }
    const VEL = /[?&]rapido/.test(location.search) ? 8 : 1;   // solo para pruebas
    function update(now, dt) {
      ahora = now; dt *= VEL;
      const t = now / 1000;
      if (fase === "levantando" || fase === "sentando") return;
      if (fase === "sentado") {
        if (!reduce && t > proxima) empezar(now);
        else if (reduce && t > proxima) { fase = "chat"; chat = { t0: now, msgs: mensajes() }; }
        return;
      }
      if (fase === "caminando") {
        const p = plan[0];
        if (!p) {   // llegó a su silla: deja las hojas y se sienta
          while (carry.children.length) carry.remove(carry.children[0]);
          for (let k = 0; k < recogidas; k++) sheet(deskPile, k);
          if (hooks) { fase = "sentando"; hooks.sentar(() => { fase = "chat"; chat = { t0: ahora, msgs: mensajes() }; }); return; }
          w.visible = false; seated.visible = true; fase = "chat"; chat = { t0: now, msgs: mensajes() }; return;
        }
        if (p.pausa != null) {   // en el puesto de un agente: estira el brazo y recoge una hoja
          p.t = (p.t || 0) + dt; const k = Math.min(1, p.t / p.pausa);
          arms[1].rotation.x = Math.sin(k * Math.PI) * 1.1; arms[1].rotation.z = 0; legs.forEach(l => l.rotation.x = 0);   // estira el brazo hacia adelante
          const [ax, az] = STATION[p.id]; w.rotation.y = Math.atan2(ax - w.position.x, az + 0.92 - w.position.z) + Math.PI;
          if (hooks) hooks.seguir(w, { rot: Math.atan2(ax - w.position.x, az + 0.6 - w.position.z) });
          if (p.t >= p.pausa) { sheet(carry, recogidas++); plan.shift(); }
          return;
        }
        const dx = p.x - w.position.x, dz = p.z - w.position.z, d = Math.hypot(dx, dz), v = 1.35 * dt;
        if (d <= v) { w.position.set(p.x, 0, p.z); plan.shift(); if (hooks) hooks.seguir(w); return; }
        w.position.x += dx / d * v; w.position.z += dz / d * v;
        w.rotation.y = Math.atan2(dx, dz) + Math.PI;
        if (hooks) { hooks.seguir(w); return; }
        const ph = t * 7.5;
        legs[0].rotation.x = Math.sin(ph) * 0.5; legs[1].rotation.x = -Math.sin(ph) * 0.5;
        // con hojas: los dos brazos hacia adelante y hacia el centro, sosteniéndolas frente al cuerpo
        arms.forEach((arm, i) => {
          arm.rotation.x = recogidas ? 0.95 : (i ? 1 : -1) * Math.sin(ph) * 0.4;
          arm.rotation.z = recogidas ? (i ? -0.32 : 0.32) : 0;
        });
        body.position.y = Math.abs(Math.sin(ph)) * 0.04;
        return;
      }
      if (fase === "chat") {
        pintarChat(now);
        s.arms.forEach((arm, i) => { arm.rotation.x = Math.sin(t * 14 + i * 2.4) * 0.12; });
        if ((now - chat.t0) / 1000 > chat.msgs.length * 3.2 + 8) { fase = "sentado"; proxima = t + 180; s.src2 = null; }   // vuelve a las métricas
      }
    }
    // con las personas de Mixamo, las simples (sentada y caminante) no se ven más
    const usar = h => { hooks = h; w.visible = false; seated.visible = false; };
    return { update, texto, usar, escribiendo: () => fase === "chat", activo: () => fase !== "sentado", caminando: () => fase === "caminando", walker: w };
  })();

  /* ---------- Personas de Mixamo (27/10) ----------
     Los modelos y las animaciones están en personas/*.json: se publican solo en el artifact (no van al repo, que es
     público). Mientras cargan, o si no cargan, se ven las personas simples de antes.
     Cada agente trabaja sentado en su puesto (teclea si está trabajando, espera sentado si espera respuestas) y cuando no
     trabaja se va al lounge o al gym; al cambiar de estado se levanta, camina por los pasillos y se sienta. El Gerente
     hace su recorrida de siempre (ver GER) con estas personas. "Manejar a Santi" lo deja caminar con el teclado, con choques. */
  const PERS = (() => {
    if (!THREE.GLTFLoader || !THREE.SkeletonUtils) return null;
    const api = { listo: false, manejando: false, cabeza: () => null, que: () => "", update() {}, moviendo: () => false };
    const loader = new THREE.GLTFLoader(), cargar = url => new Promise((ok, mal) => loader.load(url, ok, undefined, mal));
    const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
    function hueso(obj, nombre) { let b = null; obj.traverse(c => { if (!b && c.isBone && c.name.endsWith(nombre)) b = c; }); return b; }
    function preparar(obj) {
      obj.scale.setScalar(0.01);   // Mixamo trabaja en centímetros
      obj.traverse(c => { if (c.isMesh) { if (!c.geometry.attributes.normal) c.geometry.computeVertexNormals(); c.castShadow = !LIVIANO; c.receiveShadow = true; c.frustumCulled = false; c.userData.persona = true;
        [].concat(c.material).forEach(m => { m.envMapIntensity = 0.6; if (m.map) m.map.anisotropy = ANISO; }); } });
      return obj;
    }
    // modelo de cada uno (p1..p6): 0 hombre de traje, 1 y 2 hombres, 3, 4 y 5 mujeres; los repetidos son copias
    const MODELO = { gerente: 0, santi: 1, mkt: 1, ana: 2, ebay: 2, fin: 3, dem: 3, wa: 4, pedidos: 5, nube: 5 };
    const FEM = new Set([3, 4, 5]);
    // lugares para cuando no trabajan: pts = camino desde el pasillo; x, z = donde quedan parados; rot = hacia dónde miran
    const LUGAR = {
      sofa1:  { zona: "lounge", pts: [[11.45, FRENTE_Z], [11.45, -6.97]], x: 11.6, z: -6.97, rot: 0, anim: "cafe", sentado: true, que: "toma un café en el lounge", prop: "taza" },
      sofa2:  { zona: "lounge", pts: [[13.4, FRENTE_Z], [13.4, -6.97]], x: 13.4, z: -6.97, rot: 0, anim: "sentado", sentado: true, que: "descansa en el lounge" },
      sillon: { zona: "lounge", pts: [[11.45, FRENTE_Z], [11.45, -6.2]], x: 10.906, z: -6.097, rot: 2.342, anim: "sentado", sentado: true, que: "descansa en el lounge" },
      barra1: { zona: "lounge", pts: [[22.7, FRENTE_Z], [22.7, -8.3]], x: 22.7, z: -8.3, rot: Math.PI, anim: "quieto", que: "en la barra de café" },
      barra2: { zona: "lounge", pts: [[23.7, FRENTE_Z], [23.7, -8.3]], x: 23.7, z: -8.3, rot: Math.PI, anim: "hablar2", que: "conversa en la barra" },
      cinta:  { zona: "gym", pts: [[22.4, 12.6], [22.4, 10.9]], x: 22.4, z: 9.6, rot: Math.PI, y: 0.23, anim: "cinta", que: "corre en la cinta" },
      pesas:  { zona: "gym", pts: [[20.7, 12.6]], x: 20.7, z: 8.4, rot: 0, anim: "pesas", que: "levanta pesas en el gym", prop: "pesas" },
      charla: { zona: "gym", pts: [[18.2, 12.6]], x: 18.2, z: 10.4, rot: 0.5, anim: "hablar", que: "conversa en el gym" },
    };
    const LUGAR_DE = { pedidos: "sofa1", wa: "sofa2", ana: "sillon", ebay: "barra1", dem: "barra2", fin: "cinta", mkt: "pesas", nube: "charla" };
    const ENTRADA = { lounge: [PASILLO_X, FRENTE_Z], gym: [PASILLO_X, 12.6] };
    let P = {}, clips, TRANS, RETRO, porPref = {};

    (async () => {
      let gl;
      try {
        const lista = LIVIANO ? ["animaciones", "p1", "p5"] : ["animaciones", "p1", "p2", "p3", "p4", "p5", "p6"];
        const [anims, ...ps] = await Promise.all(lista.map(n => cargar(`personas/${n}.json`)));
        gl = { ps: ps.map(p => p.scene) }; clips = Object.fromEntries(anims.animations.map(c => [c.name, c]));
      } catch (e) { return; }   // sin modelos: quedan las personas simples
      // transiciones (sentarse, pararse...): la cadera se desplaza de verdad, así que no se centran ni se recortan.
      // "ini": la animación arranca en el lugar de la persona; "fin": termina en él
      TRANS = { sentarse: "ini", pararse: "fin", a_teclear: "medio", de_teclear: "medio" };
      // cuánto se va hacia atrás la cadera al sentarse (cm): las animaciones sentadas se corren eso para que la persona
      // no cambie de lugar entre estar de pie y sentada
      RETRO = (() => { const t = clips.sentarse && clips.sentarse.tracks.find(t => /Hips\.position$/.test(t.name)); if (!t) return [0, 0];
        const v = t.values, L = v.length; return [v[L - 3] - v[0], v[L - 1] - v[2]]; })();
      const usados = new Set();
      ["gerente", "santi", ...AG.map(a => a.id).filter(id => id !== "gerente" && STATION[id])].forEach(id => {
        let i = MODELO[id] != null ? MODELO[id] : 1, clon = usados.has(i);
        if (LIVIANO) { i = FEM.has(i) ? 1 : 0; clon = usados.has(i); }
        usados.add(i);
        P[id] = persona(gl.ps[i], clon);
      });
      // utilería: taza en la mano derecha y mancuernas (en centímetros: la mano está en la escala de Mixamo)
      const taza = new THREE.Group(); cyl(4, 3.5, 9, M(0xf4f6f8), 0, 0, 0, taza, 12); taza.position.set(0, 8, 4);
      if (P.pedidos && P.pedidos.manoD) { P.pedidos.manoD.add(taza); P.pedidos.props.taza = [taza]; }
      const pesa = () => { const g = new THREE.Group(); cyl(1.2, 1.2, 22, cromo, 0, 0, 0, g, 6).rotation.z = Math.PI / 2; [-9, 9].forEach(x => cyl(4, 4, 5, negroM, x, 0, 0, g, 10).rotation.z = Math.PI / 2); g.position.set(0, 9, 2); return g; };
      if (P.mkt) { P.mkt.props.pesas = [P.mkt.manoD, P.mkt.manoI].filter(Boolean).map(h => { const d = pesa(); h.add(d); return d; }); }
      Object.values(P).forEach(p => Object.values(p.props).forEach(l => l.forEach(o => { o.visible = false; })));
      // ubicación inicial, sin caminar
      AG.forEach(a => { const p = P[a.id]; if (!p) return; const d = destino(a); if (d === "puesto") enPuesto(p, a.id, animPuesto(a)); else enLugar(p, LUGAR[LUGAR_DE[a.id]]); p.donde = d; });
      if (P.gerente) P.gerente.sentadoG = true;
      sentarSanti();
      AG.forEach(a => { if (ST[a.id] && ST[a.id].simple) ST[a.id].simple.visible = false; });
      bossP.visible = false;
      if (GER) GER.usar(hooksGer);
      api.listo = true;
      renderer.shadowMap.needsUpdate = true;
    })();

    function clipPara(nom, pref) {
      const key = nom + "|" + pref; if (porPref[key]) return porPref[key];
      const c = clips[nom].clone(), tipo = TRANS[nom] || "medio";
      c.tracks.forEach(t => { t.name = t.name.replace(/^mixamorig\d*/, pref); });
      const hp = c.tracks.find(t => /Hips\.position$/.test(t.name));
      if (hp) {
        hp.values = hp.values.slice();
        const v = hp.values, n = v.length / 3, m = 3 * (n >> 1);
        // algunas animaciones traen un primer cuadro de pie: se reemplaza por el segundo en todas las pistas
        if (!TRANS[nom] && n > 2 && Math.abs(v[1] - v[m + 1]) > 20) c.tracks.forEach(t => { const k = t.getValueSize(); for (let q = 0; q < k; q++) t.values[q] = t.values[k + q]; });
        // la cadera queda centrada en el lugar de la persona (la del café venía corrida 2,7 m)
        const r = tipo === "ini" ? 0 : tipo === "fin" ? v.length - 3 : m;
        const x0 = v[r], z0 = v[r + 2];
        for (let q = 0; q < v.length; q += 3) { v[q] -= x0; v[q + 2] -= z0; }
      }
      return (porPref[key] = c);
    }
    // Mixamo nombra los huesos con un prefijo distinto en cada descarga: cada animación se adapta a la persona que la usa
    function persona(base, clon) {
      const o = preparar(clon ? THREE.SkeletonUtils.clone(base) : base);
      // "lugar" se ubica en la nave; adentro, el modelo se gira para que el cuerpo mire hacia adelante del lugar
      const lugar = new THREE.Group(); scene.add(lugar); lugar.add(o);
      const mixer = new THREE.AnimationMixer(o), acts = {};
      const hips = hueso(o, "Hips"), pref = hips ? hips.name.replace(/Hips$/, "") : "mixamorig";
      const piernaI = hueso(o, "LeftUpLeg"), piernaD = hueso(o, "RightUpLeg");
      const p = { root: lugar, model: o, mixer, acts, actual: null, head: hueso(o, "Head"), manoD: hueso(o, "RightHand"), manoI: hueso(o, "LeftHand"), props: {}, cola: [], paso: null, t: 0, que: "" };
      const up = new THREE.Vector3(0, 1, 0), a1 = new THREE.Vector3(), a2 = new THREE.Vector3(), inv = new THREE.Matrix4();
      // mira hacia dónde apunta el cuerpo (de la cadera izquierda a la derecha, girado 90°) en 30 momentos de la animación;
      // se queda con el tramo más largo en que mira siempre para el mismo lado y gira el modelo para que ese tramo mire adelante
      function preparar2(clip) {
        if (!piernaI || !piernaD) return { clip, giro: 0 };
        const mx = new THREE.AnimationMixer(o), ac = mx.clipAction(clip); ac.play();
        o.rotation.y = 0; const N = 30, ys = [];
        for (let k = 0; k < N; k++) {
          ac.time = clip.duration * (k + 0.5) / N; mx.update(0); lugar.updateMatrixWorld(true); inv.copy(lugar.matrixWorld).invert();
          piernaI.getWorldPosition(a1).applyMatrix4(inv); piernaD.getWorldPosition(a2).applyMatrix4(inv);
          const f = new THREE.Vector3().crossVectors(up, a2.sub(a1)); ys.push(Math.atan2(f.x, f.z));
        }
        ac.stop(); mx.uncacheRoot(o);
        const dif = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
        let best = [0, 0];
        for (let i = 0; i < N; i++) { let j = i; while (j + 1 < N && dif(ys[j + 1], ys[i]) < 0.6) j++; if (j - i > best[1] - best[0]) best = [i, j]; }
        // en las transiciones el cuerpo se tuerce a la mitad (al sentarse gira ~12°): se mide solo al empezar y al terminar
        const tramo = TRANS[clip.name] ? [ys[0], ys[N - 1]] : ys.slice(best[0], best[1] + 1), giro = -Math.atan2(tramo.reduce((t, y) => t + Math.sin(y), 0), tramo.reduce((t, y) => t + Math.cos(y), 0));
        let c2 = clip;
        if (best[1] - best[0] < N - 1 && !TRANS[clip.name]) {
          const fps = 30, t0 = clip.duration * best[0] / N, t1 = clip.duration * (best[1] + 1) / N;
          c2 = THREE.AnimationUtils.subclip(clip, clip.name, Math.floor(t0 * fps), Math.ceil(t1 * fps), fps);
        }
        return { clip: c2, giro };
      }
      const prep = {};
      // versión "corrida": la cadera va hacia atrás lo mismo que al sentarse, para quedar sentada sin cambiar de lugar.
      // El corrimiento se aplica en la dirección en que mira el cuerpo en esa animación (la del café, por ejemplo, viene
      // girada casi media vuelta: sin esto la persona quedaba sentada medio metro delante del sofá)
      function corrida(n) {
        const base = prep[n] || (prep[n] = preparar2(clipPara(n, pref)));
        const s0 = prep.sentarse || (prep.sentarse = preparar2(clipPara("sentarse", pref)));
        const th = s0.giro - base.giro, co = Math.cos(th), si = Math.sin(th);
        const ox = RETRO[0] * co + RETRO[1] * si, oz = -RETRO[0] * si + RETRO[1] * co;
        const clip = base.clip.clone(), hp = clip.tracks.find(t => /Hips\.position$/.test(t.name));
        if (hp) { hp.values = hp.values.slice(); for (let q = 0; q < hp.values.length; q += 3) { hp.values[q] += ox; hp.values[q + 2] += oz; } }
        return { clip, giro: base.giro };
      }
      p.play = (n, fade, corre) => {
        const key = corre ? n + "*" : n;
        if (p.actual === key) return;
        const pr = prep[key] || (prep[key] = corre ? corrida(n) : preparar2(clipPara(n, pref)));
        o.rotation.y = pr.giro;
        const a = acts[key] || (acts[key] = mixer.clipAction(pr.clip));
        if (TRANS[n]) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        a.reset().setEffectiveWeight(1).fadeIn(fade == null ? 0.35 : fade).play();
        if (p.actual && acts[p.actual]) acts[p.actual].fadeOut(fade == null ? 0.35 : fade);
        p.actual = key;
      };
      p.dur = () => acts[p.actual].getClip().duration;
      // cada uno arranca en un momento distinto de su animación, así no se mueven todos igual
      p.azar = () => { const a = acts[p.actual]; if (a) a.time = Math.random() * a.getClip().duration; };
      return p;
    }

    /* puesto: la persona queda parada en "afuera" (frente al escritorio, con la silla corrida) o sentada y arrimada ("adentro") */
    const pie = id => { const [x, z] = STATION[id]; return { x, adentro: z + DESK.frente + 0.15 - RM0, afuera: z + DESK.frente + 0.65 - RM0 }; };
    const destino = a => a.id === "gerente" || a.state === "working" || a.state === "waiting" ? "puesto" : "lugar";
    const animPuesto = a => a.state === "working" ? "teclear" : "sentado";
    function arrimar(p, id, k) {
      const s = k * k * (3 - 2 * k), q = pie(id);
      p.root.position.z = q.afuera + (q.adentro - q.afuera) * s;
      ST[id].silla.position.z = DESK.sillaFuera + (DESK.sillaDentro - DESK.sillaFuera) * s;
    }
    function enPuesto(p, id, anim) {
      const q = pie(id); p.root.position.set(q.x, 0, q.adentro); p.root.rotation.y = Math.PI; p.cola = []; p.paso = null;
      ST[id].silla.position.z = DESK.sillaDentro; p.play(anim, 0, true); p.azar(); mostrar(p, null);
    }
    function enLugar(p, L) {
      p.root.position.set(L.x, L.y || 0, L.z); p.root.rotation.y = L.rot; p.cola = []; p.paso = null;
      p.play(L.anim, 0, !!L.sentado); p.azar(); mostrar(p, L.prop);
    }
    function mostrar(p, prop) { Object.entries(p.props).forEach(([k, l]) => l.forEach(o => { o.visible = k === prop; })); }

    // pasos de una secuencia: anim (espera a que termine la animación o unos segundos, arrimando la silla si hace falta),
    // ir (camina en línea recta), girar, y fn (cualquier otra cosa)
    const caminarA = pts => pts.map(([x, z]) => ({ a: "ir", x, z }));
    function seqLevantarse(id) {
      return [{ a: "anim", n: "de_teclear", corre: true, fade: 0.3, hasta: "fin", arrimar: [id, 1, 0] },
        { a: "anim", n: "pararse", fade: 0.25, hasta: "fin" }];
    }
    function seqSentarse(id, anim) {
      return [{ a: "girar", rot: Math.PI }, { a: "anim", n: "sentarse", fade: 0.3, hasta: "fin" },
        { a: "anim", n: "a_teclear", corre: true, fade: 0.2, hasta: "fin", arrimar: [id, 0, 1] },
        { a: "anim", n: anim, corre: true, fade: 0.3, hasta: 0 }];
    }
    // del puesto al pasillo: por delante del escritorio hacia la derecha, al pasillo de la fila y al pasillo central
    function caminoPuesto(id) { const [x, z] = STATION[id], q = pie(id); return [[x, q.afuera], [x + 2.1, q.afuera], [x + 2.1, z + 2.6], [PASILLO_X, z + 2.6]]; }
    function irAlLugar(p, a) {
      const L = LUGAR[LUGAR_DE[a.id]], e = ENTRADA[L.zona];
      const seq = [...seqLevantarse(a.id), ...caminarA(caminoPuesto(a.id).slice(1)), ...caminarA([e]), ...caminarA(L.pts), ...caminarA([[L.x, L.z]]), { a: "girar", rot: L.rot }];
      if (L.y) seq.push({ a: "fn", f: () => { p.root.position.y = L.y; } });
      if (L.sentado) seq.push({ a: "anim", n: "sentarse", fade: 0.3, hasta: "fin" }, { a: "anim", n: L.anim, corre: true, fade: 0.3, hasta: 0 });
      else seq.push({ a: "anim", n: L.anim, fade: 0.4, hasta: 0 });
      seq.push({ a: "fn", f: () => { mostrar(p, L.prop); p.donde = "lugar"; } });
      p.cola = seq; p.donde = "yendo";
    }
    function volverAlPuesto(p, a) {
      const L = LUGAR[LUGAR_DE[a.id]], e = ENTRADA[L.zona], seq = [{ a: "fn", f: () => mostrar(p, null) }];
      if (L.sentado) seq.push({ a: "anim", n: "pararse", fade: 0.25, hasta: "fin" });
      if (L.y) seq.push({ a: "fn", f: () => { p.root.position.y = 0; } });
      seq.push(...caminarA([...L.pts].reverse()), ...caminarA([e]), ...caminarA(caminoPuesto(a.id).reverse()), ...seqSentarse(a.id, animPuesto(a)),
        { a: "fn", f: () => { p.donde = "puesto"; } });
      p.cola = seq; p.donde = "yendo";
    }
    function paso(p, dt, id) {
      if (!p.paso) { if (!p.cola.length) return; p.paso = p.cola.shift(); p.t = 0; empezar(p, p.paso); }
      const s = p.paso; p.t += dt;
      if (s.a === "ir") {
        const dx = s.x - p.root.position.x, dz = s.z - p.root.position.z, d = Math.hypot(dx, dz), v = 1.3 * dt;
        if (d <= v) { p.root.position.x = s.x; p.root.position.z = s.z; p.paso = null; return; }
        p.root.position.x += dx / d * v; p.root.position.z += dz / d * v;
        let dr = Math.atan2(dx, dz) - p.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); p.root.rotation.y += dr * Math.min(1, dt * 8);
      } else if (s.a === "girar") {
        let dr = s.rot - p.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); p.root.rotation.y += dr * Math.min(1, dt * 9);
        if (p.t > 0.6) { p.root.rotation.y = s.rot; p.paso = null; }
      } else if (s.a === "anim") {
        const fin = s.hasta === "fin" ? p.dur() - 0.2 : s.hasta;
        if (s.arrimar) arrimar(p, s.arrimar[0], s.arrimar[1] + (s.arrimar[2] - s.arrimar[1]) * Math.min(1, p.t / Math.max(0.1, p.dur())));
        if (p.t >= fin) { if (s.arrimar) arrimar(p, s.arrimar[0], s.arrimar[2]); p.paso = null; }
      } else p.paso = null;
    }
    function empezar(p, s) {
      if (s.a === "ir" && p.actual !== "caminar") p.play("caminar", 0.35);
      else if (s.a === "girar" && p.actual !== "quieto" && p.actual !== "caminar") p.play("quieto", 0.3);
      else if (s.a === "anim") p.play(s.n, s.fade, s.corre);
      else if (s.a === "fn") s.f();
    }

    /* Gerente: GER decide la recorrida; acá se levanta, camina con las personas de Mixamo y se vuelve a sentar */
    const hooksGer = {
      levantar(listo) { const p = P.gerente; p.sentadoG = false; p.cola = [...seqLevantarse("gerente"), { a: "fn", f: listo }]; p.ger = "levantando"; },
      sentar(listo) { const p = P.gerente, a = AG.find(x => x.id === "gerente"); p.cola = [...seqSentarse("gerente", animPuesto(a)), { a: "fn", f: () => { p.sentadoG = true; listo(); } }]; p.ger = "sentando"; },
      seguir(w, pausa) {   // mientras camina sigue al caminante invisible de GER
        const p = P.gerente; if (p.cola.length || p.paso) return;
        const dx = w.position.x - p.root.position.x, dz = w.position.z - p.root.position.z, d = Math.hypot(dx, dz);
        p.root.position.x = w.position.x; p.root.position.z = w.position.z;
        if (pausa) { p.play("hablar", 0.3); let dr = pausa.rot - p.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); p.root.rotation.y += dr * 0.2; }
        else if (d > 0.0005) { p.play("caminar", 0.3); p.root.rotation.y = Math.atan2(dx, dz); }
      },
    };

    /* Santi: sentado en su escritorio; con "Manejar a Santi" camina con el teclado */
    const SILLA_SANTI = { x: SANTI.x, z: SANTI.z - 0.9 };
    function sentarSanti() { const p = P.santi; if (!p) return; p.root.position.set(SILLA_SANTI.x, 0, SILLA_SANTI.z); p.root.rotation.y = 0; p.play("teclear", 0, false); p.azar(); }

    // botones de la oficina: manejar a Santi y modo liviano
    const zoomBar = stage.querySelector(".zoom");
    const bManejar = document.createElement("button"); bManejar.type = "button"; bManejar.textContent = "Manejar a Santi"; bManejar.setAttribute("aria-pressed", "false");
    const bLiv = document.createElement("button"); bLiv.type = "button"; bLiv.textContent = "Modo liviano"; bLiv.setAttribute("aria-pressed", String(LIVIANO));
    bLiv.title = "Menos detalle y 2 personas en vez de 6: para celulares y computadoras lentas";
    if (zoomBar) { zoomBar.appendChild(bManejar); zoomBar.appendChild(bLiv); }
    bLiv.onclick = () => { try { localStorage.setItem("cb-modo", LIVIANO ? "completo" : "liviano"); } catch (e) { } location.reload(); };
    const ayuda = document.createElement("div"); ayuda.className = "hint manejo"; ayuda.hidden = true;
    ayuda.textContent = COARSE ? "Flechas para caminar · arrastra para girar la cámara · «Manejar a Santi» otra vez para salir"
      : "W A S D o flechas para caminar · Shift corre · clic derecho y arrastrar gira la cámara · rueda acerca · Esc para salir";
    stage.appendChild(ayuda);
    const pad = document.createElement("div"); pad.className = "pad3d"; pad.hidden = true;
    pad.innerHTML = '<span></span><button type="button" data-k="w" aria-label="Adelante">↑</button><span></span><button type="button" data-k="a" aria-label="Izquierda">←</button><button type="button" data-k="s" aria-label="Atrás">↓</button><button type="button" data-k="d" aria-label="Derecha">→</button>';
    stage.appendChild(pad);
    const teclas = {};
    pad.querySelectorAll("[data-k]").forEach(b => { const k = b.dataset.k, on = v => e => { e.preventDefault(); teclas[k] = v; };
      b.addEventListener("pointerdown", on(true)); b.addEventListener("pointerup", on(false)); b.addEventListener("pointerleave", on(false)); });
    el.addEventListener("keydown", e => { if (!api.manejando) return; const k = e.key.toLowerCase(); teclas[k] = true;
      if (k === "escape") { manejar(false); return; }
      if (/^(arrow|w$|a$|s$|d$| )/.test(k)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    el.addEventListener("keyup", e => { teclas[e.key.toLowerCase()] = false; });
    el.addEventListener("blur", () => { Object.keys(teclas).forEach(k => { teclas[k] = false; }); });
    // cámara detrás de Santi: clic derecho (o un dedo) y arrastrar la gira; la rueda acerca y aleja
    const orb = { giro: 0, alto: 0.53, dist: 5.4, arr: null };
    el.addEventListener("contextmenu", e => { if (api.manejando) e.preventDefault(); });
    el.addEventListener("pointerdown", e => { if (!api.manejando || !(e.button === 2 || e.pointerType === "touch")) return; orb.arr = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { el.setPointerCapture(e.pointerId); } catch (_) { } });
    el.addEventListener("pointermove", e => { const a = orb.arr; if (!a || a.id !== e.pointerId) return; orb.giro -= (e.clientX - a.x) * 0.006; orb.alto = Math.min(1.25, Math.max(0.08, orb.alto + (e.clientY - a.y) * 0.004)); a.x = e.clientX; a.y = e.clientY; });
    const soltar = e => { if (orb.arr && orb.arr.id === e.pointerId) orb.arr = null; };
    el.addEventListener("pointerup", soltar); el.addEventListener("pointercancel", soltar);
    el.addEventListener("wheel", e => { if (!api.manejando) return; e.preventDefault(); orb.dist = Math.min(14, Math.max(2.5, orb.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });

    // choques: cada mueble aporta su caja vista desde arriba; se ignora lo plano del piso y lo que está arriba de la cabeza.
    // Las sillas de los puestos se miden en cada momento porque se mueven
    let solidos = null; const caja = new THREE.Box3(), sillasMov = new Set();
    function armarSolidos() {
      solidos = []; sillasMov.clear(); Object.values(ST).forEach(s => { if (s.silla) s.silla.traverse(o => sillasMov.add(o)); });
      scene.updateMatrixWorld(true);
      scene.traverse(o => { if (!o.isMesh || o.userData.persona || sillasMov.has(o) || !o.visible) return; let v = o, vis = true; while (v) { if (!v.visible) vis = false; v = v.parent; } if (!vis) return;
        caja.setFromObject(o); if (caja.max.y - caja.min.y < 0.05 || caja.min.y > 1.9 || caja.isEmpty()) return;
        solidos.push([caja.min.x, caja.max.x, caja.min.z, caja.max.z]); });
    }
    function choca(x, z, otros, sillas) {
      const r = 0.25, dentro = b => x > b[0] - r && x < b[1] + r && z > b[2] - r && z < b[3] + r;
      const enNave = x > XL + r && x < XR - r && z > ZB + r && z < ZF - r, enCobertizo = x > PQ.x0 + r && x < PQ.x1 - r && z > PQ.z0 + r && z < ZB + 0.3;
      if (!enNave && !enCobertizo) return true;
      return solidos.some(dentro) || sillas.some(dentro) || otros.some(([px, pz]) => Math.hypot(x - px, z - pz) < 0.55);
    }
    function manejar(on) {
      const p = P.santi; if (!p) return;
      api.manejando = on; bManejar.setAttribute("aria-pressed", String(on)); ayuda.hidden = !on; pad.hidden = !(on && COARSE); $("hint").hidden = on;
      controls.enabled = !on; anim = null;
      if (on) {
        if (open) close3D();
        if (!solidos) armarSolidos();
        p.root.position.set(SANTI.x + 2.8, 0, SANTI.z - 1.2); p.root.rotation.y = Math.PI / 2; p.play("quieto", 0.3);
        orb.giro = p.root.rotation.y + Math.PI; el.focus();
      } else { sentarSanti(); flyTo(HOME.pos.clone(), HOME.target.clone()); }
    }
    bManejar.onclick = () => { if (!api.listo) { bManejar.textContent = "Cargando a Santi…"; const t = setInterval(() => { if (api.listo) { clearInterval(t); bManejar.textContent = "Manejar a Santi"; manejar(true); } }, 300); return; } manejar(!api.manejando); };
    function moverSanti(dt) {
      const p = P.santi, k = teclas;
      const fx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0), fz = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0);
      const corre = k.shift, sp = (corre ? 3.4 : 1.45) * dt;
      if (fx || fz) {
        camera.getWorldDirection(tmpV); tmpV.y = 0; tmpV.normalize(); tmpV2.set(-tmpV.z, 0, tmpV.x);
        const mx = tmpV2.x * fx - tmpV.x * fz, mz = tmpV2.z * fx - tmpV.z * fz, n = Math.hypot(mx, mz) || 1;
        const otros = Object.entries(P).filter(([id]) => id !== "santi").map(([, q]) => [q.root.position.x, q.root.position.z]);
        const sillas = Object.values(ST).filter(s => s.silla).map(s => { caja.setFromObject(s.silla); return [caja.min.x, caja.max.x, caja.min.z, caja.max.z]; });
        const pos = p.root.position, nx = pos.x + mx / n * sp, nz = pos.z + mz / n * sp;
        // cada eje por separado: si choca de frente, se desliza a lo largo de la pared o del escritorio
        if (!choca(nx, pos.z, otros, sillas)) pos.x = nx;
        if (!choca(pos.x, nz, otros, sillas)) pos.z = nz;
        let dr = Math.atan2(mx, mz) - p.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); p.root.rotation.y += dr * Math.min(1, dt * 12);
        p.play(corre ? "correr" : "caminar", 0.25);
      } else p.play("quieto", 0.3);
      // cámara detrás, siguiéndolo
      const pos = p.root.position;
      tmpV.set(Math.sin(orb.giro) * Math.cos(orb.alto), Math.sin(orb.alto), Math.cos(orb.giro) * Math.cos(orb.alto)).multiplyScalar(orb.dist).add(pos);
      camera.position.lerp(tmpV, 1 - Math.exp(-dt * (orb.arr ? 14 : 5)));
      controls.target.lerp(tmpV2.set(pos.x, 1.2, pos.z), 1 - Math.exp(-dt * 7)); camera.lookAt(controls.target);
    }

    api.update = (now, dt) => {
      if (!api.listo) return;
      AG.forEach(a => {
        const p = P[a.id]; if (!p || a.id === "gerente") return;
        if (!p.cola.length && !p.paso) {
          const d = destino(a);
          if (d !== p.donde) { if (d === "lugar") irAlLugar(p, a); else volverAlPuesto(p, a); }
          else if (d === "puesto") p.play(animPuesto(a), 0.5, true);
        }
        paso(p, dt, a.id);
        p.que = p.donde === "yendo" ? (destino(a) === "puesto" ? "vuelve a su puesto" : "va al " + LUGAR[LUGAR_DE[a.id]].zona)
          : p.donde === "lugar" ? LUGAR[LUGAR_DE[a.id]].que : a.state === "working" ? "trabaja en su puesto" : "espera respuestas en su puesto";
      });
      if (P.gerente) {
        const g = P.gerente, a = AG.find(x => x.id === "gerente");
        if (g.sentadoG && !g.cola.length && !g.paso) g.play(GER && GER.escribiendo() ? "teclear" : animPuesto(a), 0.5, true);
        paso(g, dt, "gerente");
      }
      if (api.manejando) moverSanti(dt);
      Object.values(P).forEach(p => p.mixer.update(dt));
    };
    api.moviendo = () => api.manejando || Object.values(P).some(p => p.paso && p.paso.a !== "anim");
    api.cabeza = id => { const p = P[id === "jefe" ? "santi" : id]; if (!api.listo || !p || !p.head) return null; p.head.getWorldPosition(tmpV); tmpV.y += 0.42; return tmpV; };
    api.que = id => { const p = P[id]; return api.listo && p ? p.que : ""; };
    api.gerente = () => P.gerente;
    api.personas = () => P;   // para pruebas (?debug3d)
    api.salir = () => manejar(false);
    return api;
  })();

  if (window.__o3d) Object.assign(window.__o3d, { PERS, GER, camera, controls, ST, focus3D });   // solo con ?debug3d, para pruebas

  /* ---------- Tamaño y bucle ---------- */
  let cvW = 0, cvH = 0;
  function size() {
    // llena el alto que queda de la pantalla debajo del título y la barra de datos
    const top = stage.getBoundingClientRect().top + window.scrollY;
    const W = stage.clientWidth, H = Math.round(W < 700 ? Math.max(W * 1.1, Math.min(W * 1.4, window.innerHeight - top)) : Math.max(420, window.innerHeight - top));
    renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); viewOffset(); cvW = W; cvH = H;
  }
  let lastW3 = 0;
  window.addEventListener("resize", () => { if (stage.clientWidth !== lastW3) { lastW3 = stage.clientWidth; size(); } });
  size(); lastW3 = stage.clientWidth;

  const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const col = new THREE.Color();
  let lastNow = 0;
  /* Rendimiento: no dibuja si la oficina no se ve (página bajada o pestaña oculta), va a 5 cuadros por segundo detrás de
     una pantalla abierta (gráficos, mapa, archivo...), a 30 cuando nadie la toca y a ritmo completo al moverla. */
  let onScreen = true, lastInput = performance.now(), lastDraw = 0, lastShadow = 0, dlgOpen = false, dlgCheck = 0;
  if (window.IntersectionObserver) new IntersectionObserver(es => { onScreen = es[0].isIntersecting; }).observe(el);
  ["pointerdown", "pointermove", "wheel", "touchstart", "keydown"].forEach(ev => el.addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true }));
  controls.addEventListener("change", () => { lastInput = performance.now(); });
  const perf = { n: 0, sum: 0, cool: 0 };
  function adaptar(now, gap, full) {
    // promedio del tiempo entre cuadros dibujados; si no llega al ritmo pedido baja la resolución, si sobra la sube
    perf.n++; perf.sum += gap; if (perf.n < 45) return;
    const avg = perf.sum / perf.n; perf.n = 0; perf.sum = 0;
    if (full) {   // moviéndose: apunta a ~55 cuadros por segundo
      if (avg > (1000 / 45) * 1.3 && prMove > PR_MIN) { prMove = Math.max(PR_MIN, prMove * 0.8); perf.cool = now + 15000; }
      else if (avg < 1000 / 57 && prMove < PR_MAX && now > perf.cool) prMove = Math.min(PR_MAX, prMove * 1.15);
    } else if (avg > 1000 / 22 && prIdle > Math.max(PR_MIN, 1.5)) {   // quieta: solo baja si ni siquiera llega a ~22 cuadros
      prIdle = Math.max(PR_MIN, 1.5, prIdle * 0.85);
    }
  }
  function resolucion(full) {
    const np = full ? prMove : prIdle;
    if (Math.abs(np - pr) > 0.01) { pr = np; renderer.setPixelRatio(pr); perf.n = 0; perf.sum = 0; }
  }
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden || !onScreen) { lastNow = now; return; }
    if (now > dlgCheck) { dlgCheck = now + 300; dlgOpen = !!document.querySelector('[role="dialog"]:not([hidden])'); }
    const full = !dlgOpen && (anim || now - lastInput < 2500 || (PERS && PERS.manejando));   // el Gerente caminando se ve bien a 30 cuadros
    const gap = now - lastDraw, minGap = dlgOpen ? 190 : full ? 0 : 30;
    if (window.__o3d) Object.assign(window.__o3d, { full: !!full, anim: !!anim, inp: Math.round(now - lastInput), ger: !!(GER && GER.caminando()), pr });
    if (gap < minGap) return;
    if (lastDraw && gap < 200) adaptar(now, gap, full);
    resolucion(full);
    lastDraw = now;
    const t = now / 1000, dt = Math.min(0.05, (now - (lastNow || now)) / 1000); lastNow = now;
    // sombras: se recalculan 4 veces por segundo (8 si el Gerente camina), casi no se nota y ahorra la mitad del trabajo
    if (now - lastShadow > ((GER && GER.caminando()) || (PERS && PERS.moviendo()) ? 125 : 250)) { lastShadow = now; renderer.shadowMap.needsUpdate = true; }
    if (GER) GER.update(now, dt);
    if (PERS) PERS.update(now, dt);
    if (!(PERS && PERS.manejando)) {   // manejando a Santi, la cámara la mueve PERS
      if (anim) {
        const k = Math.min(1, (now - anim.s) / anim.d), e = ease(k);
        camera.position.lerpVectors(anim.p0, anim.p1, e); controls.target.lerpVectors(anim.t0, anim.t1, e);
        if (k >= 1) anim = null;
      }
      controls.update();
    }
    rgbMats.forEach((m, i) => m.emissive.setHSL(((t * 0.08) + i * 0.13) % 1, 0.9, 0.5));
    if (!reduce && bossP.userData.head) bossP.userData.head.rotation.y = Math.sin(t * 0.4) * 0.5;
    const sec = Math.floor(t); if (sec % 3 === 0 && sec !== paintBoss.last) { paintBoss.last = sec; paintBoss(); paintOps(); paintClocks(); }
    leds.forEach((l, i) => { l.material.color.setHex(((Math.floor(t * 2.5) + i) % 3) ? 0xffffff : 0x3a3f45); });
    AG.forEach(a => {
      const s = ST[a.id]; if (!s) return;
      const src = TEX[a.id];
      if (a.id === "gerente" && GER && GER.activo()) { /* la anima GER */ } else if (src !== s.src || TEX[a.id + "2"] !== s.src2 || a.state !== s.st || (src && !s.loaded && (src.naturalWidth || src.width))) {
        s.src = src; s.src2 = TEX[a.id + "2"]; s.st = a.state; s.loaded = !!(src && (src.naturalWidth || src.width)); paintScreen(a, s, t);
      }
      const st = STATES[a.state]; col.set(st.c);
      s.ring.material.color.copy(col);
      s.ring.material.opacity = a.state === "working" && !reduce ? 0.35 + 0.2 * Math.sin(t * 4) : (open && sel === a.id ? 0.6 : 0.32);
      s.glow.color.copy(col); s.glow.intensity = a.state === "sleep" ? 0.15 : a.state === "alert" && Math.floor(t * 2) % 2 ? 1.2 : 0.6;
      const work = a.state === "working" && !reduce, sleep = a.state === "sleep";
      if (!(a.id === "gerente" && GER && GER.activo())) s.arms.forEach((arm, i) => { arm.rotation.x = work ? Math.sin(t * 14 + i * 2.4) * 0.12 : sleep ? 0.35 : 0; });
      s.headG.rotation.x = sleep ? 0.45 : work ? Math.sin(t * 3) * 0.04 : 0;
      s.headG.rotation.y = a.state === "waiting" && !reduce ? Math.sin(t * 0.9) * 0.35 : 0;
      s.torso.rotation.x = sleep ? 0.12 : 0;
    });
    if (window.tableroVersion !== tabVer && TEX.tablero) { tabVer = window.tableroVersion; tabTex.image = TEX.tablero; tabTex.needsUpdate = true; }
    cabDrawers.forEach((d, k) => { const zt = 0.375 + cabTarget[k]; d.position.z += (zt - d.position.z) * (reduce ? 1 : 0.12); });
    renderer.render(scene, camera);
    placeTags(cvW, cvH);
  }
  requestAnimationFrame(loop);
})();
