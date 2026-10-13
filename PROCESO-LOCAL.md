# Proceso local: mercado de Cochabamba

Lo hace la sesión local con Claude in Chrome. Hay dos computadoras: la **PC de la casa** (Windows) y la **Mac** (cuando el usuario está fuera). Las dos usan el mismo repo y el mismo número de WhatsApp.

## Coordinación entre la PC y la Mac
- Al empezar: `git pull`. Al terminar cada tanda de mensajes: commit y push enseguida, para que la otra computadora vea lo que ya se hizo.
- Antes de escribir a una tienda, revisar en `tiendas-cochabamba.csv` su `estado_contacto` y `ultima_consulta`: si ya se le escribió en los últimos 3 días, no volver a escribirle; solo revisar si respondió en WhatsApp Web.
- El límite de ~10 chats nuevos por día es **por número**, no por computadora: sumar lo que ya hizo la otra.
- No trabajar en las dos computadoras al mismo tiempo.

## Cuentas
- **WhatsApp:** número exclusivo para el agente (no es el personal del usuario). Sesión en WhatsApp Web en el Chrome del usuario.
- **Facebook:** cuenta del usuario, sesión abierta en el mismo Chrome.

## Pasos (en este orden, como lo haría el usuario)
0. **Plan del día.** Leer en `plan.csv` las tareas con `fecha_para` de hoy. Antes, revisar si Santi decidió algo: `python3 telegram_leer.py` (sus mensajes al bot del Gerente; ver "Telegram con el Gerente" en CLAUDE.md y contestarle), el último Google Doc de la carpeta INFORME DIARIO (Drive, leer con comentarios: casillas ☑, cambios escritos) y lo que haya dicho en el chat; anotar su decisión en `plan.csv` (aprobado / rechazado, columna `decision`). Hacer solo las tareas `aprobado` (además de la rutina de abajo) y marcarlas `hecho` al terminar. Lo `propuesto` sin respuesta no se hace.
1. **Encontrar tiendas (agente Marketplace / Facebook).** Buscar en Google, Facebook (páginas y Marketplace), Instagram y TikTok tiendas de componentes en Cochabamba. Anotar cada una en `tiendas-cochabamba.csv` (WhatsApp, dirección, fuente) y pasársela a WhatsApp para que le escriba.
1b. **Páginas web de las tiendas (agente Marketplace, con permiso de Santi para abrirlas).** Para cada tienda, buscar si tiene página web, catálogo (Taplink, Linktree, tienda online) o lista de precios; si la encuentra, abrirla con Chrome y anotar en `precios-cochabamba.csv` los precios de los productos de `vigilar.csv` (fuente "<tienda> (web)", con el estado: disponible, agotado, otra marca) y el link en `tiendas-cochabamba.csv`. Solo leer: no crear cuentas, no llenar formularios, no agregar al carrito, no comprar. Guardar la captura del agente como siempre. Un precio de la web no reemplaza preguntarle a la tienda: WhatsApp igual confirma stock y precio por cantidad.
2. **Verificar que venden componentes.** Revisar su página/catálogo. Si no queda claro, preguntar por WhatsApp con el mensaje 1 (sin pedir aprobación). Actualizar `vende_componentes`.
3. **Pedir precios y conversar (agente WhatsApp, solo).** Escribir a las tiendas nuevas y seguir las conversaciones abiertas: pedir precios de los productos de `vigilar.csv` con el mensaje 2, contestar lo que pregunten (estado, cantidad, marca), y si dan un precio o una estimación, repreguntar lo que falte hasta tenerlo claro. Preguntar también precio por cantidad (2 y 4 unidades), si es nuevo/usado/sellado, garantía y factura.
4. **Revisar Marketplace** de Cochabamba para los mismos productos (particulares). Anotar precio, estado y link.
4b. **Seguir los pedidos (agente Pedidos), en cada ronda de la mañana y de la tarde.** Para cada pedido de `pedidos.csv` y `pedidos-prueba.csv` que no esté entregado, abrir su guía en la web del transportista con Chrome (USPS: `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=<guía>`, si sale en blanco recargar una vez; GOFO Express, guías que empiezan con GFUS: `https://www.gofoexpress.com/track`; SpeedX, guías SPX...: `https://www.speedx.io` → Track My Package; si una web no la encuentra, probar en 17track.net) y en la del courier. Por cada movimiento nuevo: una fila en `seguimiento.csv` con la ciudad (sin código postal) y su lat/lon aproximada, actualizar `estado`, `eta` y `actualizado` del pedido, y correr `python3 oficina/mapa_datos.py` si es una ciudad nueva (calles para el mapa). No hay API de USPS: el usuario no puede crear la cuenta desde Bolivia, así que el rastreo es solo local. Cuando el usuario pase una guía nueva por el chat, cargarla y rastrearla en ese momento.
5. **Anotar cada mensaje** enviado o recibido (WhatsApp y Messenger) en `mensajes.csv` en el momento: una fila por mensaje, con tipo nuevo, seguimiento, respuesta o automatica, y si trajo precio. Las métricas del Gerente salen de ahí.
6. **Guardar todo** en `precios-cochabamba.csv` (una fila por precio, con fuente y fecha), una captura de pantalla por agente que trabajó (ver `CLAUDE.md`, “Capturas de pantalla”) y la fila de `actividad.csv`. Commit y push.
7. **Comparar:** con el último informe de `informes/` y la regla de couriers de `CLAUDE.md`, calcular costo puesto en Bs y ganancia. Tipo de cambio del día.
8. **Avisar al usuario** solo con el resumen: qué conviene traer, cuánto se gana por unidad, y qué tiendas venden más caro.

## Mensajes modelo (cortos, naturales, uno por tienda)
- Firma y nombre: **André Maldonado** (ver `CLAUDE.md`). Si preguntan el nombre: "André".
1. "Hola, buenas. ¿Venden componentes de PC (procesadores, memorias RAM, SSD)?"
2. "Hola, consulta: ¿qué precio tienen el [producto]? ¿Y si llevo 2 o 4? ¿Es nuevo sellado y con garantía? Gracias."
- Si preguntan para qué es: "Estoy cotizando para armar unas PCs."
- Fuera del nombre André Maldonado, no inventar datos personales (dirección, carnet, NIT), no presentarse como empresa, no regatear ni prometer comprar.

## Límites para cuidar el número
- Número nuevo: los primeros días, máximo ~10 chats nuevos por día, espaciados (unos minutos entre cada uno). Luego subir de a poco.
- Nunca el mismo mensaje copiado a muchos a la vez. Variar el saludo.
- Si alguien pide no escribirle más, anotar `no contactar` y no volver a escribir.
- Desde el 13/10 los mensajes a tiendas y vendedores **se mandan solos, sin pedir aprobación** (ver `CLAUDE.md`, "Mensajes a tiendas: autonomía"). Siguen los límites: ~10 chats nuevos por día, nada de datos personales, ventas, llamadas, compras ni ofertas.
- **Nunca** comprar, pagar, reservar, aceptar una oferta ni dar dirección sin confirmación del usuario.
