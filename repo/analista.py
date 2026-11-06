#!/usr/bin/env python3
"""Analista: costo completo puesto en Cochabamba, margen y recargo, escenarios, datos que faltan y recomendación.

    python3 analista.py                 # tabla en texto
    python3 analista.py --json          # para el Gerente y la oficina
    python3 analista.py --md            # escribe analisis.md (lo lee el Gerente y el Archivo de la oficina)

Usa los mismos supuestos que comparar.py (pedido de 2 unidades, courier más barato, aduana 0 %, sales tax 7 % del courier A).
- Costo completo por unidad = (precio eBay + envío en EE.UU. + sales tax si va por el courier A + courier) × dólar.
- Margen = (precio de venta − costo) / precio de venta   ·   Recargo = (precio de venta − costo) / costo.
  El precio de venta de referencia es 5 % debajo de la MEDIANA de los precios locales válidos (redondeado a 10 hacia
  abajo; antes era el más barato). Se descartan particulares de Marketplace sin marca/configuración y los 30 % bajo la mediana. Si a ese precio no queda al menos 10 % sobre el costo, no se trae.
- Escenarios: dólar +3 %, courier +20 %, precio local −10 % y los tres juntos (el peor caso).
- Recomendación: "traer" solo si el margen aguanta el peor caso (≥ 5 %) y hay al menos 2 precios locales recientes;
  "esperar" si conviene hoy pero el peor caso lo borra o faltan datos; "no traer" si hoy no conviene.
Nunca inventa: si falta un dato, lo dice en `faltan`.
"""
import json
import math
import os
import statistics
import sys
from datetime import date, datetime

import comparar as C

DIR = os.path.dirname(os.path.abspath(__file__))
HOY = date.today()
SIN_DATO = ("marca sin dato", "marca no indicada", "config no indicada", "configuración no indicada", "ni marca",
            "probablemente", "no dice si")  # anuncio sin marca o sin configuración clara (un estado sin dato pero con marca sí cuenta)


def num(v):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


def dias(f):
    try:
        return (HOY - datetime.strptime(f[:10], "%Y-%m-%d").date()).days
    except (TypeError, ValueError):
        return None


def costo_completo(of, peso, cant, tc, tax=C.A_TAX_DEF, courier_x=1.0):
    base = float(of["precio_usd"]) + float(of["envio_usd"] or 0)
    b, kg = C.courier_b(peso, cant)
    a = C.A_USD_UNIDAD + float(of["precio_usd"]) * tax
    envio, via = (a, "A") if a < b else (b, f"B {kg:g} kg")
    return (base + envio * courier_x) * tc, via, {"ebay_usd": round(base, 2), "courier_usd": round(envio * courier_x, 2)}


def analizar():
    vig, ee, pcb = C.leer("vigilar.csv"), C.leer("precios-eeuu.csv"), C.leer("precios-cochabamba.csv")
    fx = [f for f in C.leer("tipo-cambio.csv") if num(f.get("usado"))]
    tc = num(fx[-1]["usado"]) if fx else None
    out = []
    for v in vig:
        prod, peso = v["producto"], num(v.get("peso_g_con_caja")) or 350
        loc_todos = [f for f in C.locales(pcb, prod) if num(f.get("precio_bs")) and "viejo" not in f.get("estado", "")
                     and "agotado" not in f.get("estado", "") and "mayorista" not in (f.get("condiciones") or "").lower()]
        for cond in ("nuevo", "usado"):
            of = C.oferta(ee, prod, cond)
            faltan = []
            loc = loc_todos
            if cond == "usado":
                # un usado se vende como usado: se compara con usados de Cochabamba; si no hay, con nuevos y nunca se recomienda "traer"
                usados = [f for f in loc_todos if "usad" in (f.get("estado") or "").lower()]
                if usados:
                    loc = usados
                else:
                    faltan.append("precio local de usados (se comparó con nuevos)")
            # particulares sin marca/configuración (Marketplace): fuera, si quedan al menos 2 precios; luego, atípicos: con 3 o más
            # precios, fuera los que están 30 % o más debajo de la mediana. La referencia local es la MEDIANA, no el más barato.
            sin_dato = [f for f in loc if "marketplace" in (f.get("fuente") or "").lower()
                        and any(k in (f.get("estado") or "").lower() for k in SIN_DATO)]
            if sin_dato and len(loc) - len(sin_dato) >= 2:
                loc = [f for f in loc if f not in sin_dato]
                faltan.append(f"{len(sin_dato)} anuncio(s) de particular sin marca o configuración descartado(s)")
            if len(loc) >= 3:
                med = statistics.median(num(f["precio_bs"]) for f in loc)
                atip = [f for f in loc if num(f["precio_bs"]) < 0.7 * med]
                if atip:
                    loc = [f for f in loc if f not in atip]
                    faltan.append(f"{len(atip)} precio(s) local(es) atípico(s) (30 % bajo la mediana) descartado(s)")
            recientes = [f for f in loc if dias(f["fecha"]) is not None and dias(f["fecha"]) <= 14]
            tiendas = {(f.get("fuente") or "").split("(")[0].strip().lower() for f in recientes}
            if not tc:
                faltan.append("dólar del día")
            if not of:
                faltan.append(f"precio de eBay {cond}")
            elif dias(of["fecha"]) is None or dias(of["fecha"]) > 2:
                faltan.append(f"eBay {cond} viejo ({of['fecha']})")
            if not loc:
                faltan.append("precio local")
            elif len(tiendas) < 2:
                faltan.append("precios recientes (14 días) de al menos 2 tiendas distintas")
            fila = {"producto": prod, "condicion": cond, "faltan": faltan}
            if of and tc and loc:
                costo, via, partes = costo_completo(of, peso, 2, tc)
                mejor = statistics.median(num(f["precio_bs"]) for f in loc)  # referencia local = mediana de los válidos
                # precio de mercado: 5 % debajo de la mediana local; si no deja ni 10 % sobre el costo, no se trae
                venta = math.floor(mejor * 0.95 / 10) * 10
                g = venta - costo
                esc = {}
                for nombre, (dx, cx, lx) in {"dólar +3 %": (1.03, 1, 1), "courier +20 %": (1, 1.2, 1),
                                             "local −10 %": (1, 1, 0.9), "peor caso": (1.03, 1.2, 0.9)}.items():
                    c2, _, _ = costo_completo(of, peso, 2, tc * dx, courier_x=cx)
                    v2 = math.floor(mejor * lx * 0.95 / 10) * 10
                    esc[nombre] = round((v2 - c2) / v2 * 100, 1) if v2 else None
                margen = g / venta
                if g / costo < 0.10 or margen < C.JUSTO:
                    rec, por = "no traer", f"margen {margen:.0%} con el precio sugerido"
                elif (esc["peor caso"] or -1) >= 5 and len(tiendas) >= 2 and not any("viejo" in x or "usados" in x for x in faltan):
                    rec, por = "traer", f"aguanta el peor caso ({esc['peor caso']} %)"
                else:
                    rec, por = "esperar", ("el peor caso lo deja en " + f"{esc['peor caso']} %" if (esc["peor caso"] or -1) < 5
                                           else "faltan datos: " + ", ".join(faltan))
                fila |= {"ebay_usd": partes["ebay_usd"], "courier_usd": partes["courier_usd"], "via": via, "tc": tc,
                         "costo_bs": round(costo), "mejor_local_bs": round(mejor), "precios_locales": len(loc),
                         "precio_sugerido_bs": venta, "ganancia_bs": round(g), "margen_pct": round(margen * 100, 1),
                         "recargo_pct": round(g / costo * 100, 1), "escenarios_margen_pct": esc,
                         "recomendacion": rec, "por_que": por, "link_ebay": of.get("link", "")}
            else:
                fila |= {"recomendacion": "sin datos", "por_que": "faltan: " + ", ".join(faltan)}
            out.append(fila)
    orden = {"traer": 0, "esperar": 1, "no traer": 2, "sin datos": 3}
    out.sort(key=lambda f: (orden[f["recomendacion"]], -(f.get("margen_pct") or -999)))
    return {"fecha": HOY.isoformat(), "tc": tc, "supuestos": "pedido de 2 u, courier más barato, aduana 0 %, tax A 7 %, "
            "precio de venta = 5 % debajo de la mediana local (si no deja 10 % sobre el costo: no traer)", "productos": out}


def texto(a):
    L = [f"Analista · {a['fecha']} · dólar {a['tc']} · {a['supuestos']}", ""]
    for f in a["productos"]:
        if f["recomendacion"] == "sin datos":
            L.append(f"- {f['producto']} ({f['condicion']}): sin datos ({', '.join(f['faltan'])})")
            continue
        e = f["escenarios_margen_pct"]
        L.append(f"- {f['producto']} ({f['condicion']}): {f['recomendacion'].upper()} · costo Bs {f['costo_bs']:,} ({f['via']}) · "
                 f"venta sugerida Bs {f['precio_sugerido_bs']:,} · margen {f['margen_pct']} % / recargo {f['recargo_pct']} % · "
                 f"peor caso {e['peor caso']} % · {f['por_que']}".replace(",", "."))
    return "\n".join(L)


def md(a):
    L = [f"# Análisis del Analista ({a['fecha']})", "", f"Dólar {a['tc']} · {a['supuestos']}.",
         "Margen = ganancia / precio de venta · Recargo = ganancia / costo. Escenarios: margen si el dólar sube 3 %, el courier cobra 20 % más, "
         "el precio local baja 10 % o todo junto.", "",
         "| Producto | Cond. | Costo Bs/u | Venta sugerida | Margen | Recargo | Dólar +3 % | Courier +20 % | Local −10 % | Peor caso | Recomendación | Falta |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for f in a["productos"]:
        if f["recomendacion"] == "sin datos":
            L.append(f"| {f['producto']} | {f['condicion']} | — | — | — | — | — | — | — | — | sin datos | {', '.join(f['faltan'])} |")
            continue
        e = f["escenarios_margen_pct"]
        L.append(f"| {f['producto']} | {f['condicion']} | {C.bs(f['costo_bs'])} | {C.bs(f['precio_sugerido_bs'])} | {f['margen_pct']} % | "
                 f"{f['recargo_pct']} % | {e['dólar +3 %']} % | {e['courier +20 %']} % | {e['local −10 %']} % | {e['peor caso']} % | "
                 f"**{f['recomendacion']}** ({f['por_que']}) | {', '.join(f['faltan']) or '—'} |")
    return "\n".join(L) + "\n"


def main():
    a = analizar()
    if "--md" in sys.argv:
        open(os.path.join(DIR, "analisis.md"), "w", encoding="utf-8").write(md(a))
        print("analisis.md escrito")
    print(json.dumps(a, ensure_ascii=False, indent=1) if "--json" in sys.argv else texto(a))


if __name__ == "__main__":
    main()
