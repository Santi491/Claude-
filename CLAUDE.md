# Agente de importación EE.UU. → Cochabamba

Claude trabaja como agente del usuario para decidir si conviene traer productos de EE.UU. a Cochabamba (Bolivia) y revenderlos.

## Productos
Componentes de PC: procesadores Ryzen e Intel, memorias RAM (ej. Corsair Vengeance RGB DDR5 32GB 2x16 5600/6000 MHz) y SSD. La lista exacta está en `vigilar.csv`.

## Couriers
- **Courier A (la señora):** USD 10 por producto. La dirección en EE.UU. está en un estado con sales tax, así que eBay cobra impuesto.
- **Courier B:** USD 28 por kg, sin importar el tipo de producto. La dirección está en un estado sin sales tax. Cobra el peso de la caja de envío completa (productos con su caja + caja exterior + relleno), no solo el producto. Por eso conviene pedir varias unidades juntas en una sola caja: el peso de la caja se reparte.
- Courier B cobra mínimo 1 kg y después sube de 0,5 en 0,5 kg. Ejemplo del usuario: 2 procesadores = USD 28 (1 kg); 3 procesadores = USD 42 (1,5 kg). Un procesador en caja con su parte de la caja exterior pesa ~350 g.
- Aduana: según el usuario (12/10), normalmente ya está incluida en el costo del courier; a veces no. Los cálculos la dejan en 0 % y, cuando no esté incluida, se suma aparte (campo "Aduana %" de la oficina o `--aduana` de `comparar.py`). Pendiente: el estado (y % de tax) de A. El usuario está haciendo pedidos de prueba para tener cotizaciones reales de envío.

## Tipo de cambio
Se calcula en cada análisis (oficial BCB y paralelo). Referencia del 10/10/2026: oficial 11,73 Bs/USD, paralelo ~11,86–11,91. Usar ~11,90 por defecto.

## Fuentes de precios
- EE.UU.: eBay con la API oficial: `python3 ebay.py --vigilar --guardar` (claves en las variables de entorno EBAY_CLIENT_ID / EBAY_CLIENT_SECRET, o en `~/.ebay-claves` en la Mac, creado con `./configurar-ebay.sh`; nunca se suben al repo). Búsqueda web solo como respaldo si la API falla; esos precios van a `precios-eeuu.csv` con tipo `estimado`.
- Cochabamba: tiendas (por WhatsApp) y Facebook Marketplace, a través de Claude in Chrome en la PC del usuario. El proceso completo está en `PROCESO-LOCAL.md`.
- WhatsApp: el usuario compró un número exclusivo para el agente (no es su número personal). Se puede usar para preguntar precios siguiendo los límites de `PROCESO-LOCAL.md`.

## Reglas
- Se puede preguntar precios a vendedores por WhatsApp/Marketplace con mensajes cortos y personales, pocos por día, nunca masivos.
- Nunca comprar, pagar, ofertar ni acordar nada sin confirmación explícita del usuario.
- Los precios inventados o estimados se marcan siempre como estimados.

## Archivos (compartidos entre la sesión de la nube y la local)
- `ebay.py`: busca precios reales en eBay EE.UU. (vendedores con ≥98% de feedback, ubicados en EE.UU.).
- `calculadora-importacion.html`: calculadora de costo puesto y ganancia por courier.
- `vigilar.csv`: productos que vigila la revisión diaria (lo edita el usuario o Claude).
- `tiendas-cochabamba.csv`: tiendas locales, su WhatsApp y el estado del contacto.
- `PROCESO-LOCAL.md`: paso a paso y mensajes modelo para la sesión local.
- `precios-cochabamba.csv`: precios locales que junta la sesión local (Marketplace/WhatsApp). Una fila por precio visto.
- `informes/AAAA-MM-DD.md`: informe diario de la nube con precios de EE.UU., costo puesto y comparación.
- `precios-eeuu.csv`: precios de eBay EE.UU., una fila por producto, condición (nuevo/usado) y día; `tipo` = real (API o anuncio visto con Chrome) o estimado. Los primeros reales (12/10) los juntó el Rastreador eBay con Chrome en la PC de la casa.
- `tipo-cambio.csv`: una fila por día con el dólar oficial BCB, el paralelo (compra/venta) y el que se usa en los cálculos. `comparar.py` toma el último.
- `reportes.py` → `importacion-cochabamba.xlsx` (hojas Hoy con fórmulas, Historial, Dólar, Movimientos, Supuestos), `historial/AAAA-MM-DD.csv` y `.pdf` (la tabla de cada día; no se reescriben días anteriores) y `historial/historial.csv` (todo el historial). Necesita `openpyxl` y `reportlab` (`pip install --user openpyxl reportlab`).
- `actividad.csv`: bitácora de los agentes (fecha, hora, agente = nube | ebay | wa | mkt | ana, texto). Una fila por acción importante.
- `oficina/` → panel "Oficina de agentes", publicado en https://claude.ai/artifact/7B7QhWLBKLVZD1kB197TxJ. `index.html` es la página (oficina isométrica, tabla, historial tipo estado de cuenta y documentos); `datos.js` lo genera `python3 oficina/generar.py` a partir de todos los CSV, `informes/` y `comparacion.md`. No editar datos a mano en la página.
- `comparar.py` → `comparacion.md`: tabla de comparación por producto y por vendedor (costo puesto 2 y 4 u, ganancia y veredicto). Se regenera después de agregar precios de cualquier lado: `python3 comparar.py --tc <tipo de cambio>`.

## Quién hace qué
- **Nube · rutina "Revisión diaria de importación" (todos los días 7:52, hora de Bolivia; funciona con las computadoras apagadas):** dólar del día, eBay con la API si tiene claves en su entorno (si no, usa los últimos precios reales; nunca estima), comparación, Excel, copia del día, informe en `informes/`, actividad y push. No publica la oficina. Notifica al celular y por email.
- **Mac · tarea programada "Ronda local de la mañana" (todos los días 10:30; la app tiene que estar abierta):** dólar y eBay con las claves de `~/.ebay-claves` si faltan los de hoy, WhatsApp (respuestas + chats nuevos dentro del límite), Marketplace con Chrome, regenera todo, publica la oficina y hace push.
- **Mac · tarea programada "WhatsApp de la tarde" (lunes a sábado 17:30):** solo lee respuestas, anota precios, publica la oficina y hace push. No abre chats nuevos.
- **PC de la casa:** puede hacer la ronda local manualmente con el mismo proceso; nunca al mismo tiempo que la Mac.
- La oficina muestra el estado real de cada agente según su última fila en `actividad.csv`: si un agente no anota lo que hizo, aparece "En espera".
- **Capturas de pantalla:** cada agente que trabaja con Chrome (eBay, Marketplace/tiendas web) guarda al terminar una captura de lo que hizo en `oficina/capturas/AAAA-MM-DD-HHMM-<agente>.jpg` y la anota en `oficina/capturas.csv` (fecha, hora, agente, archivo, descripción). La oficina muestra en el monitor de cada agente su última captura. Al publicar, subir también las capturas nuevas en `files`. WhatsApp no lleva captura (la oficina es pública y se verían chats y números): su pantalla es el resumen en texto. La nube no tiene navegador: su pantalla es el último informe.
- **Oficina en vivo:** la oficina escucha la colección `vivo` de la base de datos del artefacto (herramienta `ArtifactData`, URL de la oficina). Al empezar una ronda: `vivo/_ronda` = `{activa: true, quien: "PC de la casa" | "Mac", desde: "HH:MM"}`. Mientras trabaja cada agente: `vivo/<agente>` (nube | ebay | wa | mkt | ana) = `{estado: "trabajando" | "esperando" | "terminó" | "en espera", texto: "qué está haciendo, corto", hora: "HH:MM"}`, actualizado en cada paso (leer la versión y pasar `if_version`). Al terminar: `vivo/_ronda` con `activa: false`. Mientras `activa` es false la oficina muestra el estado de `actividad.csv`. La nube no tiene esa herramienta: no escribe en vivo.
- Antes de trabajar, siempre `git pull` para tener lo último de la otra sesión.
- Al terminar cada ronda (nube o local): agregar la fila del día a `tipo-cambio.csv` (nube), anotar lo hecho en `actividad.csv`, correr `python3 comparar.py`, `python3 reportes.py` (Excel + copia del día en `historial/` en CSV y PDF) y `python3 oficina/generar.py`, republicar la oficina en la misma URL con `files: {"datos.js": "oficina/datos.js"}` (si la sesión puede publicar artefactos) y hacer commit y push. El historial de la oficina se arma solo con esas filas: nunca borrar filas viejas de los CSV, solo agregar.
- Computadoras: PC de la casa (Windows) y Mac (repo en `~/Documents/agente-importacion`, login de GitHub con `gh`).
