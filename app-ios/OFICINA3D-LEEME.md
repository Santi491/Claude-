# Oficina 3D nativa (app de iPhone)

Plan de Santi (18/11), en 6 partes: 1 nave y muebles (HECHA 18/11) · 2 personas caminando y sentadas · 3 etiquetas
redondas con foto y tocar a cada agente · 4 en vivo (foquito, estados) · 5 gym, lounge, junta y paquetería · 6 manejar a Santi y pulir.

## Cómo se hace (parte 1)
No se reescribe la oficina a mano: se **exporta la escena de la oficina web** (oficina/oficina3d.js) y la app la arma
con SceneKit (`Shared/Oficina3D.swift`, corre igual en la Mac para sacar fotos sin simulador).

1. Copia de la oficina en una carpeta con `exportar-oficina.js` agregado al final de index.html y dos marcas en
   oficina3d.js: `window.__escena = scene;` después de `const scene = new THREE.Scene();` y `userData.persona = 1`
   en las personas simples (`person(...)`, la persona sentada de cada puesto y su aro) para que no se exporten.
2. `python3 exportar-servidor.py` (sirve la carpeta `site/` y guarda lo que llega en `salida/`) y Chrome headless con
   `--use-angle=swiftshader --remote-debugging-port=9333` a la página: a los 15 s exporta `oficina.json` (geometrías,
   materiales, piezas y luces), `oficina.bin` y `tex/*.png`. El título de la página dice LISTO con los números.
3. Copiar `salida/*` a `app-ios/CargoBrothers/Oficina3D/` (se empaqueta como carpeta).

Cada vez que cambie la oficina web, se vuelve a exportar. Ajustes de luz: `Oficina3D.brillo` (0.72) y la exposición de la cámara.

## Parte 2 (personas): estado al 18/11 noche
- Hecho: los 9 puestos con más detalle (`Shared/Detalle3D.swift`) en su lugar, calidad alta activada, vidrio real.
- En curso: `Shared/Personas3D.swift` (lector de personas con esqueleto) y `exportar-personas.js` (exporta los modelos de
  `personas/*.json` del artifact con sus animaciones grabadas a 30 cuadros). Problema: los archivos de personas vienen del
  GLTFExporter con cadenas de huesos duplicadas y escalas ×100 encadenadas; ni la fórmula de skinning ni `boneTransform`
  de three dan posiciones razonables fuera del render de la web, así que el cuerpo sale en escala/posición equivocada.
- Próxima sesión, opciones: (a) convertir los .json de personas a .gltf/.glb y pasarlos por Reality Converter (app gratis
  de Apple, la descarga Santi) para obtener .usdz con esqueleto y animaciones; (b) leer el glTF original con su jerarquía
  completa (sin aplanar) e incluir los nodos padre no-hueso con sus escalas; (c) grabar las matrices finales que usa el
  shader (`skeleton.boneMatrices` después de `renderer.render`) en vez de recalcularlas.
- Los datos de personas (~28 MB comprimidos) NO van al repo: son de Mixamo y el repo es público (igual que en la oficina web).

## Parte 2: RESUELTA (19/11)
Los `personas/*.json` del artifact estaban rotos por dentro (matrices de atadura corruptas al exportarlos de la web).
Se usan los **FBX originales de Mixamo** que bajó Santi en `~/Documents/mixamo/mixamo/` (personajes/ y animaciones/):
1. `exportar-personas-fbx.html` (three.js FBXLoader en Chrome headless, con los FBX copiados en `m/p0..p5.fbx` y una
   animación por nombre en `m/<nombre>.fbx`) exporta cada personaje: huesos "planos" con su matriz por cuadro (20 fps),
   17 animaciones, y renombra el prefijo de huesos de Mixamo por personaje.
2. `comprimir-personas.py <salida> <destino>` cuantiza y comprime (~31 MB los 6). Texturas: las de los glTF viejos
   (m<i>-t0.jpg cuerpo, m<i>-t1.png pelo/transparente), con la V sin invertir (`Personas3D.invertirV = false`).
3. Copiar a `app-ios/CargoBrothers/Personas/` (en .gitignore: Mixamo, repo público). `OficinaView` los sienta si están.
Sentados: `Personas3D.dzSentado = 0.95` m desde el punto del puesto. Animaciones: teclear, sentado, quieto, caminar, hablar,
pesas, cinta, sentarse, pararse, a_teclear, de_teclear, cafe, celular, pensar, estirarse, reir_sentado, reunion.

**Ojo al exportar la oficina de nuevo (19/11):** la oficina web tiene personas simples de respaldo (el "Gerente caminante" de camisa amarilla, las sentadas y la de Santi) que solo se esconden cuando cargan los personajes de Mixamo. Si al exportar quedan visibles, salen como un muñeco fijo en la nave: hay que esconderlas antes de exportar o sacarlas de `oficina.json` (el 19/11 se sacaron los nodos 1158 a 1168, el caminante junto al puesto de Finanzas).
