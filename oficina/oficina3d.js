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
  renderer.toneMappingExposure = 1.08;
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

  /* ---------- Escena, cámara, luces ---------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a141d);
  scene.fog = new THREE.Fog(0x0a141d, 38, 75);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const HOME = { pos: new THREE.Vector3(13.5, 11.5, 15.5), target: new THREE.Vector3(-0.5, 0.4, 0.8) };
  camera.position.copy(HOME.pos);
  const controls = new THREE.OrbitControls(camera, el);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.target.copy(HOME.target);
  controls.maxPolarAngle = Math.PI * 0.46; controls.minDistance = 3; controls.maxDistance = 45;
  controls.screenSpacePanning = true;

  scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x2a2018, 0.5));
  const sun = new THREE.DirectionalLight(0xffeedd, 0.85);
  sun.position.set(12, 20, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 16, bottom: -16, near: 1, far: 60 });
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6fa8ff, 0.25); fill.position.set(-14, 8, 14); scene.add(fill);

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

  /* ---------- Sala amplia ---------- */
  const RW = 30, RD = 20, WH = 5.2; // ancho (x), fondo (z), alto de muros
  const wood = canvasTex(1024, 1024, (g, w, h) => {
    const ph = 64;
    for (let y = 0; y < h; y += ph) {
      let x = -((y / ph) % 2) * 180;
      while (x < w) {
        const len = 260 + Math.random() * 200, l = 28 + Math.random() * 10;
        g.fillStyle = `hsl(28, 32%, ${l}%)`; g.fillRect(x, y, len, ph - 2);
        g.fillStyle = "rgba(0,0,0,.06)"; for (let k = 0; k < 6; k++) g.fillRect(x, y + Math.random() * ph, len, 1);
        x += len + 2;
      }
    }
  });
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(3, 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), M(0xffffff, { map: wood, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const wallMat = M(0x1c3346, { roughness: 0.9 });
  box(RW, WH, 0.3, wallMat, 0, WH / 2, -RD / 2 - 0.15);           // muro del fondo
  box(0.3, WH, RD, wallMat, -RW / 2 - 0.15, WH / 2, 0);           // muro izquierdo
  box(RW, 0.18, 0.06, M(0x10202d), 0, 0.09, -RD / 2 + 0.03);      // zócalos
  box(0.06, 0.18, RD, M(0x10202d), -RW / 2 + 0.03, 0.09, 0);

  // Ventanales con la ciudad de noche
  const city = canvasTex(1024, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#0b1a2e"); sky.addColorStop(1, "#24364f");
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = "#3a4f6b"; g.beginPath(); g.moveTo(0, h * .62);
    for (let x = 0; x <= w; x += 40) g.lineTo(x, h * .55 + Math.sin(x / 90) * 30); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    for (let i = 0; i < 26; i++) {
      const bw = 30 + Math.random() * 60, bh = 80 + Math.random() * 220, bx = Math.random() * w;
      g.fillStyle = "#121f30"; g.fillRect(bx, h - bh, bw, bh);
      for (let k = 0; k < 18; k++) { g.fillStyle = Math.random() < .55 ? "#f2c46d" : "#34506e"; g.fillRect(bx + 4 + Math.random() * (bw - 10), h - bh + 6 + Math.random() * (bh - 14), 4, 6); }
    }
  });
  [-9, 0, 9].forEach(x => {
    box(7.2, 2.9, 0.12, M(0x0c1825), x, 2.75, -RD / 2 + 0.05);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 2.5), new THREE.MeshBasicMaterial({ map: city }));
    glass.position.set(x, 2.75, -RD / 2 + 0.12); scene.add(glass);
    box(0.08, 2.5, 0.1, M(0x0c1825), x, 2.75, -RD / 2 + 0.14);
  });

  // Cuadro en el muro izquierdo (espacio para decorar después)
  const poster = canvasTex(768, 512, (g, w, h) => {
    g.fillStyle = "#0e2232"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#F2A541"; g.lineWidth = 10; g.strokeRect(20, 20, w - 40, h - 40);
    g.fillStyle = "#D8E8F2"; g.font = "800 92px Archivo, system-ui, sans-serif"; g.textAlign = "center";
    g.fillText("EE.UU. → CBBA", w / 2, h / 2 + 10);
    g.fillStyle = "#4FD1E8"; g.font = "600 34px 'IBM Plex Mono', monospace"; g.fillText("importación de componentes", w / 2, h / 2 + 70);
  });
  const pst = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.4), new THREE.MeshBasicMaterial({ map: poster }));
  pst.rotation.y = Math.PI / 2; pst.position.set(-RW / 2 + 0.05, 2.8, -1); scene.add(pst);

  // Lámparas colgantes
  [[-8, -3.5], [0, -3.5], [8, -3.5], [-5, 4.5], [3, 4.5]].forEach(([x, z]) => {
    cyl(0.01, 0.01, 1.6, M(0x222222), x, 4.4, z, scene, 6);
    const shade = cyl(0.18, 0.5, 0.35, M(0x1d2a33, { metalness: .3 }), x, 3.5, z);
    shade.castShadow = false;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
    bulb.position.set(x, 3.33, z); scene.add(bulb);
    const pl = new THREE.PointLight(0xffd59a, 0.55, 7, 2); pl.position.set(x, 3.2, z); scene.add(pl);
  });

  /* ---------- Muebles y decoración ---------- */
  function plant(x, z, s) {
    s = s || 1;
    cyl(0.32 * s, 0.24 * s, 0.6 * s, M(0x3b4a55), x, 0.3 * s, z);
    const leaf = M(0x2f8f5b, { roughness: .8 });
    [[0, 1.05, 0, .55], [.25, .9, .15, .4], [-.22, .95, -.1, .42], [.05, 1.35, -.05, .38]].forEach(([dx, dy, dz, r]) => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 0), leaf);
      m.position.set(x + dx * s, dy * s, z + dz * s); m.castShadow = true; scene.add(m);
    });
  }
  plant(-RW / 2 + 1, -RD / 2 + 1); plant(RW / 2 - 1.2, -RD / 2 + 1.2, 1.2); plant(-RW / 2 + 1, RD / 2 - 1.5, .9);

  // Rack de servidores (la nube)
  const rackG = new THREE.Group(); rackG.position.set(-RW / 2 + 1.1, 0, -5.5); scene.add(rackG);
  box(1.2, 2.6, 1, M(0x1a2733, { metalness: .4, roughness: .5 }), 0, 1.3, 0, rackG);
  const leds = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0x4fd1e8 }));
    m.position.set(0.62, 0.4 + i * 0.24, -0.3 + (i % 3) * 0.25); m.rotation.y = Math.PI / 2; rackG.add(m); leds.push(m);
  }

  // Pasillo marcado en el piso
  const strip = M(0xf2a541, { emissive: 0x3a2610, roughness: .6 });
  box(RW - 2, 0.01, 0.06, strip, 0, 0.005, 0.6);

  /* ---------- Puestos de trabajo ---------- */
  const STATION = { nube: [-9, -4.6], ebay: [-2.5, -4.6], wa: [4, -4.6], pedidos: [10.5, -4.6], mkt: [-6, 3.2], ana: [0.8, 3.2] };
  const skin = M(0xe7b98f, { roughness: .6 }), hairM = M(0x2b2018), deskM = M(0x6b4a33, { roughness: .55 }),
    legM = M(0x1f2a33, { metalness: .5, roughness: .4 }), chairM = M(0x222d36, { roughness: .8 });
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
    const glow = new THREE.PointLight(0x4fd1e8, 0.6, 3.2, 2); glow.position.set(0, 1.5, 0.2); g.add(glow);
    ST[a.id] = { g, screen, stex, sc, ctx: sc.getContext("2d"), torso, headG, arms, ring, glow, src: null, st: null, ver: -1 };
  });


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
  // Escritorio del jefe (centro, mirando a los agentes)
  const boss = new THREE.Group(); boss.position.set(-1, 0, 7.4); scene.add(boss);
  const darkWood = M(0x3d2a1e, { roughness: .45 });
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

  // Rincón gym (adelante a la izquierda)
  const gym = new THREE.Group(); gym.position.set(-11.3, 0, 6.6); scene.add(gym);
  const gmat = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.04, 5.2), M(0x16191d, { roughness: 1 })); gmat.position.y = 0.02; gmat.receiveShadow = true; gym.add(gmat);
  const steel = M(0x9aa3ab, { metalness: .85, roughness: .3 }), black = M(0x141414, { roughness: .6 }), red = M(0xb3262d, { roughness: .6 });
  box(2.4, 0.06, 0.5, black, -0.6, 0.45, -2.1, gym); box(2.4, 0.06, 0.5, black, -0.6, 0.85, -2.1, gym);
  [-1.75, 0.55].forEach(x => box(0.06, 0.9, 0.5, black, x, 0.45, -2.1, gym));
  for (let row = 0; row < 2; row++) for (let k = 0; k < 5; k++) {
    const x = -1.5 + k * 0.45, y = 0.56 + row * 0.4, r = 0.06 + k * 0.012;
    const hd = cyl(0.025, 0.025, 0.32, steel, x, y, -2.1, gym, 8); hd.rotation.x = Math.PI / 2;
    [-0.16, 0.16].forEach(dz => { const w = cyl(r, r, 0.07, black, x, y, -2.1 + dz, gym, 12); w.rotation.x = Math.PI / 2; });
  }
  box(0.4, 0.1, 1.3, red, 1.3, 0.48, 0.4, gym); box(0.06, 0.44, 0.06, steel, 1.3, 0.22, -0.1, gym); box(0.06, 0.44, 0.06, steel, 1.3, 0.22, 0.9, gym);
  [-0.75, 0.75].forEach(dx => box(0.08, 2.2, 0.08, black, 1.3 + dx, 1.1, -1.4, gym));
  const bar = cyl(0.025, 0.025, 2.1, steel, 1.3, 1.45, -1.4, gym, 10); bar.rotation.z = Math.PI / 2;
  [-0.9, 0.9].forEach(dx => { const pl = cyl(0.24, 0.24, 0.07, black, 1.3 + dx, 1.45, -1.4, gym, 24); pl.rotation.z = Math.PI / 2; });
  [[-1.8, 1.4, 0.13], [-1.4, 1.5, 0.11], [-1.05, 1.45, 0.09]].forEach(([x, z, r]) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), black); b.position.set(x, r, z); b.castShadow = true; gym.add(b);
    const hd = new THREE.Mesh(new THREE.TorusGeometry(r * 0.6, r * 0.14, 8, 16, Math.PI), black); hd.position.set(x, r * 1.75, z); gym.add(hd);
  });
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.1), M(0x9db8cc, { metalness: .25, roughness: .12, emissive: 0x24384a, emissiveIntensity: .6 }));
  mirror.rotation.y = Math.PI / 2; mirror.position.set(-RW / 2 + 0.06, 1.6, 6.8); scene.add(mirror);
  const gymSign = canvasTex(512, 160, (g, w, h) => { g.fillStyle = "#0E1A24"; g.fillRect(0, 0, w, h); g.fillStyle = "#F2A541"; g.font = "900 96px Archivo, sans-serif"; g.textAlign = "center"; g.fillText("GYM", w / 2, 116); });
  const gs = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: gymSign })); gs.rotation.y = Math.PI / 2; gs.position.set(-RW / 2 + 0.07, 3.15, 6.8); scene.add(gs);


  /* ---------- Oficina de vidrio del jefe ---------- */
  const glassM = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const frameM = M(0x1a2632, { metalness: .6, roughness: .35 });
  function glassWall(x1, z1, x2, z2) {
    const len = Math.hypot(x2 - x1, z2 - z1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, ang = Math.atan2(z2 - z1, x2 - x1);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.5), glassM); g.position.set(cx, 1.3, cz); g.rotation.y = -ang; scene.add(g);
    [0.04, 2.56].forEach(y => { const f = box(len, 0.06, 0.06, frameM, cx, y, cz); f.rotation.y = -ang; });
  }
  glassWall(-3.7, 6.0, 1.7, 6.0); glassWall(-3.7, 6.0, -3.7, 9.8); glassWall(1.7, 6.0, 1.7, 8.0);
  const plate = canvasTex(512, 128, (g, w, h) => { g.fillStyle = "rgba(10,20,30,.85)"; g.fillRect(0, 0, w, h); g.fillStyle = "#F2A541"; g.font = "800 64px Archivo, sans-serif"; g.textAlign = "center"; g.fillText("SANTI · CEO", w / 2, 86); });
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: plate, transparent: true })); pl.position.set(-1, 2.15, 5.98); pl.rotation.y = Math.PI; scene.add(pl);
  const pl2 = pl.clone(); pl2.rotation.y = 0; pl2.position.z = 6.02; scene.add(pl2);
  const orug = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.02, 3.2), M(0x2c2236, { roughness: 1 })); orug.position.set(-1, 0.01, 7.9); orug.receiveShadow = true; scene.add(orug);
  plant(-3.2, 9.3, 0.9);

  // Archivero de documentos
  const cabG = new THREE.Group(); cabG.position.set(12.4, 0, -6.8); scene.add(cabG);
  box(1.1, 1.9, 0.8, M(0x6e7f8c, { metalness: .35, roughness: .5 }), 0, 0.95, 0, cabG);
  for (let k = 0; k < 3; k++) {
    box(0.98, 0.52, 0.04, M(0x4a5b68, { metalness: .3 }), 0, 0.35 + k * 0.6, 0.42, cabG);
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
    const pos = id === "docs" ? tgt.clone().add(new THREE.Vector3(-1.5, 1.2, 3.6)) : tgt.clone().add(new THREE.Vector3(1.2, 0.9, 3.4));
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
    leds.forEach((l, i) => { l.material.color.setHex(((Math.floor(t * 2.5) + i) % 3) ? 0x4fd1e8 : 0x1f4a5a); });
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
