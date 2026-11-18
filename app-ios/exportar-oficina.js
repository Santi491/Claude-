// Exporta la escena 3D de la oficina (sin personas) a oficina.json + oficina.bin + texturas PNG para la app nativa.
(function () {
  const subir = (ruta, cuerpo, tipo) => fetch("/guardar/" + ruta, { method: "POST", body: cuerpo, headers: { "Content-Type": tipo || "application/octet-stream" } });
  async function exportar() {
    const esc = window.__escena;
    if (!esc) { document.title = "SIN ESCENA"; return; }
    esc.updateMatrixWorld(true);
    const partes = [], geos = new Map(), mats = new Map(), texs = new Map(), nodos = [], luces = [];
    let off = 0;
    const meter = (arr) => { const b = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); const o = off; partes.push(b); off += b.byteLength; const pad = (4 - (off % 4)) % 4; if (pad) { partes.push(new Uint8Array(pad)); off += pad; } return o; };
    function esPersona(o) { for (let p = o; p; p = p.parent) if (p.userData && p.userData.persona) return true; return false; }
    function visible(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
    async function tex(t) {
      if (!t || !t.image) return null;
      if (texs.has(t.uuid)) return texs.get(t.uuid).id;
      const id = "t" + texs.size;
      let c = t.image;
      if (!(c instanceof HTMLCanvasElement)) { const k = document.createElement("canvas"); k.width = c.width || c.naturalWidth; k.height = c.height || c.naturalHeight; k.getContext("2d").drawImage(c, 0, 0); c = k; }
      const blob = await new Promise(r => c.toBlob(r, "image/png"));
      await subir("tex/" + id + ".png", blob, "image/png");
      texs.set(t.uuid, { id, repeat: [t.repeat.x, t.repeat.y], offset: [t.offset.x, t.offset.y], wrap: t.wrapS === THREE.RepeatWrapping });
      return id;
    }
    async function mat(m) {
      if (mats.has(m.uuid)) return mats.get(m.uuid).id;
      const id = "m" + mats.size;
      const e = { id, tipo: m.type, color: m.color ? m.color.toArray() : [1, 1, 1], opacidad: m.opacity, transparente: !!m.transparent,
        doble: m.side === THREE.DoubleSide, atras: m.side === THREE.BackSide, rough: m.roughness ?? 1, metal: m.metalness ?? 0,
        emisivo: m.emissive ? m.emissive.toArray() : null, emisivoI: m.emissiveIntensity ?? 1, plano: !!m.flatShading,
        mapa: await tex(m.map), mapaEmisivo: await tex(m.emissiveMap), escribeProf: m.depthWrite !== false };
      if (e.mapa) e.mapaInfo = texs.get(m.map.uuid);
      mats.set(m.uuid, e); return id;
    }
    function geo(g) {
      if (geos.has(g.uuid)) return geos.get(g.uuid).id;
      const id = "g" + geos.size, a = g.attributes;
      const e = { id, n: a.position.count, pos: meter(new Float32Array(a.position.array)) };
      if (a.normal) e.nor = meter(new Float32Array(a.normal.array));
      if (a.uv) e.uv = meter(new Float32Array(a.uv.array));
      if (g.index) { e.idx = meter(new Uint32Array(g.index.array)); e.ni = g.index.count; }
      e.grupos = (g.groups || []).map(x => [x.start, x.count, x.materialIndex]);
      geos.set(g.uuid, e); return id;
    }
    const lista = [];
    esc.traverse(o => lista.push(o));
    for (const o of lista) {
      if (o.isLight && visible(o)) {
        const l = { tipo: o.type, color: o.color.toArray(), i: o.intensity, m: o.matrixWorld.toArray() };
        if (o.isPointLight) { l.dist = o.distance; l.decay = o.decay; }
        if (o.isHemisphereLight) l.suelo = o.groundColor.toArray();
        if (o.isDirectionalLight && o.target) { o.target.updateMatrixWorld(true); l.objetivo = new THREE.Vector3().setFromMatrixPosition(o.target.matrixWorld).toArray(); l.sombra = !!o.castShadow; }
        luces.push(l); continue;
      }
      if (!o.isMesh || o.isSkinnedMesh || !visible(o) || esPersona(o)) continue;
      if (!o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) continue;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const ids = []; for (const m of ms) ids.push(await mat(m));
      nodos.push({ g: geo(o.geometry), m: ids, x: o.matrixWorld.toArray(), som: !!o.castShadow, rec: !!o.receiveShadow, nombre: o.name || "" });
    }
    const bin = new Uint8Array(off); let p = 0; for (const b of partes) { bin.set(b, p); p += b.byteLength; }
    await subir("oficina.bin", bin);
    const fondo = esc.background && esc.background.isColor ? esc.background.toArray() : null;
    await subir("oficina.json", JSON.stringify({ geometrias: [...geos.values()], materiales: [...mats.values()], nodos, luces, fondo,
      niebla: esc.fog ? { color: esc.fog.color.toArray(), cerca: esc.fog.near, lejos: esc.fog.far } : null }), "application/json");
    document.title = `LISTO ${nodos.length} nodos ${geos.size} geos ${mats.size} mats ${texs.size} texs ${off} bytes ${luces.length} luces`;
  }
  setTimeout(() => exportar().catch(e => { document.title = "ERROR " + e; }), 15000);
})();
