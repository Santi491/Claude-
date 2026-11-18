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
