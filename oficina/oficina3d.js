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
  scene.fog = new THREE.Fog(0x121417, 42, 85);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const HOME = { pos: new THREE.Vector3(12.5, 13, 18.5), target: new THREE.Vector3(-2.2, 0.8, 1.2) };
  camera.position.copy(HOME.pos);
  const controls = new THREE.OrbitControls(camera, el);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.target.copy(HOME.target);
  controls.maxPolarAngle = Math.PI * 0.46; controls.minDistance = 3; controls.maxDistance = 45;
  controls.screenSpacePanning = true;

  scene.add(new THREE.HemisphereLight(0xe9eef4, 0x2a2c30, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(12, 20, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 16, bottom: -16, near: 1, far: 60 });
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
  const RW = 30, RD = 20, WH = 7.2; // ancho (x), fondo (z), alto de muros
  // piso de epoxi claro con vetas de mármol, pulido
  const conc = marble("#e6e1d7", "#b3a791", .7, 16);
  conc.wrapS = conc.wrapT = THREE.RepeatWrapping; conc.repeat.set(3, 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), M(0xc9c4ba, { map: conc, roughness: 0.2, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // muros de microcemento grafito con juntas de panel
  function wallTex(rep) {
    const t = canvasTex(1024, 512, (g, w, h) => {
      g.fillStyle = "#34373c"; g.fillRect(0, 0, w, h); mottle(g, w, h, 900, 23, .06);
      g.fillStyle = "rgba(12,14,16,.5)"; for (let k = 1; k < 4; k++) g.fillRect(k * w / 4 - 1, 0, 2, h);
    });
    t.wrapS = THREE.RepeatWrapping; t.repeat.set(rep, 1); return t;
  }
  box(RW, WH, 0.3, M(0xffffff, { map: wallTex(RW / 8), roughness: 0.85 }), 0, WH / 2, -RD / 2 - 0.15);  // muro del fondo
  box(0.3, WH, RD, M(0xffffff, { map: wallTex(RD / 8), roughness: 0.85 }), -RW / 2 - 0.15, WH / 2, 0);  // muro izquierdo
  box(RW, 0.14, 0.05, M(0x17191c), 0, 0.07, -RD / 2 + 0.03);  // zócalos
  box(0.05, 0.14, RD, M(0x17191c), -RW / 2 + 0.03, 0.07, 0);

  // columnas de acero del hangar
  const steelDk = M(0x1d2023, { metalness: .6, roughness: .4 });
  [-14, -7, 7, 14].forEach(x => box(0.35, WH, 0.3, steelDk, x === -14 ? -14.6 : x, WH / 2, -RD / 2 + 0.16));
  [-5].forEach(z => box(0.3, WH, 0.35, steelDk, -RW / 2 + 0.16, WH / 2, z));

  // LED blanco en los bordes de arriba y en las esquinas
  box(RW, 0.06, 0.08, ledM, 0, WH - 0.12, -RD / 2 + 0.05).castShadow = false;
  box(0.08, 0.06, RD, ledM, -RW / 2 + 0.05, WH - 0.12, 0).castShadow = false;
  [[-RW / 2 + 0.05, -RD / 2 + 0.05], [RW / 2 - 0.04, -RD / 2 + 0.05], [-RW / 2 + 0.05, RD / 2 - 0.04]].forEach(([x, z]) => { box(0.06, WH, 0.06, ledM, x, WH / 2, z).castShadow = false; });
  box(RW, 0.03, 0.05, ledM, 0, 0.16, -RD / 2 + 0.05).castShadow = false;   // línea fina a ras del piso
  box(0.05, 0.03, RD, ledM, -RW / 2 + 0.05, 0.16, 0).castShadow = false;
  [[-10, -RD / 2 + 1], [0, -RD / 2 + 1], [10, -RD / 2 + 1]].forEach(([x, z]) => { const l = new THREE.PointLight(0xffffff, 0.35, 9, 2); l.position.set(x, WH - 0.4, z); scene.add(l); });
  [-6, 4].forEach(z => { const l = new THREE.PointLight(0xffffff, 0.3, 9, 2); l.position.set(-RW / 2 + 1, WH - 0.4, z); scene.add(l); });

  // ventanas altas del hangar con el cielo de noche
  const sky = canvasTex(1024, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#0e1622"); gr.addColorStop(1, "#273444");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,.7)"; for (let i = 0; i < 60; i++) g.fillRect(rnd() * w, rnd() * h * .7, 1.5, 1.5);
  });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(RW - 2, 0.9), new THREE.MeshBasicMaterial({ map: sky }));
  win.position.set(0, WH - 0.75, -RD / 2 + 0.02); scene.add(win);
  for (let x = -RW / 2 + 1; x <= RW / 2 - 1; x += 1.4) box(0.05, 0.9, 0.04, steelDk, x, WH - 0.75, -RD / 2 + 0.05).castShadow = false;
  box(RW - 2, 0.05, 0.05, steelDk, 0, WH - 1.2, -RD / 2 + 0.05);

  // vigas negras del techo con spots
  [-6.5, -1.5, 3.5, 8.5].forEach(z => {
    box(RW, 0.3, 0.16, steelDk, 0, WH - 0.15, z).castShadow = false;
    for (let x = -RW / 2 + 1.5; x < RW / 2; x += 2.5) { const d = cyl(0.07, 0.07, 0.03, ledM, x, WH - 0.31, z, scene, 12); d.castShadow = false; }
  });
  // muro de mármol negro con el nombre del negocio
  const slab = box(9, 3.8, 0.12, M(0xffffff, { map: marbleN, roughness: 0.18, metalness: 0.08 }), 0, 2.45, -RD / 2 + 0.08);
  slab.castShadow = false;
  box(9.1, 0.04, 0.16, ledM, 0, 4.37, -RD / 2 + 0.1).castShadow = false;
  const logo = canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.textAlign = "center";
    g.shadowColor = "rgba(255,255,255,.55)"; g.shadowBlur = 18;
    g.fillStyle = "#EDEEF0"; g.font = "800 112px Archivo, system-ui, sans-serif"; g.fillText("EE.UU. → CBBA", w / 2, 130);
    g.shadowBlur = 0; g.fillStyle = "#A9AFB6"; g.font = "500 34px 'IBM Plex Mono', monospace"; g.fillText("IMPORTACIÓN DE COMPONENTES", w / 2, 200);
  });
  const lg = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshBasicMaterial({ map: logo, transparent: true, toneMapped: false }));
  lg.position.set(0, 3.1, -RD / 2 + 0.16); scene.add(lg);

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
  plant(-RW / 2 + 1, -RD / 2 + 1); plant(5.4, -RD / 2 + 1, 1.1); plant(-5.4, -RD / 2 + 1, 1.1); plant(RW / 2 - 1.2, -RD / 2 + 1.2, 1.2); plant(-14.2, 9.4, .8);

  // Rack de servidores (la nube)
  const rackG = new THREE.Group(); rackG.position.set(-RW / 2 + 1.1, 0, -5.5); scene.add(rackG);
  box(1.2, 2.6, 1, M(0x1e2124, { metalness: .5, roughness: .4 }), 0, 1.3, 0, rackG);
  const leds = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    m.position.set(0.62, 0.4 + i * 0.24, -0.3 + (i % 3) * 0.25); m.rotation.y = Math.PI / 2; rackG.add(m); leds.push(m);
  }

  // lámparas LED lineales colgantes sobre los escritorios
  function ledBar(x, z, len, y, rotY) {
    y = y || 3.72;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g);
    [-len / 2 + 0.2, len / 2 - 0.2].forEach(dx => cyl(0.006, 0.006, WH - y, M(0x0d0d0d), dx, y + (WH - y) / 2, 0, g, 4).castShadow = false);
    box(len, 0.07, 0.12, M(0x141517, { metalness: .6, roughness: .35 }), 0, y, 0, g).castShadow = false;
    box(len - 0.06, 0.012, 0.08, ledM, 0, y - 0.04, 0, g).castShadow = false;
    const l = new THREE.PointLight(0xf4f7ff, 0.55, 7.5, 2); l.position.set(0, y - 0.3, 0); g.add(l);
  }
  [[-9, -4.4], [-2.5, -4.4], [4, -4.4], [10.5, -4.4], [-6, 3.4], [0.8, 3.4]].forEach(([x, z]) => ledBar(x, z, 2.6));

  // Pasillo marcado en el piso
  box(RW - 2, 0.01, 0.05, M(0xd9dde2, { roughness: .5 }), 0, 0.005, 0.6);

  // Zona de almacén (adelante a la derecha): racks bajos con cajas de componentes
  const WZ = new THREE.Group(); WZ.position.set(10.4, 0, 5.8); scene.add(WZ);
  const lineM = M(0xd9dde2, { roughness: .5 });
  [[0, -3.2, 8.2, 0.05], [0, 3.2, 8.2, 0.05], [-4.1, 0, 0.05, 6.4], [4.1, 0, 0.05, 6.4]].forEach(([x, z, w, d]) => box(w, 0.01, d, lineM, x, 0.006, z, WZ));
  const kraft = M(0xb08d5e, { roughness: .9 }), whiteBox = M(0xe6e6e3, { roughness: .8 }), blackSteel = M(0x18191b, { metalness: .6, roughness: .45 });
  function shelf(x, z, rotY) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY || 0; WZ.add(g);
    [[-1.9, -.4], [1.9, -.4], [-1.9, .4], [1.9, .4]].forEach(([sx, sz]) => box(0.06, 2.1, 0.06, blackSteel, sx, 1.05, sz, g));
    [0.12, 0.8, 1.48].forEach((y, k) => {
      box(3.9, 0.04, 0.86, blackSteel, 0, y, 0, g);
      box(3.9, 0.012, 0.04, ledM, 0, y - 0.03, 0.42, g).castShadow = false;
      for (let i = 0; i < 6; i++) { const big = (i + k) % 3 === 0, bw = big ? 0.55 : 0.42, bh = big ? 0.45 : 0.32; box(bw, bh, 0.5, (i + k) % 4 === 1 ? whiteBox : kraft, -1.55 + i * 0.62, y + 0.02 + bh / 2, 0, g); }
    });
    return g;
  }
  shelf(0, -2.4); shelf(0, 0.2);
  const pallet = new THREE.Group(); pallet.position.set(-2.2, 0, 2.3); WZ.add(pallet);
  box(1.2, 0.14, 1.0, M(0x8a7a5e, { roughness: .9 }), 0, 0.07, 0, pallet);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) for (let d = 0; d < 2; d++) box(0.52, 0.36, 0.44, (r + c + d) % 3 ? kraft : whiteBox, -0.28 + c * 0.56, 0.33 + r * 0.38, -0.23 + d * 0.47, pallet);
  const wrap = new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.18, 0.98), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .12, roughness: .1, depthWrite: false }));
  wrap.position.set(0, 0.74, 0); pallet.add(wrap);
  const zoneSign = canvasTex(512, 128, (g, w, h) => { g.fillStyle = "#1c1e21"; g.fillRect(0, 0, w, h); g.fillStyle = "#E9EBEE"; g.font = "700 52px 'IBM Plex Mono', monospace"; g.textAlign = "center"; g.fillText("ALMACÉN · A1", w / 2, 82); });
  const zs = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: zoneSign })); zs.position.set(0, 2.45, -2.4); WZ.add(zs);
  box(0.04, 0.5, 0.04, blackSteel, -0.7, 2.85, -2.4, WZ); box(0.04, 0.5, 0.04, blackSteel, 0.7, 2.85, -2.4, WZ);

  /* ---------- Puestos de trabajo ---------- */
  const STATION = { nube: [-9, -4.6], ebay: [-2.5, -4.6], wa: [4, -4.6], pedidos: [10.5, -4.6], mkt: [-6, 3.2], ana: [0.8, 3.2] };
  const skin = M(0xe7b98f, { roughness: .6 }), hairM = M(0x2b2018), deskM = marbleWM,
    legM = M(0x1f2a33, { metalness: .5, roughness: .4 }), chairM = M(0x2a2d31, { roughness: .8 });
  const ST = {};
  AG.forEach(a => {
    const pos = STATION[a.id]; if (!pos) return;
    const g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]); scene.add(g);
    box(2.6, 0.08, 1.25, deskM, 0, 0.78, 0, g);
    [[-1.2, -.5], [1.2, -.5], [-1.2, .5], [1.2, .5]].forEach(([x, z]) => box(0.06, 0.74, 0.06, legM, x, 0.37, z, g));
    // monitor
    box(0.1, 0.38, 0.08, legM, 0, 1.0, -0.38, g); box(0.4, 0.03, 0.25, legM, 0, 0.83, -0.38, g);
    box(1.62, 0.96, 0.06, M(0x10181f, { metalness: .3, roughness: .4 }), 0, 1.5, -0.42, g);
    const sc = document.createElement("canvas"); sc.width = 1024; sc.height = 576;
    const stex = new THREE.CanvasTexture(sc); stex.encoding = THREE.sRGBEncoding; stex.anisotropy = 4;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 0.86), new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }));
    screen.position.set(0, 1.5, -0.385); g.add(screen);
    // teclado, taza, lámpara de escritorio
    box(0.7, 0.03, 0.22, M(0x1b252d), 0, 0.835, 0.12, g);
    cyl(0.07, 0.06, 0.13, M(0xe8e2d2), 0.85, 0.89, 0.1, g);
    box(0.28, 0.02, 0.2, M(0xeae6dc), -0.8, 0.83, 0.05, g);
    // silla
    const ch = new THREE.Group(); ch.position.set(0, 0, 0.95); g.add(ch);
    box(0.62, 0.1, 0.6, chairM, 0, 0.5, 0, ch); box(0.62, 0.75, 0.08, chairM, 0, 0.95, 0.3, ch);
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
    ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.012, 0.9); g.add(ring);
    const glow = new THREE.PointLight(0x4fd1e8, 0.45, 3.2, 2); glow.position.set(0, 1.5, 0.2); g.add(glow);
    ST[a.id] = { g, screen, stex, sc, ctx: sc.getContext("2d"), torso, headG, arms, ring, glow, src: null, st: null, ver: -1 };
  });


  /* ---------- Entrepiso (penthouse del jefe) sobre el lounge, muro izquierdo ---------- */
  const MZH = 3.0, MX0 = -RW / 2, MX1 = -9.6, MZ0 = -1, MZ1 = RD / 2;   // alto y planta del entrepiso
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
  box(0.04, MZH - 0.3, 6.2, M(0x1b1c1e), -RW / 2 + 0.03, (MZH - 0.3) / 2, 5.6);
  for (let z = 2.6; z <= 8.6; z += 0.11) box(0.06, MZH - 0.3, 0.06, slatM, -RW / 2 + 0.08, (MZH - 0.3) / 2, z).castShadow = false;
  const tvArt = canvasTex(1024, 576, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#2b5f9e"); gr.addColorStop(.5, "#6a8fc7"); gr.addColorStop(1, "#1d2c4a");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,.85)"; g.font = "800 72px Archivo, sans-serif"; g.fillText("EE.UU. → CBBA", 60, 300);
    g.fillStyle = "rgba(255,255,255,.6)"; g.font = "500 30px 'IBM Plex Mono', monospace"; g.fillText("ronda de hoy · precios · envíos", 64, 350);
  });
  box(0.08, 1.45, 2.5, M(0x0a0a0b, { metalness: .4, roughness: .3 }), -RW / 2 + 0.16, 1.5, 5.6);
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.35), new THREE.MeshBasicMaterial({ map: tvArt, toneMapped: false }));
  tv.rotation.y = Math.PI / 2; tv.position.set(-RW / 2 + 0.21, 1.5, 5.6); scene.add(tv);
  box(0.45, 0.4, 2.8, M(0x1a1b1d, { roughness: .5 }), -RW / 2 + 0.35, 0.2, 5.6);
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
  box(0.05, MZH - 0.4, 2.8, nero, -RW / 2 + 0.03, (MZH - 0.4) / 2 + 0.05, 0.6).castShadow = false;
  box(0.65, 0.9, 2.8, M(0x23262a, { roughness: .5 }), -RW / 2 + 0.35, 0.45, 0.6);
  box(0.75, 0.05, 2.9, nero, -RW / 2 + 0.38, 0.92, 0.6);
  box(0.6, 0.02, 2.6, ledM, -RW / 2 + 0.36, 0.88, 0.6).castShadow = false;
  [-0.3, 0.6, 1.5].forEach(z => { cyl(0.2, 0.2, 0.06, M(0x15161a), -13.8, 0.75, z, scene, 20); cyl(0.03, 0.03, 0.72, M(0x15161a, { metalness: .6 }), -13.8, 0.38, z, scene, 8); cyl(0.2, 0.2, 0.02, M(0x15161a, { metalness: .6 }), -13.8, 0.01, z, scene, 20); });

  /* ---------- Exhibición: auto con postes y cordón (adelante al centro) ---------- */
  const car = new THREE.Group(); car.position.set(-2.4, 0, 8.0); car.rotation.y = -0.25; scene.add(car);
  const paint = M(0x1a0f24, { metalness: .8, roughness: .28 }), carb = M(0x0f0f12, { metalness: .4, roughness: .35 }), yel = M(0xf2c230, { roughness: .4 });
  const prof = new THREE.Shape([[-2.2, 0.26], [-2.3, 0.6], [-2.0, 0.72], [-1.0, 0.78], [0.4, 0.8], [1.3, 0.7], [2.1, 0.5], [2.3, 0.34], [2.22, 0.26]].map(([x, y]) => new THREE.Vector2(x, y)));
  const bodyG = new THREE.ExtrudeGeometry(prof, { depth: 1.84, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 4 });
  bodyG.translate(0, 0, -0.93);
  const body = new THREE.Mesh(bodyG, paint); body.castShadow = true; body.receiveShadow = true; car.add(body);
  const cab = new THREE.Shape([[-1.05, 0.74], [-0.45, 1.1], [0.3, 1.13], [1.15, 0.74]].map(([x, y]) => new THREE.Vector2(x, y)));
  const cabinG = new THREE.ExtrudeGeometry(cab, { depth: 1.16, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 4 }); cabinG.translate(0, 0, -0.58);
  car.add(new THREE.Mesh(cabinG, M(0x08090b, { metalness: .9, roughness: .08 })));
  [-0.98, 0.98].forEach(z => { box(3.4, 0.05, 0.02, yel, 0.1, 0.36, z, car); });
  box(1.0, 0.03, 0.05, yel, 1.7, 0.81, 0, car);
  box(0.5, 0.05, 1.9, carb, -2.05, 1.15, 0, car); [-0.6, 0.6].forEach(z => box(0.05, 0.3, 0.05, carb, -2.0, 0.98, z, car));
  [[2.12, 0.62, 0.62], [2.12, 0.62, -0.62]].forEach(([x, y, z]) => { const l = box(0.06, 0.05, 0.36, ledM, x, y, z, car); l.castShadow = false; });
  box(0.04, 0.04, 1.6, new THREE.MeshBasicMaterial({ color: 0xff2a3a, toneMapped: false }), -2.3, 0.62, 0, car);
  [[1.35, 0.98], [1.35, -0.98], [-1.35, 0.98], [-1.35, -0.98]].forEach(([x, z]) => {
    const t = cyl(0.37, 0.37, 0.3, M(0x0d0d0d, { roughness: .8 }), x, 0.37, z, car, 28); t.rotation.x = Math.PI / 2;
    const r = cyl(0.27, 0.27, 0.31, M(0xb9bec4, { metalness: .9, roughness: .25 }), x, 0.37, z + Math.sign(z) * 0.01, car, 10); r.rotation.x = Math.PI / 2;
    const c = cyl(0.12, 0.12, 0.32, yel, x, 0.37, z + Math.sign(z) * 0.02, car, 16); c.rotation.x = Math.PI / 2;
  });
  const spotC = new THREE.SpotLight(0xffffff, 0.9, 12, 0.45, 0.5, 1.5); spotC.position.set(-2.4, 6.5, 8.0); spotC.target = car; scene.add(spotC);
  // postes con cordón negro alrededor del auto
  const posts = [[-5.4, 6.0], [-2.4, 5.6], [0.6, 6.0], [1.2, 8.4], [0.6, 10.6 - 0.9], [-5.4, 9.7], [-6.0, 7.9]];
  const postM = M(0x101113, { metalness: .7, roughness: .3 });
  posts.forEach(([x, z]) => { cyl(0.2, 0.2, 0.04, postM, x, 0.02, z, scene, 20); cyl(0.03, 0.03, 0.95, postM, x, 0.5, z, scene, 8); const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), postM); b.position.set(x, 1.0, z); scene.add(b); });
  posts.forEach(([x, z], i) => {
    const [x2, z2] = posts[(i + 1) % posts.length];
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 0.9, z), new THREE.Vector3((x + x2) / 2, 0.6, (z + z2) / 2), new THREE.Vector3(x2, 0.9, z2));
    const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.02, 6, false), M(0x141416, { roughness: .9 })); scene.add(rope);
  });

  /* ---------- Gym compacto (entre el auto y el almacén) ---------- */
  const gym = new THREE.Group(); gym.position.set(4.6, 0, 7.6); scene.add(gym);
  const gmat = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.03, 4.2), M(0x1b1d20, { roughness: 1 })); gmat.position.y = 0.015; gmat.receiveShadow = true; gym.add(gmat);
  const steel = M(0x9aa3ab, { metalness: .85, roughness: .3 }), black = M(0x141414, { roughness: .6 });
  // saco de boxeo colgado de un pórtico negro
  [-1.25, 1.25].forEach(dx => box(0.1, 3.0, 0.1, black, dx, 1.5, -1.3, gym)); box(2.6, 0.1, 0.1, black, 0, 3.0, -1.3, gym);
  cyl(0.006, 0.006, 0.5, M(0x777777), 0, 2.72, -1.3, gym, 4);
  cyl(0.24, 0.24, 1.2, M(0xe8e6e1, { roughness: .7 }), 0, 1.85, -1.3, gym, 24);
  // rack de mancuernas y banco
  box(0.5, 0.06, 1.8, black, 1.0, 0.45, 0.9, gym); box(0.5, 0.06, 1.8, black, 1.0, 0.8, 0.9, gym);
  [0.05, 1.75].forEach(dz => box(0.5, 0.85, 0.06, black, 1.0, 0.42, dz, gym));
  for (let row = 0; row < 2; row++) for (let k = 0; k < 4; k++) {
    const z = 0.3 + k * 0.42, y = 0.55 + row * 0.35, r = 0.06 + k * 0.012;
    const hd = cyl(0.022, 0.022, 0.3, steel, 1.0, y, z, gym, 8); hd.rotation.z = Math.PI / 2;
    [-0.14, 0.14].forEach(dx => { const w = cyl(r, r, 0.06, black, 1.0 + dx, y, z, gym, 12); w.rotation.z = Math.PI / 2; });
  }
  box(0.38, 0.1, 1.3, M(0x2b2d31, { roughness: .6 }), -0.5, 0.48, 0.9, gym);
  box(0.06, 0.44, 0.06, steel, -0.5, 0.22, 0.4, gym); box(0.06, 0.44, 0.06, steel, -0.5, 0.22, 1.4, gym);

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
  ledBar(-12.75, 4.6, 2.8, MZH + 1.9, Math.PI / 2);
  const darkWood = M(0xffffff, { map: marbleN, roughness: .18, metalness: .06 });
  box(3.4, 0.1, 1.5, darkWood, 0, 0.8, 0, boss); box(3.4, 0.7, 0.08, darkWood, 0, 0.4, -0.7, boss);
  box(0.08, 0.75, 1.4, darkWood, -1.66, 0.38, 0, boss); box(0.08, 0.75, 1.4, darkWood, 1.66, 0.38, 0, boss);
  const bossScreens = [];
  [-0.82, 0.82].forEach((x, i) => {
    box(1.5, 0.9, 0.06, M(0x10181f, { metalness: .3, roughness: .4 }), x, 1.5, -0.45, boss);
    const c = document.createElement("canvas"); c.width = 768; c.height = 432;
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.8), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    m.position.set(x, 1.5, -0.415); boss.add(m); bossScreens.push({ c, t, i });
    box(0.08, 0.36, 0.08, legM, x, 1.0, -0.45, boss);
  });
  cyl(0.07, 0.06, 0.13, M(0x1b1b1b), 1.35, 0.92, 0.2, boss);
  cyl(0.05, 0.12, 0.28, M(0xd4af37, { metalness: .9, roughness: .25 }), -1.4, 1.0, 0.25, boss);
  const bossChair = new THREE.Group(); bossChair.position.set(0, 0, 0.95); boss.add(bossChair);
  const leather = M(0x231a14, { roughness: .5 });
  box(0.8, 0.14, 0.75, leather, 0, 0.52, 0, bossChair); box(0.8, 1.15, 0.14, leather, 0, 1.15, 0.36, bossChair);
  cyl(0.05, 0.05, 0.42, legM, 0, 0.26, 0, bossChair, 8); cyl(0.38, 0.38, 0.04, legM, 0, 0.04, 0, bossChair, 5);
  const bossP = person(boss, 0, 0.92, 0x111111, 1.08);
  function paintBoss() {
    bossScreens.forEach(({ c, t, i }) => {
      const g = c.getContext("2d"); g.fillStyle = "#07111A"; g.fillRect(0, 0, 768, 432);
      g.fillStyle = "#12293A"; g.fillRect(0, 0, 768, 50); g.fillStyle = "#D8E8F2"; g.font = "700 26px Archivo, sans-serif";
      if (i === 0) {
        g.fillText("Qué conviene traer", 18, 34);
        (typeof ranking !== "undefined" ? ranking : []).slice(0, 6).forEach((r, k) => {
          const m = r.c.margin; g.fillStyle = m >= .15 ? "#5CD69A" : m >= .05 ? "#F2A541" : "#F07A7A";
          g.fillRect(250, 78 + k * 56, Math.max(4, Math.min(1, Math.abs(m) / .4) * 480), 30);
          g.fillStyle = "#D8E8F2"; g.font = "600 21px Archivo, sans-serif"; g.fillText(short(r.p.name).slice(0, 18), 16, 100 + k * 56);
          g.font = "600 19px 'IBM Plex Mono', monospace"; g.fillText(`${(m * 100).toFixed(0)}%`, 256, 100 + k * 56);
        });
      } else {
        g.fillText("Agentes", 18, 34);
        AG.forEach((a, k) => {
          const st = STATES[a.state]; g.fillStyle = st.c; g.beginPath(); g.arc(30, 92 + k * 54, 11, 0, 7); g.fill();
          g.fillStyle = "#D8E8F2"; g.font = "600 22px Archivo, sans-serif"; g.fillText(a.name, 52, 100 + k * 54);
          g.fillStyle = "#7F9AAD"; g.font = "500 18px 'IBM Plex Mono', monospace"; g.fillText(String(a.liveText || st.t).slice(0, 38), 260, 100 + k * 54);
        });
      }
      t.needsUpdate = true;
    });
  }

  // Archivero de documentos
  const cabG = new THREE.Group(); cabG.position.set(12.4, 0, -6.8); scene.add(cabG);
  box(1.1, 1.9, 0.8, M(0x3a3e43, { metalness: .4, roughness: .45 }), 0, 0.95, 0, cabG);
  for (let k = 0; k < 3; k++) {
    box(0.98, 0.52, 0.04, M(0x2c2f33, { metalness: .35 }), 0, 0.35 + k * 0.6, 0.42, cabG);
    box(0.3, 0.05, 0.05, M(0xc9a35a, { metalness: .6, roughness: .3 }), 0, 0.45 + k * 0.6, 0.46, cabG);
  }
  ST.docs = { g: cabG };
  ST.jefe = { g: boss };

  /* ---------- Pantallas: la captura del agente, atenuada si está en espera ---------- */
  function paintScreen(a, s, t) {
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
      else tmp.set(0, 2.25, 0.9).applyMatrix4(s.g.matrixWorld);
      tmp.project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15;
      b.hidden = !vis; if (!vis) return;
      b.style.transform = `translate(${((tmp.x + 1) / 2 * W).toFixed(1)}px,${((1 - tmp.y) / 2 * H).toFixed(1)}px) translate(-50%,-100%)`;
      if (id === "jefe") {
        b.querySelector(".nm").textContent = "Santi · jefe"; b.style.setProperty("--c", "#F2A541");
        b.querySelector("small").textContent = LIVE_ON ? "viendo la ronda en vivo" : "supervisando";
      } else if (id === "docs") {
        b.querySelector(".nm").textContent = `Documentos · ${D.documentos.length}`; b.style.setProperty("--c", "#C9A35A");
        b.querySelector("small").textContent = "";
      } else {
        const a = AG.find(x => x.id === id), st = STATES[a.state];
        b.style.setProperty("--c", st.c); b.querySelector(".nm").textContent = a.name;
        const extra = a.liveText ? a.liveText : a.state === "sleep" ? "zZ · en espera" : a.state === "done" ? "✓ trabajó hoy" : a.state === "waiting" ? "… esperando respuestas" : a.state === "working" ? "trabajando" : "";
        b.querySelector("small").textContent = extra;
      }
      b.classList.toggle("on", open && sel === id);
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
    if (open && sel === id) { if (id === "pedidos" && window.abrirMapa) { window.abrirMapa(); return; } close3D(); return; }
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
  $("zout").onclick = () => { const d = camera.position.clone().sub(controls.target).multiplyScalar(1.3); if (d.length() < 45) camera.position.copy(controls.target).add(d); };

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

  /* ---------- Tamaño y bucle ---------- */
  function size() {
    const W = stage.clientWidth, H = Math.round(Math.max(380, Math.min(window.innerHeight * 0.74, W * 0.6)));
    renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); viewOffset();
  }
  let lastW3 = 0;
  window.addEventListener("resize", () => { if (stage.clientWidth !== lastW3) { lastW3 = stage.clientWidth; size(); } });
  size(); lastW3 = stage.clientWidth;

  const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const col = new THREE.Color();
  function loop(now) {
    const t = now / 1000;
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
      if (src !== s.src || a.state !== s.st || (src && !s.loaded && (src.naturalWidth || src.width))) {
        s.src = src; s.st = a.state; s.loaded = !!(src && (src.naturalWidth || src.width)); paintScreen(a, s, t);
      }
      const st = STATES[a.state]; col.set(st.c);
      s.ring.material.color.copy(col);
      s.ring.material.opacity = a.state === "working" && !reduce ? 0.35 + 0.2 * Math.sin(t * 4) : (open && sel === a.id ? 0.6 : 0.32);
      s.glow.color.copy(col); s.glow.intensity = a.state === "sleep" ? 0.15 : a.state === "alert" && Math.floor(t * 2) % 2 ? 1.2 : 0.6;
      const work = a.state === "working" && !reduce, sleep = a.state === "sleep";
      s.arms.forEach((arm, i) => { arm.rotation.x = work ? Math.sin(t * 14 + i * 2.4) * 0.12 : sleep ? 0.35 : 0; });
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
