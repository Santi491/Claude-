#!/usr/bin/env python3
"""Tabla de comparación: costo puesto en Cochabamba (EE.UU. + courier) contra precios locales.

Lee vigilar.csv, precios-eeuu.csv y precios-cochabamba.csv y escribe comparacion.md.

    python3 comparar.py                 # tipo de cambio 11,90
    python3 comparar.py --tc 11.88
"""
import argparse
import csv
import math
import os
import statistics
from datetime import date

DIR = os.path.dirname(os.path.abspath(__file__))
CAJA_EXTERIOR_G = 300          # caja exterior + relleno del courier B
B_USD_KG, B_MIN_KG, B_PASO_KG = 28, 1.0, 0.5
A_USD_UNIDAD, A_TAX = 10, 0.07  # % de tax de A: pendiente de confirmar


def leer(nombre):
    with open(os.path.join(DIR, nombre), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def courier_b(peso_g, cant):
    kg = (peso_g * cant + CAJA_EXTERIOR_G) / 1000
    cobrado = max(B_MIN_KG, math.ceil(kg / B_PASO_KG - 1e-9) * B_PASO_KG)
    return cobrado * B_USD_KG / cant, cobrado


def costo_unidad(precio, envio, peso_g, cant):
    """Costo puesto por unidad en USD con el courier más barato."""
    b, kg = courier_b(peso_g, cant)
    costo_b = precio + envio + b
    costo_a = (precio + envio) * (1 + A_TAX) + A_USD_UNIDAD
    return (costo_b, f"B, {kg:g} kg") if costo_b <= costo_a else (costo_a, "A")


def bs(n):
    return f"{n:,.0f}".replace(",", ".")


def ultimo_eeuu(filas, producto):
    """Precio de EE.UU. más reciente; los reales ganan a los estimados del mismo día o anteriores."""
    cand = [f for f in filas if f["producto"] == producto and f["precio_usd"]]
    cand.sort(key=lambda f: (f["fecha"], f["tipo"] == "real"))
    reales = [f for f in cand if f["tipo"] == "real"]
    return (reales or cand or [None])[-1]


def locales(filas, producto):
    """Precios de Cochabamba del producto (se excluyen los de otras ciudades)."""
    return [f for f in filas if f["producto"] == producto and "La Paz" not in f["fuente"]
            and "Santa Cruz" not in f["fuente"]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tc", type=float, default=11.90, help="Bs por USD")
    a = ap.parse_args()

    vigilar, eeuu, cbba = leer("vigilar.csv"), leer("precios-eeuu.csv"), leer("precios-cochabamba.csv")
    hoy = date.today().isoformat()
    resumen, detalle, sin_datos = [], [], []

    for v in vigilar:
        prod, peso = v["producto"], float(v["peso_g_con_caja"])
        us, loc = ultimo_eeuu(eeuu, prod), locales(cbba, prod)
        if not us or not loc:
            falta = " y ".join(x for x, ok in (("EE.UU.", us), ("Cochabamba", loc)) if not ok)
            sin_datos.append(f"- **{prod}**: falta precio de {falta}")
            continue
        precio, envio = float(us["precio_usd"]), float(us["envio_usd"] or 0)
        c2, via2 = costo_unidad(precio, envio, peso, 2)
        c4, via4 = costo_unidad(precio, envio, peso, 4)
        c2bs, c4bs = c2 * a.tc, c4 * a.tc
        precios = sorted(float(f["precio_bs"]) for f in loc)
        minimo, mediana = precios[0], statistics.median(precios)
        gan = mediana - c4bs
        marca = " (est.)" if us["tipo"] != "real" else ""
        veredicto = ("conviene" if gan / mediana >= 0.20 else "margen justo" if gan / mediana >= 0.08
                     else "no conviene")
        resumen.append((gan / mediana, f"| {prod} | {precio:,.0f}{marca} | {bs(c2bs)} ({via2}) | {bs(c4bs)} ({via4}) "
                       f"| {bs(minimo)} | {bs(mediana)} | {bs(gan)} ({gan / mediana:.0%}) | {veredicto}{marca} |"))

        filas = []
        for f in sorted(loc, key=lambda f: float(f["precio_bs"])):
            p = float(f["precio_bs"])
            g = p - c4bs
            filas.append(f"| {f['fuente']} | {f['estado']} | {bs(p)} | {bs(g)} ({g / p:.0%}) | {f['fecha']} |")
        detalle.append(f"### {prod}\nEE.UU.: USD {precio:,.2f} + envío {envio:,.2f} — {us['tipo']} "
                       f"({us['fuente']}, {us['fecha']}). Costo puesto con 4 u: **Bs {bs(c4bs)}**/u.\n\n"
                       "| Vendedor | Estado | Precio Bs | Ganancia por u (4 u) | Fecha |\n|---|---|---|---|---|\n"
                       + "\n".join(filas) + "\n")

    resumen.sort(reverse=True)
    out = [
        f"# Comparación EE.UU. → Cochabamba ({hoy})", "",
        f"Tipo de cambio: **{a.tc:.2f} Bs/USD**. Courier B: USD {B_USD_KG}/kg, mínimo {B_MIN_KG:g} kg, saltos de "
        f"{B_PASO_KG:g} kg, + {CAJA_EXTERIOR_G} g de caja exterior. Courier A: USD {A_USD_UNIDAD}/u + {A_TAX:.0%} tax "
        "(pendiente de confirmar). **Aduana boliviana no incluida.**",
        "Los precios de EE.UU. marcados **(est.)** son estimados (sin anuncio real de eBay): el veredicto también.", "",
        "## Resumen (ordenado por margen)", "",
        "| Producto | EE.UU. USD | Costo puesto 2 u (Bs/u) | Costo puesto 4 u (Bs/u) | Local mín. | Local mediana "
        "| Ganancia por u vs mediana (4 u) | Veredicto |",
        "|---|---|---|---|---|---|---|---|",
        *[r for _, r in resumen], "",
        "Veredicto: ≥ 20% conviene, 8–20% margen justo, < 8% no conviene (sobre la mediana local, pedido de 4).", "",
        "## Detalle por vendedor", "", *detalle,
        "## Sin comparación todavía", "", *sin_datos, "",
        "_Generado con `python3 comparar.py`._",
    ]
    with open(os.path.join(DIR, "comparacion.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
