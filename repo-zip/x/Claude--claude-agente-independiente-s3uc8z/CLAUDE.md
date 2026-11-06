# Agente de importación EE.UU. → Cochabamba

Claude trabaja como agente del usuario para decidir si conviene traer productos de EE.UU. a Cochabamba (Bolivia) y revenderlos.

## Productos
Componentes de PC: procesadores Ryzen e Intel, memorias RAM (ej. Corsair Vengeance RGB DDR5 32GB 2x16 5600/6000 MHz) y SSD. La lista exacta está en `vigilar.csv`.

## Couriers
- **Courier A (la señora):** USD 10 por producto. La dirección en EE.UU. está en un estado con sales tax, así que eBay cobra impuesto.
- **Courier B:** USD 28 por kg, sin importar el tipo de producto. La dirección está en un estado sin sales tax. Cobra el peso de la caja de envío completa (productos con su caja + caja exterior + relleno), no solo el producto. Por eso conviene pedir varias unidades juntas en una sola caja: el peso de la caja se reparte.
- Courier B cobra mínimo 1 kg y después sube de 0,5 en 0,5 kg. Ejemplo del usuario: 2 procesadores = USD 28 (1 kg); 3 procesadores = USD 42 (1,5 kg). Un procesador en caja con su parte de la caja exterior pesa ~350 g.
- Pendiente de confirmar: el estado (y % de tax) de A, y si la aduana boliviana está incluida en ambos.

## Tipo de cambio
Se calcula en cada análisis (oficial BCB y paralelo). Referencia del 10/10/2026: oficial 11,73 Bs/USD, paralelo ~11,86–11,91. Usar ~11,90 por defecto.

## Fuentes de precios
- EE.UU.: eBay (API oficial con clave de desarrollador, pendiente de aprobación); búsqueda web como respaldo.
- Cochabamba: tiendas (por WhatsApp) y Facebook Marketplace, a través de Claude in Chrome en la PC del usuario. El proceso completo está en `PROCESO-LOCAL.md`.
- WhatsApp: el usuario compró un número exclusivo para el agente (no es su número personal). Se puede usar para preguntar precios siguiendo los límites de `PROCESO-LOCAL.md`.

## Reglas
- Se puede preguntar precios a vendedores por WhatsApp/Marketplace con mensajes cortos y personales, pocos por día, nunca masivos.
- Nunca comprar, pagar, ofertar ni acordar nada sin confirmación explícita del usuario.
- Los precios inventados o estimados se marcan siempre como estimados.

## Archivos (compartidos entre la sesión de la nube y la local)
- `calculadora-importacion.html`: calculadora de costo puesto y ganancia por courier.
- `vigilar.csv`: productos que vigila la revisión diaria (lo edita el usuario o Claude).
- `tiendas-cochabamba.csv`: tiendas locales, su WhatsApp y el estado del contacto.
- `PROCESO-LOCAL.md`: paso a paso y mensajes modelo para la sesión local.
- `precios-cochabamba.csv`: precios locales que junta la sesión local (Marketplace/WhatsApp). Una fila por precio visto.
- `informes/AAAA-MM-DD.md`: informe diario de la nube con precios de EE.UU., costo puesto y comparación.

## Quién hace qué
- **Nube (rutina diaria, funciona con la PC apagada):** busca precios de EE.UU. de `vigilar.csv`, calcula el costo puesto con el courier más barato (pedido de 2 y de 4 unidades), compara con el último precio de `precios-cochabamba.csv` y escribe el informe. Notifica al celular y por email.
- **Local (PC encendida, Claude in Chrome):** revisa Marketplace de Cochabamba y WhatsApp, agrega filas a `precios-cochabamba.csv`, hace commit y push.
- Antes de trabajar, siempre `git pull` para tener lo último de la otra sesión.
