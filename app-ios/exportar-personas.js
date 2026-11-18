// Exporta las personas de Mixamo de la oficina (cuerpo con esqueleto + animaciones ya preparadas por la oficina web,
// grabadas hueso por hueso a 30 cuadros por segundo) para la app nativa.
(function () {
  const subir = (ruta, cuerpo, tipo) => fetch("/guardar/" + ruta, { method: "POST", body: cuerpo, headers: { "Content-Type": tipo || "application/octet-stream" } });
  const CLIPS = [["teclear", true], ["sentado", true], ["quieto", false], ["caminar", false], ["cafe", false], ["hablar", false],
                 ["celular", false], ["pensar", false], ["pesas", false], ["estirarse", false], ["reir_sentado", true], ["sentarse", false], ["pararse", false]];
  const FPS = 30;
  async function exportarModelo(idx, p) {
    const o = p.model, partes = []; let off = 0;
    const meter = (arr) => { const b = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); const q = off; partes.push(b); off += b.byteLength; const pad = (4 - (off % 4)) % 4; if (pad) { partes.push(new Uint8Array(pad)); off += pad; } return q; };
    const mallas = []; o.traverse(c => { if (c.isSkinnedMesh) mallas.push(c); });
    const huesos = [], indice = new Map();
    mallas.forEach(m => m.skeleton.bones.forEach(b => { if (!indice.has(b)) { indice.set(b, huesos.length); huesos.push(b); } }));
    const tmp = new THREE.Matrix4(), pos = new THREE.Vector3(), qua = new THREE.Quaternion(), esc = new THREE.Vector3();
    function grabar(qArr, tArr, sArr, f) {
      o.updateMatrixWorld(true);
      // three.js: vértice = mallaMundo · bindInversa · Σ huesoMundo · huesoInversa · bind · v. Lo que va a la izquierda
      // (L = modeloInversa · mallaMundo · bindInversa) se mete en cada hueso, así la app solo multiplica hueso · inversa
      const m0 = mallas[0], L = new THREE.Matrix4().copy(o.matrixWorld).invert().multiply(m0.matrixWorld).multiply(m0.bindMatrixInverse);
      huesos.forEach((b, i) => {
        tmp.multiplyMatrices(L, b.matrixWorld); tmp.decompose(pos, qua, esc);
        const k = f * huesos.length + i;
        qArr.set(qua.toArray(), k * 4); tArr.set(pos.toArray(), k * 3); sArr[k] = (esc.x + esc.y + esc.z) / 3;
      });
    }
    const texs = new Map();
    async function tex(t) {
      if (!t || !t.image) return null;
      if (texs.has(t.uuid)) return texs.get(t.uuid);
      const id = `m${idx}-t${texs.size}`; let c = t.image;
      if (!(c instanceof HTMLCanvasElement)) { const k = document.createElement("canvas"); k.width = c.width || c.naturalWidth; k.height = c.height || c.naturalHeight; k.getContext("2d").drawImage(c, 0, 0); c = k; }
      const blob = await new Promise(r => c.toBlob(r, "image/png"));
      await subir("personas/tex/" + id + ".png", blob, "image/png");
      texs.set(t.uuid, id); return id;
    }
    p.mixer.stopAllAction(); p.play("quieto", 0, false); p.mixer.update(0); o.rotation.y = 0;
    const rq = new Float32Array(huesos.length * 4), rt = new Float32Array(huesos.length * 3), rs = new Float32Array(huesos.length);
    grabar(rq, rt, rs, 0);
    const reposoOut = { q: meter(rq), t: meter(rt), s: meter(rs) };
    const salidaMallas = [];
    for (const m of mallas) {
      const g = m.geometry, a = g.attributes, mat = Array.isArray(m.material) ? m.material[0] : m.material;
      const si = new Uint16Array(a.skinIndex.count * 4);
      for (let i = 0; i < a.skinIndex.count; i++) for (let k = 0; k < 4; k++) si[i * 4 + k] = indice.get(m.skeleton.bones[a.skinIndex.array[i * a.skinIndex.itemSize + k]]) ?? 0;
      const inv = huesos.map(() => null);
      m.skeleton.bones.forEach((b, j) => { inv[indice.get(b)] = new THREE.Matrix4().multiplyMatrices(m.skeleton.boneInverses[j], m.bindMatrix).toArray(); });
      const usados = [...new Set(m.skeleton.bones.map(b => indice.get(b)))];
      salidaMallas.push({ n: a.position.count, pos: meter(new Float32Array(a.position.array)), nor: a.normal ? meter(new Float32Array(a.normal.array)) : null,
        uv: a.uv ? meter(new Float32Array(a.uv.array)) : null, si: meter(si), sw: meter(new Float32Array(a.skinWeight.array)),
        idx: g.index ? meter(new Uint32Array(g.index.array)) : null, ni: g.index ? g.index.count : 0,
        huesos: usados, inversas: usados.map(i => inv[i]),
        mat: { color: mat.color.toArray(), rough: mat.roughness ?? 0.7, metal: mat.metalness ?? 0, mapa: await tex(mat.map), transparente: !!mat.transparent, opacidad: mat.opacity } });
    }
    const anims = {};
    for (const [n, corre] of CLIPS) {
      try {
        p.mixer.stopAllAction(); p.actual = null;
        p.play(n, 0, corre);
        const key = corre ? n + "*" : n, ac = p.acts[key]; if (!ac) continue;
        const giro = o.rotation.y; o.rotation.y = 0;
        p.mixer.stopAllAction(); ac.reset(); ac.setEffectiveWeight(1); ac.play();
        const dur = ac.getClip().duration, N = Math.max(2, Math.round(dur * FPS));
        const q = new Float32Array(N * huesos.length * 4), t = new Float32Array(N * huesos.length * 3), sc = new Float32Array(N * huesos.length);
        for (let f = 0; f < N; f++) { ac.time = Math.min(dur, f / FPS); p.mixer.update(0); grabar(q, t, sc, f); }
        anims[n] = { dur, cuadros: N, giro, q: meter(q), t: meter(t), s: meter(sc) };
      } catch (e) { console.log("anim", n, e); }
    }
    const bin = new Uint8Array(off); let k = 0; for (const b of partes) { bin.set(b, k); k += b.byteLength; }
    await subir(`personas/m${idx}.bin`, bin);
    await subir(`personas/m${idx}.json`, JSON.stringify({ escala: o.scale.x, nh: huesos.length, reposo: reposoOut, mallas: salidaMallas, anims, fps: FPS }), "application/json");
    return `m${idx}: ${huesos.length} huesos, ${mallas.length} mallas, ${Object.keys(anims).length} anims, ${(off / 1e6).toFixed(1)} MB`;
  }
  async function correr() {
    const P = window.__P, MOD = window.__MODELO;
    if (!P || !Object.keys(P).length) { setTimeout(correr, 2000); return; }
    const hechos = new Set(), res = [];
    for (const [id, idx] of Object.entries(MOD)) {
      if (hechos.has(idx) || !P[id]) continue;
      hechos.add(idx); res.push(await exportarModelo(idx, P[id]));
    }
    await subir("personas/modelos.json", JSON.stringify(MOD), "application/json");
    document.title = "LISTO " + res.join(" | ");
  }
  setTimeout(() => correr().catch(e => { document.title = "ERROR " + e; }), 8000);
})();
