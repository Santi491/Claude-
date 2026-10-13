/* Oficina de agentes en 3D (Three.js r128). Usa los mismos datos y el mismo panel que la versión 2D
   (AG, TEX, STATES, D, drawDrawer, sel, open...). Si no hay WebGL, la página sigue con la oficina 2D. */
(function () {
  if (!window.THREE || !THREE.OrbitControls) return;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return; }
  if (!renderer.getContext()) return;
  window.OFICINA_3D = true;

  const stage = $("stage"), cv2d = $("cv");
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
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
    : "Arrastra para girar · clic derecho para mover · rueda para zoom · clic en un agente";

  /* ---------- Escena, cámara, luces: hangar grafito ---------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121417);
  scene.fog = new THREE.Fog(0x121417, 50, 100);
  const XC0 = 5;   // centro del hangar (x), igual a XC más abajo
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const HOME = { pos: new THREE.Vector3(22, 22, 29), target: new THREE.Vector3(5.5, 0, 2) };
  camera.position.copy(HOME.pos);
  const controls = new THREE.OrbitControls(camera, el);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.target.copy(HOME.target);
  controls.maxPolarAngle = Math.PI * 0.46; controls.minDistance = 3; controls.maxDistance = 58;
  controls.screenSpacePanning = true;

  scene.add(new THREE.HemisphereLight(0xe9eef4, 0x2a2c30, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(17, 20, 10); sun.target.position.set(XC0, 0, 0); scene.add(sun.target); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 16, bottom: -16, near: 1, far: 70 });
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdfe8f2, 0.2); fill.position.set(-14, 8, 14); scene.add(fill);

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
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
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
  const RW = 40, RD = 20, WH = 7.2; // ancho (x), fondo (z), alto de muros
  const XL = -15, XR = XL + RW, XC = (XL + XR) / 2;   // el hangar crece hacia la derecha: el muro izquierdo no se mueve
  // piso de epoxi claro con vetas de mármol, pulido
  const conc = marble("#e6e1d7", "#b3a791", .7, 16);
  conc.wrapS = conc.wrapT = THREE.RepeatWrapping; conc.repeat.set(3, 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), M(0xc9c4ba, { map: conc, roughness: 0.2, metalness: 0.1 }));
  floor.position.x = XC; floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // muros de microcemento grafito con juntas de panel
  function wallTex(rep) {
    const t = canvasTex(1024, 512, (g, w, h) => {
      g.fillStyle = "#34373c"; g.fillRect(0, 0, w, h); mottle(g, w, h, 900, 23, .06);
      g.fillStyle = "rgba(12,14,16,.5)"; for (let k = 1; k < 4; k++) g.fillRect(k * w / 4 - 1, 0, 2, h);
    });
    t.wrapS = THREE.RepeatWrapping; t.repeat.set(rep, 1); return t;
  }
  box(RW, WH, 0.3, M(0xffffff, { map: wallTex(RW / 8), roughness: 0.85 }), XC, WH / 2, -RD / 2 - 0.15);  // muro del fondo
  box(0.3, WH, RD, M(0xffffff, { map: wallTex(RD / 8), roughness: 0.85 }), XL - 0.15, WH / 2, 0);  // muro izquierdo
  box(RW, 0.14, 0.05, M(0x17191c), XC, 0.07, -RD / 2 + 0.03);  // zócalos
  box(0.05, 0.14, RD, M(0x17191c), XL + 0.03, 0.07, 0);

  // columnas de acero del hangar
  const steelDk = M(0x1d2023, { metalness: .6, roughness: .4 });
  [-14, -3, 13, 24].forEach(x => box(0.35, WH, 0.3, steelDk, x === -14 ? -14.6 : x, WH / 2, -RD / 2 + 0.16));
  [-5].forEach(z => box(0.3, WH, 0.35, steelDk, XL + 0.16, WH / 2, z));

  // LED blanco en los bordes de arriba y en las esquinas
  box(RW, 0.06, 0.08, ledM, XC, WH - 0.12, -RD / 2 + 0.05).castShadow = false;
  box(0.08, 0.06, RD, ledM, XL + 0.05, WH - 0.12, 0).castShadow = false;
  [[XL + 0.05, -RD / 2 + 0.05], [XR - 0.04, -RD / 2 + 0.05], [XL + 0.05, RD / 2 - 0.04]].forEach(([x, z]) => { box(0.06, WH, 0.06, ledM, x, WH / 2, z).castShadow = false; });
  box(RW, 0.03, 0.05, ledM, XC, 0.16, -RD / 2 + 0.05).castShadow = false;   // línea fina a ras del piso
  box(0.05, 0.03, RD, ledM, XL + 0.05, 0.16, 0).castShadow = false;
  [[-9, -RD / 2 + 1], [XC, -RD / 2 + 1], [19, -RD / 2 + 1]].forEach(([x, z]) => { const l = new THREE.PointLight(0xffffff, 0.35, 9, 2); l.position.set(x, WH - 0.4, z); scene.add(l); });
  [-6, 4].forEach(z => { const l = new THREE.PointLight(0xffffff, 0.3, 9, 2); l.position.set(XL + 1, WH - 0.4, z); scene.add(l); });

  // ventanas altas del hangar con el cielo de noche
  const sky = canvasTex(1024, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#0e1622"); gr.addColorStop(1, "#273444");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,.7)"; for (let i = 0; i < 60; i++) g.fillRect(rnd() * w, rnd() * h * .7, 1.5, 1.5);
  });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(RW - 2, 0.9), new THREE.MeshBasicMaterial({ map: sky }));
  win.position.set(XC, WH - 0.75, -RD / 2 + 0.02); scene.add(win);
  for (let x = XL + 1; x <= XR - 1; x += 1.4) box(0.05, 0.9, 0.04, steelDk, x, WH - 0.75, -RD / 2 + 0.05).castShadow = false;
  box(RW - 2, 0.05, 0.05, steelDk, XC, WH - 1.2, -RD / 2 + 0.05);

  // vigas negras del techo con spots
  [-6.5, -1.5, 3.5, 8.5].forEach(z => {
    box(RW, 0.3, 0.16, steelDk, XC, WH - 0.15, z).castShadow = false;
    for (let x = XL + 1.5; x < XR; x += 2.5) { const d = cyl(0.07, 0.07, 0.03, ledM, x, WH - 0.31, z, scene, 12); d.castShadow = false; }
  });
  // muro de mármol negro con el nombre del negocio
  const slab = box(9, 3.8, 0.12, M(0xffffff, { map: marbleN, roughness: 0.18, metalness: 0.08 }), XC, 2.45, -RD / 2 + 0.08);
  slab.castShadow = false;
  box(9.1, 0.04, 0.16, ledM, XC, 4.37, -RD / 2 + 0.1).castShadow = false;
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
  lg.position.set(XC, 2.5, -RD / 2 + 0.16); scene.add(lg);
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
  plant(XL + 1, -RD / 2 + 1); plant(XC + 5.4, -RD / 2 + 1, 1.1); plant(XC - 5.4, -RD / 2 + 1, 1.1); plant(XR - 1.2, -RD / 2 + 1.2, 1.2); plant(-14.2, 9.4, .8);

  // Rack de servidores (la nube)
  const rackG = new THREE.Group(); rackG.position.set(XL + 1.1, 0, -5.5); scene.add(rackG);
  box(1.2, 2.6, 1, M(0x1e2124, { metalness: .5, roughness: .4 }), 0, 1.3, 0, rackG);
  const leds = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    m.position.set(0.62, 0.4 + i * 0.24, -0.3 + (i % 3) * 0.25); m.rotation.y = Math.PI / 2; rackG.add(m); leds.push(m);
  }

  // puestos de trabajo: fila del fondo y fila de adelante, con 7,5 m entre escritorios
  const STATION = { nube: [-8.5, -4.8], ebay: [-1, -4.8], wa: [6.5, -4.8], pedidos: [14, -4.8], mkt: [-5.2, 3.2], ana: [2.6, 3.2], gerente: [10.4, 3.2] };
  // lámparas LED lineales colgantes sobre los escritorios
  function ledBar(x, z, len, y, rotY) {
    y = y || 3.72;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g);
    [-len / 2 + 0.2, len / 2 - 0.2].forEach(dx => cyl(0.006, 0.006, WH - y, M(0x0d0d0d), dx, y + (WH - y) / 2, 0, g, 4).castShadow = false);
    box(len, 0.07, 0.12, M(0x141517, { metalness: .6, roughness: .35 }), 0, y, 0, g).castShadow = false;
    box(len - 0.06, 0.012, 0.08, ledM, 0, y - 0.04, 0, g).castShadow = false;
    const l = new THREE.PointLight(0xf4f7ff, 0.55, 7.5, 2); l.position.set(0, y - 0.3, 0); g.add(l);
  }
  Object.values(STATION).forEach(([x, z]) => ledBar(x, z + 0.2, 3.0));

  // Pasillo marcado en el piso
  box(RW - 2, 0.01, 0.05, M(0xd9dde2, { roughness: .5 }), XC, 0.005, 0.6);

  // Zona de almacén (adelante a la derecha): racks con cajas como llegan de verdad
  // (cartón con cinta de eBay, USPS Priority Mail, cartón con etiqueta). Cada pedido real de pedidos.csv suma su caja al pallet de llegadas.
  const WZ = new THREE.Group(); WZ.position.set(19.8, 0, 5.7); scene.add(WZ);
  const lineM = M(0xd9dde2, { roughness: .5 });
  [[0, -3.6, 8.9, 0.05], [0, 4.1, 8.9, 0.05], [-4.45, 0.25, 0.05, 7.7], [4.45, 0.25, 0.05, 7.7]].forEach(([x, z, w, d]) => box(w, 0.01, d, lineM, x, 0.006, z, WZ));
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
  function shelf(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); WZ.add(g);
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
  shelf(0.6, -2.6); shelf(0.6, -0.2); shelf(0.6, 2.2);
  // pallet de llegadas: una caja por cada pedido real (los de prueba no se mezclan)
  const reales = (D.pedidos || []).filter(p => !p.prueba);
  const kindOf = p => /usps/i.test(p.courier || "") && !/ebay/i.test(p.tienda || "") ? "usps" : /ebay/i.test(p.tienda || "") ? "ebay" : /usps/i.test(p.courier || "") ? "usps" : "kraft";
  [[-3.3, -1.4], [-3.3, 1.6]].forEach(([px, pz], pi) => {
    const pallet = new THREE.Group(); pallet.position.set(px, 0, pz); WZ.add(pallet);
    box(1.2, 0.14, 1.0, M(0x8a7a5e, { roughness: .9 }), 0, 0.07, 0, pallet);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) for (let d = 0; d < 2; d++) {
      const i = pi * 12 + r * 4 + c * 2 + d, p = reales[i];
      const kind = p ? kindOf(p) : KINDS[(i * 5 + r) % KINDS.length];
      parcel(kind, 0.52, 0.36, 0.44, -0.28 + c * 0.56, 0.33 + r * 0.38, -0.23 + d * 0.47, pallet);
    }
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.18, 0.98), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .12, roughness: .1, depthWrite: false }));
    wrap.position.set(0, 0.74, 0); pallet.add(wrap);
  });
  const zoneSign = canvasTex(512, 128, (g, w, h) => { g.fillStyle = "#1c1e21"; g.fillRect(0, 0, w, h); g.fillStyle = "#E9EBEE"; g.font = "700 52px 'IBM Plex Mono', monospace"; g.textAlign = "center"; g.fillText("ALMACÉN · A1", w / 2, 82); });
  const zs = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: zoneSign })); zs.position.set(0.6, 3.05, -2.6); WZ.add(zs);
  box(0.04, 0.4, 0.04, blackSteel, -0.1, 3.4, -2.6, WZ); box(0.04, 0.4, 0.04, blackSteel, 1.3, 3.4, -2.6, WZ);

  /* ---------- Puestos de trabajo ---------- */
  const skin = M(0xe7b98f, { roughness: .6 }), hairM = M(0x2b2018), deskM = marbleWM,
    legM = M(0x1f2a33, { metalness: .5, roughness: .4 }), chairM = M(0x2a2d31, { roughness: .8 });
  const ST = {};
  AG.forEach(a => {
    const pos = STATION[a.id]; if (!pos) return;
    const g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]); scene.add(g);
    // alfombra del puesto, escritorio más ancho, cajonera y planta propia
    const rugP = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.015, 3.4), M(0x2c3036, { roughness: 1 })); rugP.position.set(0, 0.008, 0.55); rugP.receiveShadow = true; g.add(rugP);
    box(4.0, 0.006, 3.2, M(0x3a3f46, { roughness: 1 }), 0, 0.017, 0.55, g).castShadow = false;
    box(3.0, 0.08, 1.35, deskM, 0, 0.78, 0, g);
    [[-1.42, -.55], [1.42, -.55], [-1.42, .55], [1.42, .55]].forEach(([x, z]) => box(0.06, 0.74, 0.06, legM, x, 0.37, z, g));
    box(0.5, 0.6, 0.6, M(0x24282d, { roughness: .5 }), 1.05, 0.3, -0.2, g);
    [0.15, 0.4].forEach(y => box(0.18, 0.025, 0.02, M(0xc9a35a, { metalness: .6, roughness: .3 }), 1.05, y, 0.11, g));
    cyl(0.2, 0.16, 0.42, marbleWM, -1.85, 0.21, -0.35, g, 20);
    [[0, .62, 0, .3], [.12, .55, .08, .22], [-.1, .74, -.04, .2]].forEach(([dx, dy, dz, r]) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), M(0x2f7a52, { roughness: .8 })); m.position.set(-1.85 + dx, dy, -0.35 + dz); m.castShadow = true; g.add(m); });
    // monitor (el Gerente tiene dos, un poco girados hacia él)
    const dual = a.id === "gerente";
    const mons = (dual ? [[-0.64, 0.2], [0.64, -0.2]] : [[0, 0]]).map(([mx, rot]) => {
      const mg = new THREE.Group(); mg.position.set(mx, 0, 0); mg.rotation.y = rot; g.add(mg);
      const w = dual ? 1.24 : 1.62, h = dual ? 0.74 : 0.96, y = dual ? 1.42 : 1.5;
      box(0.1, 0.38, 0.08, legM, 0, 1.0, -0.38, mg); box(0.4, 0.03, 0.25, legM, 0, 0.83, -0.38, mg);
      box(w, h, 0.06, M(0x10181f, { metalness: .3, roughness: .4 }), 0, y, -0.42, mg);
      const sc = document.createElement("canvas"); sc.width = 1024; sc.height = 576;
      const stex = new THREE.CanvasTexture(sc); stex.encoding = THREE.sRGBEncoding; stex.anisotropy = 4;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, h - 0.1), new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }));
      screen.position.set(0, y, -0.385); mg.add(screen);
      return { screen, stex, sc, ctx: sc.getContext("2d") };
    });
    const { screen, stex, sc } = mons[0];
    // teclado, taza, lámpara de escritorio
    box(0.7, 0.03, 0.22, M(0x1b252d), 0, 0.835, 0.12, g);
    cyl(0.07, 0.06, 0.13, M(0xe8e2d2), 0.85, 0.89, 0.1, g);
    box(0.28, 0.02, 0.2, M(0xeae6dc), -0.8, 0.83, 0.05, g);
    // silla
    const ch = new THREE.Group(); ch.position.set(0, 0, 0.95); g.add(ch);
    box(0.66, 0.12, 0.62, chairM, 0, 0.5, 0, ch); box(0.66, 0.85, 0.1, chairM, 0, 1.0, 0.31, ch);
    box(0.4, 0.16, 0.08, chairM, 0, 1.52, 0.33, ch);                                        // apoyacabeza
    [-0.36, 0.36].forEach(x => { box(0.06, 0.04, 0.42, legM, x, 0.74, 0.02, ch); box(0.04, 0.2, 0.04, legM, x, 0.63, 0.12, ch); });   // apoyabrazos
    cyl(0.04, 0.04, 0.42, legM, 0, 0.25, 0, ch, 8); cyl(0.32, 0.32, 0.04, legM, 0, 0.04, 0, ch, 5);
    // persona sentada mirando el monitor
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
    const glow = new THREE.PointLight(0x4fd1e8, 0.45, 3.2, 2); glow.position.set(0, 1.5, 0.2); g.add(glow);
    ST[a.id] = { g, screen, stex, sc, ctx: sc.getContext("2d"), mons, torso, headG, arms, ring, glow, src: null, st: null, ver: -1 };
  });


  /* ---------- Entrepiso (penthouse del jefe) sobre el lounge, muro izquierdo ---------- */
  const MZH = 3.0, MX0 = XL, MX1 = -9.6, MZ0 = -1, MZ1 = RD / 2;   // alto y planta del entrepiso
  const mzW = MX1 - MX0, mzD = MZ1 - MZ0, mzX = (MX0 + MX1) / 2, mzZ = (MZ0 + MZ1) / 2;
  const navySteel = M(0x1b232d, { metalness: .55, roughness: .45 });
  box(mzW, 0.22, mzD, M(0x2b2e32, { roughness: .6 }), mzX, MZH - 0.11, mzZ);                 // losa
  box(0.3, 0.5, mzD, navySteel, MX1 - 0.12, MZH - 0.25, mzZ);                                // viga de borde
  box(mzW, 0.5, 0.3, navySteel, mzX, MZH - 0.25, MZ0 + 0.12);
  for (let z = MZ0 + 1; z < MZ1; z += 1.25) box(mzW, 0.16, 0.1, M(0x15181b, { metalness: .5 }), mzX, MZH - 0.3, z);  // viguetas
  [MZ0 + 0.15, mzZ, MZ1 - 0.2].forEach(z => box(0.22, MZH - 0.22, 0.22, navySteel, MX1 - 0.12, (MZH - 0.22) / 2, z));
  [[mzZ - 3, 1.6], [mzZ + 2.5, 1.6]].forEach(([z, w]) => { const p = box(w, 0.02, 0.7, ledM, mzX + 0.4, MZH - 0.39, z); p.castShadow = false; p.rotation.y = Math.PI / 2; });
  [[mzZ - 3], [mzZ + 2.5]].forEach(([z]) => { const l = new THREE.PointLight(0xffffff, 0.5, 6, 2); l.position.set(mzX + 0.4, MZH - 0.6, z); scene.add(l); });
  // baranda de vidrio con pasamanos
  const railGlass = new THREE.MeshStandardMaterial({ color: 0xd6e2ec, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  function rail(x1, z1, x2, z2) {
    const len = Math.hypot(x2 - x1, z2 - z1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, ang = Math.atan2(z2 - z1, x2 - x1);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.0), railGlass); g.position.set(cx, MZH + 0.5, cz); g.rotation.y = -ang; scene.add(g);
    const h = box(len, 0.05, 0.06, M(0x111214, { metalness: .7, roughness: .3 }), cx, MZH + 1.02, cz); h.rotation.y = -ang;
  }
  rail(MX1 - 0.05, MZ0 + 1.2, MX1 - 0.05, MZ1 - 0.05); rail(MX0, MZ0 + 0.05, MX1, MZ0 + 0.05);
  // escalera flotante de madera que sube junto al borde del entrepiso
  const oak = M(0xc19463, { roughness: .55 });
  const STEPS_N = 12, rise = MZH / STEPS_N, run = 0.34, sz = MZ0 + 0.6 + 1.1;
  for (let i = 0; i < STEPS_N; i++) box(run + 0.04, 0.07, 1.0, oak, MX1 + 4.1 - (i + 0.5) * run, rise * (i + 1) - 0.035, sz - 1.1);
  const stringer = box(Math.hypot(STEPS_N * run, MZH), 0.22, 0.12, M(0x111214, { metalness: .6 }), MX1 + 4.1 - STEPS_N * run / 2, MZH / 2, sz - 1.1);
  stringer.rotation.z = -Math.atan2(MZH, STEPS_N * run);
  const hr = box(Math.hypot(STEPS_N * run, MZH), 0.04, 0.04, M(0x111214, { metalness: .7 }), MX1 + 4.1 - STEPS_N * run / 2, MZH / 2 + 0.95, sz - 1.62);
  hr.rotation.z = -Math.atan2(MZH, STEPS_N * run);

  // Lounge debajo del entrepiso: pared de listones de madera con TV, sofá gris, mesas de mármol y alfombra
  const slatM = M(0x8a6444, { roughness: .6 });
  box(0.04, MZH - 0.3, 6.2, M(0x1b1c1e), XL + 0.03, (MZH - 0.3) / 2, 5.6);
  for (let z = 2.6; z <= 8.6; z += 0.11) box(0.06, MZH - 0.3, 0.06, slatM, XL + 0.08, (MZH - 0.3) / 2, z).castShadow = false;
  const tvArt = canvasTex(1024, 576, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#1d2024"); gr.addColorStop(1, "#0d0e10");
    g.fillStyle = gr; g.fillRect(0, 0, w, h); brandArt(g, w, h, 250, 70, 14);
  });
  if (document.fonts) document.fonts.ready.then(() => { const g = tvArt.image.getContext("2d"), gr = g.createLinearGradient(0, 0, 1024, 576); gr.addColorStop(0, "#1d2024"); gr.addColorStop(1, "#0d0e10"); g.fillStyle = gr; g.fillRect(0, 0, 1024, 576); brandArt(g, 1024, 576, 250, 70, 14); tvArt.needsUpdate = true; });
  box(0.08, 1.45, 2.5, M(0x0a0a0b, { metalness: .4, roughness: .3 }), XL + 0.16, 1.5, 5.6);
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.35), new THREE.MeshBasicMaterial({ map: tvArt, toneMapped: false }));
  tv.rotation.y = Math.PI / 2; tv.position.set(XL + 0.21, 1.5, 5.6); scene.add(tv);
  box(0.45, 0.4, 2.8, M(0x1a1b1d, { roughness: .5 }), XL + 0.35, 0.2, 5.6);
  const rugTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#9c9fa3"; g.fillRect(0, 0, w, h); g.strokeStyle = "#c9cbce"; g.lineWidth = 7;
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x + 8, y + 32); g.lineTo(x + 8, y + 8); g.lineTo(x + 32, y + 8); g.moveTo(x + 56, y + 32); g.lineTo(x + 56, y + 56); g.lineTo(x + 32, y + 56); g.stroke(); }
  });
  rugTex.wrapS = rugTex.wrapT = THREE.RepeatWrapping; rugTex.repeat.set(2, 3);
  const rug = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.02, 5.6), M(0xffffff, { map: rugTex, roughness: 1 })); rug.position.set(-12.2, 0.01, 5.6); rug.receiveShadow = true; scene.add(rug);
  const sofaM = M(0x7b7f84, { roughness: .95 });
  function sofa(x, z, w, d, rotY) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    box(w, 0.42, d, sofaM, 0, 0.21, 0, g); box(w, 0.42, 0.28, sofaM, 0, 0.62, d / 2 - 0.14, g);
    for (let k = 0; k < Math.round(w / 0.9); k++) box(w / Math.round(w / 0.9) - 0.06, 0.16, d - 0.34, M(0x868a8f, { roughness: 1 }), -w / 2 + (k + 0.5) * w / Math.round(w / 0.9), 0.5, -0.12, g);
    return g;
  }
  sofa(-10.6, 5.6, 4.4, 1.05, -Math.PI / 2);         // frente a la TV
  sofa(-12.4, 8.35, 2.6, 1.05, Math.PI);             // el lado de la L
  [[-12.8, 4.7, 0.55], [-12.4, 6.3, 0.42]].forEach(([x, z, r]) => {
    cyl(r, r, 0.06, marbleWM, x, 0.42, z, scene, 40); cyl(r * 0.55, r * 0.6, 0.38, M(0x2a2c30, { roughness: .4 }), x, 0.19, z, scene, 28);
  });
  // barra de mármol negro al fondo del lounge
  const nero = M(0xffffff, { map: marbleN, roughness: .18, metalness: .06 });
  box(0.05, MZH - 0.4, 2.8, nero, XL + 0.03, (MZH - 0.4) / 2 + 0.05, 0.6).castShadow = false;
  box(0.65, 0.9, 2.8, M(0x23262a, { roughness: .5 }), XL + 0.35, 0.45, 0.6);
  box(0.75, 0.05, 2.9, nero, XL + 0.38, 0.92, 0.6);
  box(0.6, 0.02, 2.6, ledM, XL + 0.36, 0.88, 0.6).castShadow = false;
  [-0.3, 0.6, 1.5].forEach(z => { cyl(0.2, 0.2, 0.06, M(0x15161a), -13.8, 0.75, z, scene, 20); cyl(0.03, 0.03, 0.72, M(0x15161a, { metalness: .6 }), -13.8, 0.38, z, scene, 8); cyl(0.2, 0.2, 0.02, M(0x15161a, { metalness: .6 }), -13.8, 0.01, z, scene, 20); });

  /* ---------- Gym (adelante al centro) ---------- */
  const gym = new THREE.Group(); gym.position.set(-1.6, 0, 7.85); scene.add(gym);
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
  // Escritorio del jefe arriba, en el entrepiso (Warehouse > Penthouse)
  const boss = new THREE.Group(); boss.position.set(-12.2, MZH, 4.6); boss.rotation.y = Math.PI / 2; scene.add(boss);
  ledBar(-12.75, 4.6, 3.6, MZH + 1.9, Math.PI / 2);
  const darkWood = M(0xffffff, { map: marbleN, roughness: .18, metalness: .06 });
  box(4.4, 0.1, 1.5, darkWood, 0, 0.8, 0, boss); box(4.4, 0.7, 0.08, darkWood, 0, 0.4, -0.7, boss);
  box(0.08, 0.75, 1.4, darkWood, -2.16, 0.38, 0, boss); box(0.08, 0.75, 1.4, darkWood, 2.16, 0.38, 0, boss);
  // tres monitores: uno recto al centro y dos curvos a los costados, girados hacia el jefe
  const bossScreens = [], bezelM = M(0x10181f, { metalness: .3, roughness: .4 });
  function bossCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return { c, t }; }
  {
    const { c, t } = bossCanvas(768, 450);
    box(1.5, 0.9, 0.06, bezelM, 0, 1.52, -0.45, boss);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.83), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    m.position.set(0, 1.52, -0.415); boss.add(m); bossScreens.push({ c, t, i: 1 });
    box(0.08, 0.36, 0.08, legM, 0, 1.0, -0.47, boss); box(0.45, 0.02, 0.25, legM, 0, 0.86, -0.45, boss);
  }
  [[-1.5, 0.42, 0], [1.5, -0.42, 2]].forEach(([x, rot, i]) => {
    const g = new THREE.Group(); g.position.set(x, 0, -0.32); g.rotation.y = rot; boss.add(g);
    const R = 1.9, L = 1.4 / R, cz = -0.06 + R;
    const back = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.035, R + 0.035, 0.9, 32, 1, true, Math.PI - (L + 0.04) / 2, L + 0.04), bezelM);
    back.position.set(0, 1.52, cz); g.add(back);
    const { c, t } = bossCanvas(768, 450); t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1;
    const scr = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.83, 32, 1, true, Math.PI - L / 2, L), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, toneMapped: false }));
    scr.position.set(0, 1.52, cz); g.add(scr); bossScreens.push({ c, t, i });
    box(0.08, 0.36, 0.08, legM, 0, 1.0, -0.12, g); box(0.4, 0.02, 0.24, legM, 0, 0.86, -0.1, g);
  });
  box(0.75, 0.025, 0.24, M(0x1b1d20), 0, 0.865, 0.15, boss); box(0.09, 0.03, 0.13, M(0x1b1d20), 0.55, 0.865, 0.18, boss);
  cyl(0.07, 0.06, 0.13, M(0x1b1b1b), 1.75, 0.92, 0.35, boss);
  cyl(0.05, 0.12, 0.28, M(0xd4af37, { metalness: .9, roughness: .25 }), -1.85, 1.0, 0.4, boss);
  const bossChair = new THREE.Group(); bossChair.position.set(0, 0, 0.95); boss.add(bossChair);
  const leather = M(0x231a14, { roughness: .5 });
  box(0.8, 0.14, 0.75, leather, 0, 0.52, 0, bossChair); box(0.8, 1.15, 0.14, leather, 0, 1.15, 0.36, bossChair);
  cyl(0.05, 0.05, 0.42, legM, 0, 0.26, 0, bossChair, 8); cyl(0.38, 0.38, 0.04, legM, 0, 0.04, 0, bossChair, 5);
  const bossP = person(boss, 0, 0.92, 0x111111, 1.08);
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

  // Archivero de documentos
  const cabG = new THREE.Group(); cabG.position.set(19.5, 0, -7.2); scene.add(cabG);
  box(1.1, 1.9, 0.8, M(0x3a3e43, { metalness: .4, roughness: .45 }), 0, 0.95, 0, cabG);
  for (let k = 0; k < 3; k++) {
    box(0.98, 0.52, 0.04, M(0x2c2f33, { metalness: .35 }), 0, 0.35 + k * 0.6, 0.42, cabG);
    box(0.3, 0.05, 0.05, M(0xc9a35a, { metalness: .6, roughness: .3 }), 0, 0.45 + k * 0.6, 0.46, cabG);
  }
  ST.docs = { g: cabG };
  ST.jefe = { g: boss };

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
  [...AG, { id: "docs", name: "Documentos" }, { id: "jefe", name: "Santi" }].forEach(a => {
    const b = document.createElement("button"); b.type = "button"; b.className = "ag3d"; b.dataset.id = a.id;
    b.innerHTML = `<span class="dot"></span><span class="nm"></span><small></small>`;
    b.addEventListener("click", e => { e.stopPropagation(); focus3D(a.id); });
    layer.appendChild(b); tags[a.id] = b;
  });
  const headPos = new THREE.Vector3();
  function placeTags(W, H) {
    const tmp = new THREE.Vector3();
    Object.keys(tags).forEach(id => {
      const s = ST[id], b = tags[id]; if (!s) { b.hidden = true; return; }
      if (id === "docs") tmp.set(0, 2.4, 0).applyMatrix4(s.g.matrixWorld);
      else if (id === "jefe") tmp.set(0, 2.55, 0.9).applyMatrix4(s.g.matrixWorld);
      else if (id === "gerente" && GER && GER.caminando()) tmp.set(0, 2.25, 0).applyMatrix4(GER.walker.matrixWorld);
      else tmp.set(0, 2.25, 0.9).applyMatrix4(s.g.matrixWorld);
      tmp.project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15;
      b.hidden = !vis; if (!vis) return;
      const px = (tmp.x + 1) / 2 * W, py = (1 - tmp.y) / 2 * H;
      if (id === "jefe") {
        b.querySelector(".nm").textContent = "Santi · jefe"; b.style.setProperty("--c", "#F2A541");
        b.querySelector("small").textContent = LIVE_ON ? "viendo la ronda en vivo" : "supervisando";
      } else if (id === "docs") {
        b.querySelector(".nm").textContent = `Documentos · ${D.documentos.length}`; b.style.setProperty("--c", "#C9A35A");
        b.querySelector("small").textContent = "";
      } else {
        const a = AG.find(x => x.id === id), st = STATES[a.state];
        b.style.setProperty("--c", st.c); b.querySelector(".nm").textContent = a.name;
        const extra = id === "gerente" && GER && GER.texto() ? GER.texto() : a.liveText ? a.liveText : a.state === "sleep" ? "zZ · en espera" : a.state === "done" ? "✓ trabajó hoy" : a.state === "waiting" ? "… esperando respuestas" : a.state === "working" ? "trabajando" : "";
        b.querySelector("small").textContent = extra;
      }
      b.classList.toggle("on", open && sel === id);
      // En pantallas angostas la etiqueta no se sale por los costados ni por arriba: se corre hacia adentro
      const m = 6, w = b.offsetWidth, h = b.offsetHeight;
      const x = w + 2 * m < W ? Math.min(Math.max(px, w / 2 + m), W - w / 2 - m) : W / 2;
      const y = Math.max(py, h + m);
      b.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
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
    if (open && sel === id) { if (id === "pedidos" && window.abrirMapa) { window.abrirMapa(); return; } if (id === "gerente" && window.abrirPanel) { window.abrirPanel(); return; } close3D(); return; }
    if (id === "docs" && sel !== "docs") cabSel = null;
    sel = id; open = true; $("drawer").hidden = false; drawDrawer(); $("dBody").scrollTop = 0; viewOffset();
    const s = ST[id]; if (!s) return;
    s.g.updateMatrixWorld();
    const tgt = id === "jefe" ? new THREE.Vector3(0, 1.45, -0.45).applyMatrix4(s.g.matrixWorld) : id === "docs" ? new THREE.Vector3(0, 1.1, 0).applyMatrix4(s.g.matrixWorld) : new THREE.Vector3(0, 1.45, -0.4).applyMatrix4(s.g.matrixWorld);
    const pos = id === "jefe" ? tgt.clone().add(new THREE.Vector3(4.2, 1.6, 1.6)) : id === "docs" ? tgt.clone().add(new THREE.Vector3(-1.5, 1.2, 3.6)) : tgt.clone().add(new THREE.Vector3(1.2, 0.9, 3.4));
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
  $("zout").onclick = () => { const d = camera.position.clone().sub(controls.target).multiplyScalar(1.3); if (d.length() < 58) camera.position.copy(controls.target).add(d); };

  // clic en un agente o en el archivero directamente sobre el 3D
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let down = null;
  el.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener("pointerup", e => {
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
    const carry = new THREE.Group(); carry.position.set(0, 1.02, -0.3); body.add(carry);   // hojas en las manos
    const deskPile = new THREE.Group(); deskPile.position.set(-1.12, 0.83, 0.32); s.g.add(deskPile);  // hojas en el escritorio
    const sheet = (parent, k) => { const m = box(0.3, 0.012, 0.4, paperM, (k % 2) * 0.012, 0.008 + k * 0.014, 0, parent); m.rotation.y = (k % 3 - 1) * 0.08; m.castShadow = false; return m; };

    // puntos donde se para: al costado de la silla de cada agente, entrando desde el pasillo (z = 0,6)
    const AIS = 0.6;
    const standAt = id => { const [x, z] = STATION[id]; return { x: x + 1.25, z: z + 0.95 }; };
    const sideX = id => STATION[id][0] + 2.35;
    function route(from, to) {   // del puesto "from" al puesto "to" sin atravesar escritorios
      const a = standAt(from), b = standAt(to), pts = [a, { x: sideX(from), z: a.z }, { x: sideX(from), z: AIS }];
      pts.push({ x: sideX(to), z: AIS }, { x: sideX(to), z: b.z }, b);
      return pts;
    }

    let plan = [], fase = "sentado", t0 = 0, recogidas = 0, chat = null, proxima = 7;
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
      recogidas = 0; fase = "caminando"; t0 = now;
      const a = standAt("gerente"); w.position.set(a.x, 0, a.z); w.visible = true; seated.visible = false;
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
      return fase === "caminando" ? (recogidas ? `llevando ${recogidas} ${recogidas > 1 ? "informes" : "informe"}` : "recogiendo informes")
        : fase === "chat" ? "escribiéndole a Santi por Telegram" : "";
    }
    const VEL = /[?&]rapido/.test(location.search) ? 8 : 1;   // solo para pruebas
    function update(now, dt) {
      dt *= VEL;
      const t = now / 1000;
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
          w.visible = false; seated.visible = true; fase = "chat"; chat = { t0: now, msgs: mensajes() }; return;
        }
        if (p.pausa != null) {   // en el puesto de un agente: estira el brazo y recoge una hoja
          p.t = (p.t || 0) + dt; const k = Math.min(1, p.t / p.pausa);
          arms[1].rotation.x = -Math.sin(k * Math.PI) * 1.1; legs.forEach(l => l.rotation.x = 0);
          const [ax, az] = STATION[p.id]; w.rotation.y = Math.atan2(ax - w.position.x, az + 0.92 - w.position.z) + Math.PI;
          if (p.t >= p.pausa) { sheet(carry, recogidas++); plan.shift(); }
          return;
        }
        const dx = p.x - w.position.x, dz = p.z - w.position.z, d = Math.hypot(dx, dz), v = 1.35 * dt;
        if (d <= v) { w.position.set(p.x, 0, p.z); plan.shift(); return; }
        w.position.x += dx / d * v; w.position.z += dz / d * v;
        w.rotation.y = Math.atan2(dx, dz) + Math.PI;
        const ph = t * 7.5;
        legs[0].rotation.x = Math.sin(ph) * 0.5; legs[1].rotation.x = -Math.sin(ph) * 0.5;
        arms[0].rotation.x = -Math.sin(ph) * 0.4; arms[1].rotation.x = recogidas ? -0.95 : Math.sin(ph) * 0.4;
        arms[0].rotation.x = recogidas ? -0.95 : arms[0].rotation.x;
        body.position.y = Math.abs(Math.sin(ph)) * 0.04;
        return;
      }
      if (fase === "chat") {
        pintarChat(now);
        s.arms.forEach((arm, i) => { arm.rotation.x = Math.sin(t * 14 + i * 2.4) * 0.12; });
        if ((now - chat.t0) / 1000 > chat.msgs.length * 3.2 + 8) { fase = "sentado"; proxima = t + 180; s.src2 = null; }   // vuelve a las métricas
      }
    }
    return { update, texto, activo: () => fase !== "sentado", caminando: () => fase === "caminando", walker: w };
  })();

  /* ---------- Tamaño y bucle ---------- */
  function size() {
    // llena el alto que queda de la pantalla debajo del título y la barra de datos
    const top = stage.getBoundingClientRect().top + window.scrollY;
    const W = stage.clientWidth, H = Math.round(W < 700 ? Math.max(W * 1.1, Math.min(W * 1.4, window.innerHeight - top)) : Math.max(420, window.innerHeight - top));
    renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); viewOffset();
  }
  let lastW3 = 0;
  window.addEventListener("resize", () => { if (stage.clientWidth !== lastW3) { lastW3 = stage.clientWidth; size(); } });
  size(); lastW3 = stage.clientWidth;

  const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const col = new THREE.Color();
  let lastNow = 0;
  function loop(now) {
    const t = now / 1000, dt = Math.min(0.05, (now - (lastNow || now)) / 1000); lastNow = now;
    if (GER) GER.update(now, dt);
    if (anim) {
      const k = Math.min(1, (now - anim.s) / anim.d), e = ease(k);
      camera.position.lerpVectors(anim.p0, anim.p1, e); controls.target.lerpVectors(anim.t0, anim.t1, e);
      if (k >= 1) anim = null;
    }
    controls.update();
    rgbMats.forEach((m, i) => m.emissive.setHSL(((t * 0.08) + i * 0.13) % 1, 0.9, 0.5));
    if (!reduce && bossP.userData.head) bossP.userData.head.rotation.y = Math.sin(t * 0.4) * 0.5;
    const sec = Math.floor(t); if (sec % 3 === 0 && sec !== paintBoss.last) { paintBoss.last = sec; paintBoss(); }
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
    renderer.render(scene, camera);
    placeTags(el.clientWidth, el.clientHeight);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
