# Agente de importación EE.UU. → Cochabamba

Claude trabaja como agente del usuario para decidir si conviene traer productos de EE.UU. a Cochabamba (Bolivia) y revenderlos.

## Productos
Componentes de PC: RAM, procesadores, SSD y piezas parecidas (livianas, de alto valor).

## Couriers
- **Courier A (la señora):** USD 10 por producto. La dirección en EE.UU. está en un estado con sales tax, así que eBay cobra impuesto.
- **Courier B:** USD 28 por kg, sin importar el tipo de producto. La dirección está en un estado sin sales tax. Cobra el peso de la caja de envío completa (productos con su caja + caja exterior + relleno), no solo el producto. Por eso conviene pedir varias unidades juntas en una sola caja: el peso de la caja se reparte.
- Courier B cobra mínimo 1 kg y después sube de 0,5 en 0,5 kg. Ejemplo del usuario: 2 procesadores = USD 28 (1 kg); 3 procesadores = USD 42 (1,5 kg). Un procesador en caja con su parte de la caja exterior pesa ~350 g.
- Pendiente de confirmar: el estado (y % de tax) de A, y si la aduana boliviana está incluida en ambos.

## Tipo de cambio
Se calcula en cada análisis (oficial BCB y paralelo). Referencia del 10/10/2026: oficial 11,73 Bs/USD, paralelo ~11,86–11,91. Usar ~11,90 por defecto.

## Fuentes de precios
- EE.UU.: eBay (API oficial con clave de desarrollador, pendiente de aprobación); búsqueda web como respaldo.
- Cochabamba: Facebook Marketplace y vendedores por WhatsApp, a través de Claude in Chrome con la sesión del usuario.

## Reglas
- Se puede preguntar precios a vendedores por WhatsApp/Marketplace con mensajes cortos y personales, pocos por día, nunca masivos.
- Nunca comprar, pagar, ofertar ni acordar nada sin confirmación explícita del usuario.
- Los precios inventados o estimados se marcan siempre como estimados.

## Archivos
- `calculadora-importacion.html`: calculadora de costo puesto y ganancia por courier.
