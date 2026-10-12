#!/usr/bin/env python3
"""Tabla de comparación: costo puesto en Cochabamba (eBay + courier) contra precios locales.

Lee vigilar.csv, precios-eeuu.csv y precios-cochabamba.csv y escribe comparacion.md.
Mismos supuestos que la oficina de agentes (artefacto "Importación Cochabamba").

    python3 comparar.py                          # nuevo, 11,90 Bs/USD
    python3 comparar.py --tc 11.88 --aduana 10
"""
import argparse
import csv
import math
import os
from datetime import date

DIR = os.path.dirname(os.path.abspath(__file__))
CAJA_EXTERIOR_G = 300           # caja exterior + relleno del courier B
B_USD_KG, B_MIN_KG, B_PASO_KG = 28, 1.0, 0.5
A_USD_UNIDAD = 10
CONVIENE, JUSTO = 0.15, 0.05     # margen sobre el mejor precio local


def leer(nombre):
    with open(os.path.join(DIR, nombre), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def courier_b(peso_g, cant):
    kg = max(B_MIN_KG, math.ceil((peso_g * cant + CAJA_EXTERIOR_G) / 1000 / B_PASO_KG - 1e-9) * B_PASO_KG)
    return kg * B_USD_KG / cant, kg


def costo(oferta, peso_g, cant, tc, tax, aduana):
    """Costo puesto por unidad en Bs con el courier más barato."""
    base = float(oferta["precio_usd"]) + float(oferta["envio_usd"] or 0)
    b, kg = courier_b(peso_g, cant)
    a = A_USD_UNIDAD + float(oferta["precio_usd"]) * tax
    envio, via = (a, "A") if a < b else (b, f"B {kg:g} kg")
    return (base + envio + base * aduana) * tc, via


def bs(n):
    return f"{n:,.0f}".replace(",", ".")


def oferta(filas, producto, condicion):
    """La oferta real más reciente de eBay; 'min' elige la más barata entre nuevo y usado."""
    cand = [f for f in filas if f["producto"] == producto and f["precio_usd"]]
    ult = {}
    for f in sorted(cand, key=lambda f: (f["fecha"], f["tipo"] == "real")):
        ult[f["condicion"]] = f
    if condicion == "min":
        return min(ult.values(), key=lambda f: float(f["precio_usd"]) + float(f["envio_usd"] or 0), default=None)
    return ult.get(condicion)


def locales(filas, producto):
    """Precios de Cochabamba que cuentan (sin otras ciudades ni anuncios de otro modelo)."""
    return [f for f in filas if f["producto"] == producto and "no cuenta" not in f["estado"]
            and not any(c in f["fuente"] for c in ("La Paz", "Santa Cruz"))]


def veredicto(m):
    return "conviene" if m >= CONVIENE else "justo" if m >= JUSTO else "no conviene"


def tabla(vigilar, eeuu, cbba, condicion, a):
    filas, detalle, sin = [], [], []
    for v in vigilar:
        prod, peso = v["producto"], float(v["peso_g_con_caja"])
        of, loc = oferta(eeuu, prod, condicion), locales(cbba, prod)
        if not of or not loc:
            falta = " y ".join(x for x, ok in (("eBay " + condicion, of), ("Cochabamba", loc)) if not ok)
            sin.append(f"- **{prod}**: falta precio de {falta}")
            continue
        c2, via2 = costo(of, peso, 2, a.tc, a.tax, a.aduana)
        c4, via4 = costo(of, peso, 4, a.tc, a.tax, a.aduana)
        mejor = min(loc, key=lambda f: float(f["precio_bs"]))
        p = float(mejor["precio_bs"])
        g2, g4 = p - c2, p - c4
        est = "" if of["tipo"] == "real" else " (est.)"
        usd = float(of["precio_usd"]) + float(of["envio_usd"] or 0)
        filas.append((g2 / p, f"| {prod} | [{usd:,.2f}]({of['link']}){est} | {bs(c2)} ({via2}) | {bs(c4)} ({via4}) "
                              f"| {bs(p)} | {bs(g2)} ({g2 / p:.0%}) | {bs(g4)} ({g4 / p:.0%}) | {veredicto(g2 / p)} |"))
        lineas = []
        for f in sorted(loc, key=lambda f: float(f["precio_bs"])):
            pl = float(f["precio_bs"])
            link = f" · [ver]({f['link']})" if f["link"] else ""
            lineas.append(f"| {f['fuente']}{link} | {f['estado']} | {bs(pl)} | {bs(pl - c2)} ({(pl - c2) / pl:.0%}) | {f['fecha']} |")
        detalle.append(f"### {prod}\neBay {of['condicion']}: USD {usd:,.2f} con envío en EE.UU. ({of['fuente']}, {of['fecha']}). "
                       f"Costo puesto: **Bs {bs(c2)}**/u en pedido de 2, **Bs {bs(c4)}**/u en pedido de 4.\n\n"
                       "| Vendedor en Cochabamba | Estado | Precio Bs | Ganancia por u (2 u) | Fecha |\n|---|---|---|---|---|\n"
                       + "\n".join(lineas) + "\n")
    filas.sort(reverse=True)
    return [r for _, r in filas], detalle, sin


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tc", type=float, default=11.90, help="Bs por USD")
    ap.add_argument("--tax", type=float, default=7, help="sales tax del courier A, %%")
    ap.add_argument("--aduana", type=float, default=0, help="aduana boliviana, %% del valor")
    a = ap.parse_args()
    a.tax, a.aduana = a.tax / 100, a.aduana / 100

    vigilar, eeuu, cbba = leer("vigilar.csv"), leer("precios-eeuu.csv"), leer("precios-cochabamba.csv")
    enc = ("| Producto | eBay USD | Costo puesto 2 u (Bs/u) | Costo puesto 4 u (Bs/u) | Mejor local Bs "
           "| Ganancia 2 u | Ganancia 4 u | Estado |\n|---|---|---|---|---|---|---|---|")
    nuevo, detalle, sin = tabla(vigilar, eeuu, cbba, "nuevo", a)
    usado, _, _ = tabla(vigilar, eeuu, cbba, "usado", a)

    out = [
        f"# Comparación EE.UU. → Cochabamba ({date.today().isoformat()})", "",
        f"Tipo de cambio **{a.tc:.2f} Bs/USD** · Courier B: USD {B_USD_KG}/kg, mínimo {B_MIN_KG:g} kg, saltos de {B_PASO_KG:g} kg, "
        f"+ {CAJA_EXTERIOR_G} g de caja exterior · Courier A: USD {A_USD_UNIDAD}/u + {a.tax:.0%} tax · "
        f"Aduana: {a.aduana:.0%}{' (sin confirmar: no incluida)' if not a.aduana else ''}.",
        f"Estado sobre el **mejor precio local** y pedido de 2: conviene ≥ {CONVIENE:.0%}, justo {JUSTO:.0%}–{CONVIENE:.0%}, "
        f"no conviene < {JUSTO:.0%}. Los precios de Marketplace son lo que piden los vendedores.", "",
        "## eBay nuevo", "", enc, *nuevo, "",
        "## eBay usado (mejor caso: se compara contra precios locales de nuevos)", "", enc, *usado, "",
        "## Detalle por vendedor (eBay nuevo)", "", *detalle,
        "## Sin comparación todavía (eBay nuevo)", "", *sin, "",
        "_Generado con `python3 comparar.py`._",
    ]
    with open(os.path.join(DIR, "comparacion.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
