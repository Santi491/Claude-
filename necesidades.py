#!/usr/bin/env python3
"""Qué le falta al equipo para trabajar bien: lo que piden los agentes y los huecos que se ven en los datos.

    python3 necesidades.py            # texto para Santi
    python3 necesidades.py --json     # para el bot y el Gerente
    python3 necesidades.py --breve    # 3-6 líneas, para meter en un mensaje

Fuentes: necesidades.csv (pedidos explícitos de los agentes, estado abierta/resuelta), plan.csv, vigilar.csv,
precios-cochabamba.csv, precios-eeuu.csv, tipo-cambio.csv y pedidos.csv. No inventa nada: solo cuenta lo que está en los archivos.
"""
import argparse
import csv
import json
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

DIR = os.path.dirname(os.path.abspath(__file__))
HOY = datetime.now(ZoneInfo("America/La_Paz")).date()
NOMBRE = {"nube": "la Nube", "ebay": "el Rastreador eBay", "wa": "WhatsApp", "mkt": "Marketplace", "ana": "el Analista",
          "pedidos": "Pedidos", "gerente": "el Gerente", "fin": "Finanzas", "dem": "el Analista de demanda", "local": "la ronda local", "todos": "todo el equipo"}


def leer(nombre):
    ruta = os.path.join(DIR, nombre)
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def fecha(s):
    try:
        return date.fromisoformat((s or "")[:10])
    except ValueError:
        return None


def calcular():
    pedidos_agentes = [r for r in leer("necesidades.csv") if r.get("estado", "abierta") != "resuelta"]

    plan = leer("plan.csv")
    sin_decidir = [r for r in plan if r.get("estado") == "propuesto"]
    trabadas = [r for r in plan if r.get("estado") == "aprobado" and (fecha(r.get("fecha_para")) or HOY) < HOY]

    productos = [r["producto"] for r in leer("vigilar.csv")]
    limite = HOY - timedelta(days=30)
    locales = {}
    for r in leer("precios-cochabamba.csv"):
        f = fecha(r.get("fecha"))
        estado = (r.get("estado") or "").lower()
        if f and f >= limite and "no cuenta" not in estado and "solo referencia" not in estado:
            locales.setdefault(r["producto"], []).append(r)
    sin_local = [p for p in productos if p not in locales]
    un_local = [p for p in productos if len(locales.get(p, [])) == 1]

    eeuu = {}
    for r in leer("precios-eeuu.csv"):
        f = fecha(r.get("fecha"))
        if f and r.get("tipo") == "real":
            eeuu[r["producto"]] = max(eeuu.get(r["producto"], f), f)
    sin_ebay = [p for p in productos if p not in eeuu or eeuu[p] < HOY - timedelta(days=2)]

    dolar = max([fecha(r.get("fecha")) for r in leer("tipo-cambio.csv") if fecha(r.get("fecha"))] or [None])
    pedidos_quietos = [r for r in leer("pedidos.csv") if r.get("estado") not in ("entregado", "")
                       and (fecha(r.get("actualizado")) or HOY) < HOY - timedelta(days=2)]

    ideas = [{"id": i, "agente": r.get("agente"), "idea": r.get("idea")}
             for i, r in enumerate(leer("ideas.csv"), 1) if r.get("estado") == "propuesta"]
    return {
        "fecha": HOY.isoformat(),
        "ideas_pendientes": ideas,
        "pedidos_agentes": [{"fecha": r.get("fecha"), "agente": r.get("agente"), "necesita": r.get("necesita"),
                             "para_que": r.get("para_que"), "quien": r.get("quien", "Santi")} for r in pedidos_agentes],
        "decisiones_pendientes": [{"id": r["id"], "agente": r["agente"], "tarea": r["tarea"]} for r in sin_decidir],
        "tareas_trabadas": [{"id": r["id"], "agente": r["agente"], "tarea": r["tarea"]} for r in trabadas],
        "productos_sin_precio_local": sin_local,
        "productos_con_un_solo_precio_local": un_local,
        "productos_sin_ebay_reciente": sin_ebay,
        "dolar_ultimo": dolar.isoformat() if dolar else None,
        "pedidos_sin_rastrear": [r.get("producto") for r in pedidos_quietos],
    }


def texto(n, breve=False):
    lineas = []
    for p in n["pedidos_agentes"]:
        quien = NOMBRE.get(p["agente"], p["agente"])
        linea = f"{quien} necesita {p['necesita']}" + (f", para {p['para_que']}" if p.get("para_que") else "")
        lineas.append(linea[0].upper() + linea[1:])
    if n["decisiones_pendientes"]:
        lineas.append(f"El equipo espera tu decisión en {len(n['decisiones_pendientes'])} tareas del plan (escribe 'plan').")
    if n.get("ideas_pendientes"):
        lineas.append(f"Hay {len(n['ideas_pendientes'])} ideas de los agentes esperando tu OK (se aprueban en la oficina, botón Necesidades e ideas).")
    if n["tareas_trabadas"]:
        lineas.append(f"{len(n['tareas_trabadas'])} tareas aprobadas se pasaron de fecha sin hacerse: " +
                      ", ".join(f"{t['id']} ({NOMBRE.get(t['agente'], t['agente'])})" for t in n["tareas_trabadas"][:4]))
    if n["productos_sin_precio_local"]:
        lineas.append("Al Analista le falta el precio en Cochabamba de: " + ", ".join(n["productos_sin_precio_local"]))
    if n["productos_con_un_solo_precio_local"] and not breve:
        lineas.append("Solo hay un precio local (comparación débil) de: " + ", ".join(n["productos_con_un_solo_precio_local"]))
    if n["productos_sin_ebay_reciente"]:
        lineas.append("Sin precio real de eBay de los últimos 2 días: " + ", ".join(n["productos_sin_ebay_reciente"]))
    if n["dolar_ultimo"] and n["dolar_ultimo"] < (HOY - timedelta(days=1)).isoformat():
        lineas.append(f"El dólar no se actualiza desde el {n['dolar_ultimo']}.")
    if n["pedidos_sin_rastrear"]:
        lineas.append("Pedidos sin rastrear hace más de 2 días: " + ", ".join(n["pedidos_sin_rastrear"]))
    if not lineas:
        return "El equipo tiene todo lo que necesita por ahora."
    return "\n".join(f"- {l}" for l in (lineas[:6] if breve else lineas))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--breve", action="store_true")
    a = ap.parse_args()
    n = calcular()
    print(json.dumps(n, ensure_ascii=False, indent=2) if a.json else texto(n, a.breve))


if __name__ == "__main__":
    main()
