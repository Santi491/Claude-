#!/usr/bin/env python3
"""Analista de demanda: qué componentes se mueven más en Cochabamba, con lo que anota la ronda de Marketplace en demanda.csv.

    python3 demanda.py            # texto
    python3 demanda.py --json     # para la oficina y el Gerente

demanda.csv (una fila por producto, fuente y día en que se miró): fecha, producto, fuente (marketplace | tienda | web),
ciudad, anuncios (cuántos anuncios activos se vieron en Cochabamba), nuevos (aparecieron desde la última vez),
desaparecidos (estaban la última vez y ya no: se vendieron o los quitaron), precio_min_bs, precio_med_bs, nota.
Un producto que no está en vigilar.csv es un candidato. Solo cuenta lo que está en el archivo; con pocos días de datos lo dice.
"""
import argparse
import csv
import json
import os
from datetime import date, timedelta
from statistics import mean

DIR = os.path.dirname(os.path.abspath(__file__))
DIAS = 14


def leer(nombre):
    ruta = os.path.join(DIR, nombre)
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


def calcular():
    vig = {r["producto"] for r in leer("vigilar.csv")}
    filas = leer("demanda.csv")
    if not filas:
        return {"hay_datos": False, "productos": [], "dias": 0, "vigilados_sin_dato": sorted(vig)}
    ultimo = max(r["fecha"] for r in filas)
    desde = (date.fromisoformat(ultimo) - timedelta(days=DIAS - 1)).isoformat()
    rec = [r for r in filas if r["fecha"] >= desde]
    out = []
    for p in sorted({r["producto"] for r in rec}):
        rs = sorted([r for r in rec if r["producto"] == p], key=lambda r: r["fecha"])
        dias = sorted({r["fecha"] for r in rs})
        anuncios = [num(r["anuncios"]) for r in rs if num(r["anuncios"]) is not None]
        desap = sum(num(r["desaparecidos"]) or 0 for r in rs)
        nuevos = sum(num(r["nuevos"]) or 0 for r in rs)
        precios = [num(r["precio_med_bs"]) or num(r["precio_min_bs"]) for r in rs]
        precios = [x for x in precios if x]
        semanas = ((date.fromisoformat(dias[-1]) - date.fromisoformat(dias[0])).days + 1) / 7   # semanas que cubren los datos
        rot = desap / semanas if len(dias) > 1 else None   # anuncios que se van por semana
        prom = mean(anuncios) if anuncios else 0
        # puntaje simple: rotación pesa el doble que la cantidad de anuncios; sin rotación todavía, solo anuncios
        puntaje = round((rot or 0) * 2 + prom, 1)
        tendencia = None
        if len(precios) >= 2:
            tendencia = round((precios[-1] - precios[0]) / precios[0], 3)
        out.append({"producto": p, "vigilado": p in vig, "dias": len(dias), "anuncios_prom": round(prom, 1),
                    "nuevos": int(nuevos), "desaparecidos": int(desap), "rotacion_semana": round(rot, 1) if rot is not None else None,
                    "precio_ultimo_bs": precios[-1] if precios else None, "tendencia_precio": tendencia, "puntaje": puntaje})
    out.sort(key=lambda x: -x["puntaje"])
    for x in out:
        if x["dias"] < 3:
            x["lectura"] = "pocos datos todavía"
        elif not x["vigilado"] and x["puntaje"] >= (out[0]["puntaje"] * 0.6):
            x["lectura"] = "candidato a agregar a vigilar.csv"
        elif x["vigilado"] and x["puntaje"] <= (out[0]["puntaje"] * 0.2):
            x["lectura"] = "se mueve poco: evaluar sacarlo"
        else:
            x["lectura"] = "demanda normal"
    vistos = {x["producto"] for x in out}
    return {"hay_datos": True, "desde": desde, "hasta": ultimo, "dias": len({r["fecha"] for r in rec}),
            "productos": out, "vigilados_sin_dato": sorted(vig - vistos)}


def texto(d):
    if not d["hay_datos"]:
        return "Sin datos de demanda todavía: la ronda de Marketplace empieza a contar anuncios en demanda.csv."
    l = [f"Demanda en Cochabamba ({d['desde']} a {d['hasta']}, {d['dias']} días con datos):"]
    for x in d["productos"][:10]:
        rot = "—" if x["rotacion_semana"] is None else f"{x['rotacion_semana']}/sem"
        l.append(f"- {x['producto']}{'' if x['vigilado'] else ' (candidato)'}: {x['anuncios_prom']} anuncios, se van {rot} · {x['lectura']}")
    if d["vigilados_sin_dato"]:
        l.append("Sin dato de demanda: " + ", ".join(d["vigilados_sin_dato"]))
    return "\n".join(l)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    d = calcular()
    print(json.dumps(d, ensure_ascii=False, indent=2) if a.json else texto(d))


if __name__ == "__main__":
    main()
