# Referencia del agente Pedidos

## Dónde rastrear cada guía

| Transportista | Cómo se reconoce la guía | Dónde |
|---|---|---|
| USPS | 20–22 dígitos (92…, 94…, 93…) o 2 letras + 9 dígitos + US | `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=<guía>` (si sale en blanco, recargar una vez) |
| UPS | empieza con 1Z | `https://www.ups.com/track?tracknum=<guía>` |
| FedEx | 12 o 15 dígitos | `https://www.fedex.com/fedextrack/?trknbr=<guía>` |
| GOFO Express | empieza con GFUS | `https://www.gofoexpress.com/track` (pegar la guía en el buscador). Si redirige a la página general, ir directo a 17track. |
| SpeedX | empieza con SPX | `https://www.speedx.io` → Track My Package: escribir la guía en el buscador de la página (un link con la guía en la dirección no carga el resultado). |
| Cualquiera (respaldo) | — | `https://www.17track.net/es/track?nums=<guía>`. Comprobar que el resultado muestra **nuestra** guía: 17track a veces muestra un número de demostración; eso no es un resultado. |
| Courier a Bolivia | según el courier | su web o lo que diga Santi (fuente = "courier" o "Santi") |

No hay API de USPS (Santi no puede crear la cuenta desde Bolivia): el rastreo es siempre con Chrome, en la ronda local.

## Del evento al estado

| El transportista dice… | `estado` |
|---|---|
| Label created, pre-shipment, awaiting item | `comprado` (todavía no salió) |
| Accepted, picked up, in transit, departed, arrived at facility, out for delivery (en EE.UU., antes del courier) | `enviado` |
| Delivered (incluido "front door" / "mailroom" / "dock") en la ciudad de la casilla del courier del pedido (courier A: Miami, Florida; courier B: su dirección en un estado sin sales tax; los pedidos de prueba van a Miami), o el courier confirma recepción | `en bodega del courier` (si el courier todavía no lo confirmó, dilo en el informe; a los 2 días hábiles sin confirmación es necesidad para Santi) |
| El courier lo despachó, vuelo, en aduana | `en camino a Bolivia` |
| Llegó a la oficina del courier en Cochabamba | `en Cochabamba` |
| Santi lo recibió | `entregado` |

Si el texto es de un problema (exception, alert, returned, undeliverable, held, damaged), el estado **no cambia**: se anota en `incidencia`.

## Coordenadas aproximadas (lat, lon con 2 decimales)

Ciudades ya usadas: Miami, FL 25.77,-80.19 · Memphis, TN 35.15,-90.05 · Gray, LA 29.70,-90.78 · Carteret, NJ 40.58,-74.23 · Cochabamba, BO -17.39,-66.16.
Otros hubs frecuentes: Jacksonville, FL 30.33,-81.66 · Orlando, FL 28.54,-81.38 · Atlanta, GA 33.75,-84.39 · Dallas, TX 32.78,-96.80 · Chicago, IL 41.88,-87.63 · Louisville, KY 38.25,-85.76 · Indianapolis, IN 39.77,-86.16 · Los Angeles, CA 34.05,-118.24 · Newark, NJ 40.74,-74.17 · Jersey City, NJ 40.73,-74.08 · Doral, FL 25.82,-80.36 · Opa-locka, FL 25.90,-80.25 · Santa Cruz, BO -17.78,-63.18 · La Paz, BO -16.50,-68.15.
Si la ciudad no está acá, usa sus coordenadas de centro (de la web de rastreo o de una búsqueda) con 2 decimales.

## Ejemplos de filas

`seguimiento.csv`:
```
prueba-primo-1,2026-10-17,06:06,"Memphis, TN",35.15,-90.05,En tránsito: llegó al centro de USPS,USPS web
```

`actividad.csv`:
```
2026-10-17,16:18,pedidos,"USPS de prueba: nuevo movimiento en Memphis, entrega estimada 19/10; GOFO y SpeedX de prueba siguen en bodega del courier. Sin pedidos reales activos"
```
