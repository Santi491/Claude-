# La oficina 3D de Cargo Brothers

Todos los detalles de la oficina: cómo es, qué muestra cada pantalla, cómo se publica y cómo se toman decisiones en ella. `CLAUDE.md` solo tiene un resumen y apunta acá. El que la mantiene es el agente **Oficina** (skill `oficina`).

- **URL:** https://claude.ai/artifact/7B7QhWLBKLVZD1kB197TxJ (siempre la misma).
- **Datos:** `oficina/datos.js` lo genera `python oficina/generar.py` a partir de todos los CSV, `informes/` y `comparacion.md`. No se editan datos a mano en la página.
- La oficina es **pública**: nunca guías, números de pedido, direcciones, teléfonos, nombres de personas ni capturas de WhatsApp.

## Archivos de la página
| Archivo | Qué es |
|---|---|
| `index.html` | La página. Logo en `cbSvg` / `cbCanvas`. Si el navegador no tiene WebGL, queda la oficina isométrica 2D (tabla, historial tipo estado de cuenta y documentos). |
| `oficina3d.js` | La oficina 3D (Three.js): nave, personas, animaciones, manejar a Santi y la junta. |
| `gerente.js` | El puesto y la pantalla del Gerente (escritorio tipo PC). |
| `pantallas.js` | Las pantallas propias de los agentes. |
| `equipo.js` | "Necesidades e ideas", tablero del equipo, simulador de pedido y gráficos de precios. |
| `archivo.js` | El Archivo de documentos. |
| `mapa.js` + `mapa/` | La pantalla de Pedidos: el mapa de envíos. |
| `capturas/` + `capturas.csv` | Capturas de pantalla de los agentes con Chrome. |
| `catalogos/` | Catálogos y listas de precios de las tiendas. |
| `personas/*.json` | Personas de Mixamo. **Se publican solo en el artefacto**: están en `.gitignore` y no se mandan ni se borran en las publicaciones de la ronda. |

## La nave (plano del 27/10, elegido por Santi en el probador)
Nave de 44 × 29 m. Desde el 28/10 toda la nave sigue la misma estética (Santi): mármol negro, grafito, bronce, cuero cognac y luz cálida, un solo tipo de planta (maceta de mármol con aro de bronce), sillas de puesto de cuero negro y letreros con la misma letra. La paquetería queda industrial.

- **Oficina de Santi** (al fondo, paredes de vidrio): escritorio de mármol con 3 pantallas mirando a operaciones, silla ejecutiva, mueble bajo con el logo iluminado, el Archivo de documentos en la pared izquierda (desde el 28/10) y un rincón de charla con dos sillones.
- **Sala de reuniones** (al fondo, al lado): mesa ovalada de mármol cálido, 10 sillas de cuero, aparador con café y franja esmerilada con el nombre. Las dos salas están abiertas arriba para que se vean desde la vista general.
- **Mapa "Ruta de nuestros pedidos"** (28/10): sobre la sala de reuniones, en el muro alto del fondo. Miami → Cochabamba en bronce, con un avioncito que la recorre y cuántos pedidos reales van en camino, sin guías. Sin la franja oscura sobre el vidrio.
- **Muro izquierdo:** el videowall y los relojes (al costado de los puestos) y el tablero del equipo al frente de ese muro (desde el 28/10).
- **Lounge:** sofá, sillones y barra de café. Detrás, por una puerta, el **cobertizo de paquetería**: estanterías, mesa de empaque, Muelle 1 y el pallet "Paquetes de los pedidos" (una caja por cada pedido real en camino de `pedidos.csv`; los de prueba no).
- **Sala de operaciones** (al centro): 3 filas de 3 puestos mirando al videowall. Desde el 27/10 son como los del probador: escritorio de mármol negro de 1,8 m, laterales grafito, una pantalla y silla gris; solo el Gerente tiene dos pantallas. Columnas cada 4 m y filas cada 3,2 m. De izquierda a derecha desde la fila de adelante: WhatsApp, Gerente, Marketplace / Rastreador eBay, Analista, Pedidos / Finanzas, Analista de demanda, Informe diario.
- **Gym** a la derecha. **Recepción** adelante, con el logo: mostrador de mármol negro con canto de bronce y sala de espera con sillones cognac.

## Las personas
- Trabajan sentadas en su puesto. **Etiqueta** de cada una: punto rojo trabajando, ámbar esperando respuestas, verde sin trabajo.
- **Tiempo libre** (Santi, 12/11): sin trabajo, cada una elige un lugar libre según sus gustos (sofás y sillón del lounge, barra de café, cinta, pesas y charla del gym, mapa de la ruta en la sala de reuniones, pasillo, paquetería), hace ahí varias cosas distintas y cada uno o dos minutos se va a otro. Dos nunca ocupan el mismo lugar.
- **Horario de las rondas** (10:30 a 11:15 de lunes a viernes y 16:00 a 16:45 de lunes a sábado, hora de Bolivia) o con una ronda en vivo: todos sentados trabajando; al terminar la ronda aplauden y salen.
- **Animaciones extra** en `personas/animaciones2.json` (celular, teléfono, saludar, reír, estirarse, mirar, pensar, aplaudir, beber, recoger, señalar). Los FBX están en `Documents/mixamo/animaciones/nuevas-12-11` (fuera del repo). Si falta el archivo, la oficina anda igual.
- El Gerente hace su recorrida. Los agentes de pie saludan solos a Santi cuando pasa cerca.
- El estado de cada agente sale de su última fila en `actividad.csv`: si un agente no anota lo que hizo, aparece "En espera".

## Manejar a Santi
"Manejar a Santi" camina con el teclado, con choques. Con **E** usa lo que tiene cerca (un aviso abajo dice qué; en el celular se toca el aviso):
- la computadora de un agente (abre su panel sin dejar de manejar; otra E abre su pantalla completa);
- su propia silla, cualquier sofá o sillón (lounge, rincón del lounge, recepción y los dos de su oficina, que son solo para él) y las sillas de la sala de reuniones;
- escritorio de Santi, archivo, tablero, mapas de envíos, café, sofás, cinta, pesas y saludar a un agente.

Esc cierra primero el panel. "Modo liviano" para celulares.

**Junta** (Santi, 12/11): con Santi sentado en su silla o en una silla de la sala de reuniones aparece el botón «Llamar a junta». Todos (el Gerente al terminar su recorrida) van a la sala de reuniones y se sientan alrededor de la mesa; la cabecera del lado de la puerta queda para Santi. Siguen ahí hasta que él aprieta «Terminar junta». La junta solo existe en la pantalla de quien la llama.

## Las pantallas
Se abren con el botón "Abrir pantalla" del panel o con un segundo toque en el escritorio.

**Gerente** (`gerente.js`): escritorio con dos monitores, al lado del Analista. Desde el 28/10 (Santi) la pantalla es un **escritorio tipo PC**: fondo grafito con el logo en bronce, íconos a la izquierda (doble clic abre), widgets a la derecha y barra de tareas abajo (inicio con el logo, buscador, apps fijas y abiertas, día y rango de los datos, hora y ⏻ para cerrar). Cada app se abre en su ventana, que se arrastra, cambia de tamaño, se minimiza a la barra, se maximiza y se cierra.
- Panel de datos con pestañas Resumen, Contacto con tiendas, Precios y dólar, Oportunidades, Equipo y Plan e informes; filtro de 7 días / 30 días / todo y selector de día. Lee `metricas.csv`, `mensajes.csv` (sin notas; en Messenger sin nombres de personas), `plan.csv` e `informes/gerente/indice.csv` a través de `datos.js`.
- **Chat del equipo** (28/10, Santi): el WhatsApp del Gerente. Chats a la izquierda (uno por agente, buscador, filtros Todos / No leídos / Con Santi; el chat con Santi, fijado arriba), conversación a la derecha con globos (los del Gerente en verde), días y doble check; lo que escribe Santi sale con su nombre.
- **Fotos de perfil:** un retrato de la persona 3D de cada agente, que `oficina3d.js` saca al cargar (`fotos()`, en `window.OFI_AVATARES`); sin 3D, un monograma con el color de su puesto.
- **Objetivos** (Santi, 12/11): la etapa del negocio (1 → 2 → 3), cuántos objetivos se cumplieron, el próximo cierre y una tarjeta por agente con su foto, un anillo de objetivos cumplidos, la barra de avance de cada objetivo (verde cumplido, ámbar en curso, rojo vencido), sus acciones de los últimos 7 días (columnas por día), cifras de su trabajo y su última acción; abajo, los objetivos de la etapa siguiente. Datos en `D.objetivos` (`objetivos.calcular()` + rendimiento de 7 días que arma `generar.py`).
- **Libreta**: ícono en el escritorio (y widget con lo que vence) con la memoria del Gerente, visible solo para Santi.
- **Salud del equipo**: estado de hoy de nube, PC, Gerente y Raspberry, grilla de 14 días e historial de sesiones (`sesiones.csv`, `salud.py`).

**Pedidos** (`mapa.js`): mapa con zoom (Leaflet) desde EE.UU. hasta las calles, con el recorrido de cada envío, la línea que falta hasta Cochabamba, filtros (en espera, en camino, entregados) y la línea de tiempo. Los datos están en `oficina/mapa/` y los arma `python oficina/mapa_datos.py` (estados de EE.UU. y departamentos de Bolivia, carreteras y ciudades de Natural Earth; calles de OpenStreetMap alrededor de cada lugar de `seguimiento.csv`, de Miami y de Cochabamba). Cuando Pedidos agrega un lugar nuevo a `seguimiento.csv`, se corre y se publican los archivos nuevos de `oficina/mapa/calles/` (la página no puede cargar mapas de otros sitios). Solo se ve la ciudad, nunca el código postal. Todo pedido real pasa por Santa Cruz antes de Cochabamba (Santi, 03/11): el mapa lo dibuja como escala en el centro de la ciudad, nunca en una dirección. Las fotos de producto van en `oficina/fotos/<id>.jpg` (columna `foto`) y se publican con la oficina.

**Los demás agentes** (`pantallas.js`):
- **Rastreador eBay:** historial de precios nuevo/usado, si hoy está barato frente a su promedio y la tabla del Cazador (tope, precio nuevo de hoy, mediana de Cochabamba y si está bajo el tope; `D.cazador`).
- **WhatsApp:** embudo de tiendas y agenda de seguimientos; el avance del pedido de la lista completa, las próximas 10 tiendas y las que hay que revisar en el chat (`D.agenda`). No lleva captura: su pantalla es el resumen en texto.
- **Analista:** desglose del costo, calculadora de caja del courier B y precio de venta sugerido (5 % debajo del local más barato, con al menos 10 % de ganancia).
- **Informe diario:** lector de informes por día (la nube no tiene navegador: su pantalla es el último informe).
- **Finanzas:** plata, stock y registro de ventas (lo que anota Santi va a la colección `decisiones` con tipo `venta`).
- **Analista de demanda:** qué se busca.

**Capturas:** cada agente que trabaja con Chrome (eBay, Marketplace, tiendas web) guarda al terminar una captura en `oficina/capturas/AAAA-MM-DD-HHMM-<agente>.jpg` y la anota en `oficina/capturas.csv` (fecha, hora, agente, archivo, descripción). El monitor de cada agente muestra su última captura. WhatsApp no lleva captura (se verían chats y números).

## Archivo de documentos (`archivo.js`, 15/10)
Una pared de 4 archiveros en la oficina de Santi (pared izquierda, desde el 28/10) con 7 cajones rotulados. El segundo toque o el botón "Abrir archivo" abre un explorador a pantalla completa con un archivero animado: un cajón por tipo (Excel, Tablas en PDF, Tablas en CSV, Informes diarios, Informes del Gerente, Comparación, Capturas y, desde el 15/10, **Catálogos de tiendas**: vista previa del PDF o la imagen y los precios de la lista que vigilamos). Al cambiar de cajón, el anterior se cierra, el nuevo sale y las carpetas suben una por una. Buscador en todo el archivo, vista carpetas o lista y vista previa al costado. Lee `D.documentos`, `D.informes_gerente` y `D.capturas`.

## Equipo, necesidades e ideas (`equipo.js`)
- Botón **"Necesidades e ideas"** en el panel de cada agente y en la barra de arriba: lo que necesita (`necesidades.csv` abiertas), sus ideas (`ideas.csv` propuestas) y las tareas del plan que le tocan (`plan.csv` propuestas).
- **Tablero del equipo** (pantalla grande en la pared, también se toca, y botón de arriba): lo mismo de todos los agentes juntos, en tres vistas (17/10): **Por decidir** (lo pendiente de hoy en adelante), **Vencidas** (tareas cuya fecha pasó sin decisión: se aprueban si todavía sirven o se rechazan para limpiar) y **Decididas** (lo aprobado, rechazado, hecho o resuelto, en la oficina, por Telegram o en el Doc; solo consulta). Al decidir algo, pasa de Por decidir a Decididas. Las necesidades resueltas llegan en `D.necesidades_resueltas`.
- **Simulador de pedido** (courier A, B o la combinación más barata, con la caja y los tramos de 0,5 kg) y **gráficos de precios por día** (en la pantalla del Analista y en la barra de arriba).

## Decisiones de Santi en la oficina
- Solo Santi (el dueño) ve los botones activos: **Aprobar / Rechazar** (ideas y tareas) y **Ya está resuelto** (necesidades). Los demás ven en modo lectura.
- Cada decisión se guarda en la colección `decisiones` de la base de datos de la oficina (`<tipo>-<ref>`: `plan-2026-10-14-6`, `idea-3`, `necesidad-5`; `ref` de ideas y necesidades = número de fila del CSV, contando desde 1 sin el encabezado).
- La oficina no puede avisar al instante por Telegram (es pública: no guarda la clave del bot, y la Raspberry no lee su base de datos). Al decidir, arriba queda el aviso de cuántas decisiones esperan la próxima ronda. La ronda las pasa a los CSV al empezar (paso 0b de `PROCESO-LOCAL.md`, `aplicar_decisiones.py`, con la herramienta `ArtifactData`) y se las confirma a Santi en el mensaje del Gerente (paso 8b). Vale igual que Telegram o el Doc; lo más reciente gana. Para confirmación al instante, Santi decide por Telegram.

## Oficina en vivo
La oficina escucha la colección `vivo` de la base de datos del artefacto (herramienta `ArtifactData`).
- Al empezar una ronda: `vivo/_ronda` = `{activa: true, quien: "PC de la casa", desde: "HH:MM"}`.
- Mientras trabaja cada agente: `vivo/<agente>` (nube | ebay | wa | mkt | ana | pedidos | fin | dem) = `{estado: "trabajando" | "esperando" | "terminó" | "en espera", texto: "qué está haciendo, corto", hora: "HH:MM"}`, actualizado en cada paso (leer la versión y pasar `if_version`).
- Al terminar: `vivo/_ronda` con `activa: false`. Mientras `activa` es false, la oficina muestra el estado de `actividad.csv`. La nube no tiene esa herramienta: no escribe en vivo.

## Publicar
- Se publica en la misma URL con `file_path` = `oficina/index.html` y `files` con `datos.js`, más los .js que cambiaron (`oficina3d.js`, `equipo.js`, `gerente.js`, `pantallas.js`, `archivo.js`, `mapa.js`), las capturas nuevas, los catálogos nuevos (`"catalogos/<archivo>": "oficina/catalogos/<archivo>"`), los mapas nuevos de `oficina/mapa/calles/` y las fotos de producto.
- Capacidades: `db` con la regla `{path: "", read: "view", write: "owner"}` y `user`. Ya quedan guardadas; en los republish normales no se pasan.
- Las personas de Mixamo no se mandan ni se borran en las publicaciones de la ronda.
