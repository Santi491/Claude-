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
1. **Encontrar tiendas.** Buscar en Google, Facebook (páginas y Marketplace), Instagram y TikTok tiendas de componentes en Cochabamba. Anotar cada una en `tiendas-cochabamba.csv` (WhatsApp, dirección, fuente).
2. **Verificar que venden componentes.** Revisar su página/catálogo. Si no queda claro, preguntar por WhatsApp con el mensaje 1. Actualizar `vende_componentes`.
3. **Pedir precios** de los productos de `vigilar.csv` con el mensaje 2. Preguntar también precio por cantidad (2 y 4 unidades), si es nuevo/usado/sellado, garantía y factura.
4. **Revisar Marketplace** de Cochabamba para los mismos productos (particulares). Anotar precio, estado y link.
5. **Guardar todo** en `precios-cochabamba.csv` (una fila por precio, con fuente y fecha). Commit y push.
6. **Comparar:** con el último informe de `informes/` y la regla de couriers de `CLAUDE.md`, calcular costo puesto en Bs y ganancia. Tipo de cambio del día.
7. **Avisar al usuario** solo con el resumen: qué conviene traer, cuánto se gana por unidad, y qué tiendas venden más caro.

## Mensajes modelo (cortos, naturales, uno por tienda)
1. "Hola, buenas. ¿Venden componentes de PC (procesadores, memorias RAM, SSD)?"
2. "Hola, consulta: ¿qué precio tienen el [producto]? ¿Y si llevo 2 o 4? ¿Es nuevo sellado y con garantía? Gracias."
- Si preguntan para qué es: "Estoy cotizando para armar unas PCs."
- No inventar datos personales, no presentarse como empresa, no regatear ni prometer comprar.

## Límites para cuidar el número
- Número nuevo: los primeros días, máximo ~10 chats nuevos por día, espaciados (unos minutos entre cada uno). Luego subir de a poco.
- Nunca el mismo mensaje copiado a muchos a la vez. Variar el saludo.
- Si alguien pide no escribirle más, anotar `no contactar` y no volver a escribir.
- **Nunca** comprar, pagar, reservar, aceptar una oferta ni dar dirección sin confirmación del usuario.
