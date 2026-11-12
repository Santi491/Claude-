#!/usr/bin/env python3
"""Cazador de ofertas de eBay (idea 1, aprobada por Santi el 12/11). Corre en la Raspberry cada 2 horas, de 8:00 a 22:00, sin IA.

Lo que importa no es un precio fijo en dólares sino la DIFERENCIA con Cochabamba (Santi, 12/11: "no nos importa si cuesta
USD 600 si en Cochabamba se vende en 900"). Por eso el tope de cada producto lo calcula solo, con el mismo cálculo del Analista:

    tope (USD, con envío a la casilla) = el precio de eBay más alto que, puesto en Cochabamba (courier más barato, dólar USDT
    del día, pedido de 2) y vendido 5 % debajo de la mediana local, todavía deja MARGEN_META (20 %) de margen.

Si el precio de Cochabamba sube, el tope sube solo; si baja, baja. Sin precio local no hay tope (no se puede saber si conviene).
Cuando eBay tiene un anuncio NUEVO con stock por debajo del tope, le avisa a Santi por Telegram (notificar.py) con el margen,
el peor caso (dólar +3 %, courier +20 %, local −10 %) y el link. Nunca compra, oferta ni reserva nada: solo avisa.
Cada anuncio se avisa una vez (o de nuevo si baja 3 % más); el estado queda en ~/.cargo-cazador.json (no va al repo).

    python3 cazador.py                    # revisa eBay y avisa (Raspberry, cron)
    python3 cazador.py --probar           # revisa y muestra, sin mandar nada
    python3 cazador.py --topes            # solo la tabla de topes (sin eBay)
    python3 cazador.py --guardar-topes    # escribe los topes en vigilar.csv (precio_max_usd), para verlos en la oficina
"""
import csv
import json
import math
import os
import statistics
import subprocess
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIR)
import analista as A  # noqa: E402
import comparar as C  # noqa: E402

MARGEN_META = 0.20          # margen que tiene que dejar el precio de eBay para avisar
ESTADO = os.path.expanduser("~/.cargo-cazador.json")
REAVISO = 0.97              # el mismo anuncio se vuelve a avisar solo si baja 3 % más
AHORA = datetime.now(ZoneInfo("America/La_Paz"))


def margen(usd, peso, tc, mediana, dx=1.0, cx=1.0, lx=1.0):
    of = {"precio_usd": usd, "envio_usd": 0}
    costo, via, _ = A.costo_completo(of, peso, 2, tc * dx, courier_x=cx)
    venta = math.floor(mediana * lx * 0.95 / 10) * 10
    return ((venta - costo) / venta if venta else -1), costo, venta, via


def topes():
    """Tope en USD (precio + envío en EE.UU.) de cada producto de vigilar.csv, con su referencia de Cochabamba."""
    vig, pcb = C.leer("vigilar.csv"), C.leer("precios-cochabamba.csv")
    fx = [f for f in C.leer("tipo-cambio.csv") if A.num(f.get("usado"))]
    tc = A.num(fx[-1]["usado"]) if fx else None
    out = []
    for v in vig:
        prod, peso = v["producto"], A.num(v.get("peso_g_con_caja")) or 350
        loc_todos = [f for f in C.locales(pcb, prod) if A.num(f.get("precio_bs")) and "viejo" not in f.get("estado", "")
                     and "agotado" not in f.get("estado", "") and not A.es_mayorista(f.get("condiciones"))]
        loc, _ = A.referencia_local(loc_todos, "nuevo")
        recientes = [f for f in loc if A.dias(f["fecha"]) is not None and A.dias(f["fecha"]) <= 30]
        fila = {"producto": prod, "busqueda": v.get("busqueda_ebay") or prod, "peso": peso, "tc": tc, "tope_usd": None}
        if not tc or not recientes:
            fila["por_que"] = "sin precio de Cochabamba de los últimos 30 días" if tc else "sin dólar del día"
            out.append(fila)
            continue
        med = statistics.median(A.num(f["precio_bs"]) for f in recientes)
        tiendas = {(f.get("fuente") or "").split("(")[0].strip().lower() for f in recientes}
        lo, hi = 0.0, 20000.0
        if margen(1, peso, tc, med)[0] < MARGEN_META:
            fila |= {"mediana_bs": round(med), "tiendas": len(tiendas), "por_que": "ni regalado deja 20 %"}
            out.append(fila)
            continue
        for _ in range(40):   # búsqueda binaria del precio más alto que deja el margen meta
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if margen(mid, peso, tc, med)[0] >= MARGEN_META else (lo, mid)
        fila |= {"tope_usd": math.floor(lo), "mediana_bs": round(med), "tiendas": len(tiendas),
                 "por_que": f"mediana de {len(recientes)} precio(s) de {len(tiendas)} tienda(s) en 30 días"}
        out.append(fila)
    return out


def leer_estado():
    try:
        return json.load(open(ESTADO, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def avisar(texto, probar):
    if probar:
        print("  [no se manda] " + texto)
        return
    subprocess.run([sys.executable, os.path.join(DIR, "notificar.py"), texto], check=False)


def cazar(probar=False):
    import ebay  # noqa: E402  (solo hace falta para buscar en eBay)
    ebay.cargar_claves()
    tok = ebay.token()
    estado, nuevos = leer_estado(), 0
    for t in topes():
        if not t["tope_usd"]:
            continue
        try:
            items = ebay.buscar(tok, t["busqueda"], "nuevo")
        except Exception as e:  # noqa: BLE001
            print(f"{t['producto']}: eBay falló ({e.__class__.__name__})")
            continue
        baratos = [i for i in items if i["envio_usd"] is not None and i["total_usd"] <= t["tope_usd"]]
        if not baratos:
            print(f"{t['producto']}: tope USD {t['tope_usd']}, el más barato USD {items[0]['total_usd']:.2f}" if items
                  else f"{t['producto']}: tope USD {t['tope_usd']}, sin anuncios")
            continue
        it = next((i for i in baratos if ebay.disponible(tok, i["link"]) is not False), None)
        if not it:
            continue
        previo = estado.get(it["link"])
        if previo and it["total_usd"] > previo * REAVISO:
            print(f"{t['producto']}: USD {it['total_usd']:.2f} ya avisado")
            continue
        m, costo, venta, via = margen(it["total_usd"], t["peso"], t["tc"], t["mediana_bs"])
        peor = margen(it["total_usd"], t["peso"], t["tc"], t["mediana_bs"], 1.03, 1.2, 0.9)[0]
        ojo = " Ojo: el precio de Cochabamba sale de una sola tienda." if t["tiendas"] < 2 else ""
        bs = lambda x: f"{x:,.0f}".replace(",", ".")
        texto = (f"Santi, apareció una oferta en eBay: {t['producto']} nuevo a USD {it['total_usd']:.2f} con envío "
                 f"(nuestro tope con el precio de Cochabamba es USD {t['tope_usd']}). Es \"{it['titulo'][:90]}\". "
                 f"Puesto acá nos costaría unos Bs {bs(costo)} y vendido a Bs {bs(venta)} deja {m:.0%} de margen; "
                 f"en el peor caso, {peor:.0%}.{ojo} Vendedor {it['vendedor']} ({it['feedback_pct']:g} %). {it['link']} "
                 f"No compré nada: si te interesa, lo decides tú.")
        avisar(texto, probar)
        nuevos += 1
        if not probar:
            estado[it["link"]] = it["total_usd"]
    if not probar:
        json.dump(estado, open(ESTADO, "w", encoding="utf-8"))
    print(f"{AHORA:%d/%m %H:%M} cazador: {nuevos} aviso(s)")


def guardar_topes():
    ruta = os.path.join(DIR, "vigilar.csv")
    filas = list(csv.DictReader(open(ruta, encoding="utf-8")))
    cols = list(filas[0].keys())
    tp = {t["producto"]: t["tope_usd"] for t in topes()}
    for f in filas:
        f["precio_max_usd"] = "" if tp.get(f["producto"]) is None else str(tp[f["producto"]])
    w = csv.DictWriter(open(ruta, "w", encoding="utf-8", newline=""), fieldnames=cols, lineterminator="\n")
    w.writeheader()
    w.writerows(filas)


if __name__ == "__main__":
    if "--topes" in sys.argv or "--guardar-topes" in sys.argv:
        for t in topes():
            print(f"{t['producto']:<45} {('USD ' + str(t['tope_usd'])) if t['tope_usd'] else '—':>10}  "
                  f"{('Cochabamba Bs ' + str(t.get('mediana_bs'))) if t.get('mediana_bs') else ''}  {t.get('por_que', '')}")
        if "--guardar-topes" in sys.argv:
            guardar_topes()
            print("Topes guardados en vigilar.csv (precio_max_usd)")
    else:
        cazar("--probar" in sys.argv)
