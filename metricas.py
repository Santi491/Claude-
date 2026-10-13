#!/usr/bin/env python3
"""Métricas diarias del equipo de Cargo Brothers (las usa el Gerente).

Lee mensajes.csv, tiendas-cochabamba.csv, precios-*.csv, actividad.csv, pedidos.csv, tipo-cambio.csv
y la tabla del día de historial/, y guarda una fila por día en metricas.csv (si el día ya existe, la reemplaza).

    python3 metricas.py                 # hoy (hora de Bolivia)
    python3 metricas.py --fecha 2026-10-13
    python3 metricas.py --json          # además imprime el día en JSON
"""
import argparse
import csv
import json
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

DIR = os.path.dirname(os.path.abspath(__file__))
AGENTES = ["nube", "ebay", "wa", "mkt", "ana", "pedidos", "gerente"]
LIMITE_CHATS = 10
COLUMNAS = (["fecha", "chats_nuevos", "seguimientos", "respuestas", "respuestas_con_precio", "automaticas",
             "tiendas_total", "tiendas_nuevas", "tiendas_contactadas_7d", "tiendas_respondieron_7d", "tasa_respuesta_7d",
             "tiendas_esperando", "tiendas_sin_respuesta_3d", "tiendas_cerradas",
             "precios_locales_nuevos", "precios_ebay_nuevos", "productos_con_precio_local", "productos_total",
             "convienen", "justos", "mejor_producto", "mejor_margen", "dolar_bcb", "dolar_paralelo", "dolar_calculos",
             "pedidos_activos", "pedidos_entregados", "pedidos_prueba_activos"]
            + [f"act_{a}" for a in AGENTES] + ["alertas"])


def hoy_bolivia():
    return datetime.now(ZoneInfo("America/La_Paz")).date().isoformat()


def leer(nombre):
    ruta = os.path.join(DIR, nombre)
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def calcular(fecha):
    d = date.fromisoformat(fecha)
    hace7 = (d - timedelta(days=6)).isoformat()
    hace3 = (d - timedelta(days=3)).isoformat()
    msj, tiendas, cbba = leer("mensajes.csv"), leer("tiendas-cochabamba.csv"), leer("precios-cochabamba.csv")
    eeuu, act, vig = leer("precios-eeuu.csv"), leer("actividad.csv"), leer("vigilar.csv")
    pedidos, prueba, fx = leer("pedidos.csv"), leer("pedidos-prueba.csv"), leer("tipo-cambio.csv")

    del_dia = [m for m in msj if m["fecha"] == fecha]
    env = lambda t: [m for m in del_dia if m["direccion"] == "enviado" and m["tipo"] == t]
    rec = lambda t: [m for m in del_dia if m["direccion"] == "recibido" and m["tipo"] == t]
    primera = {}
    for m in sorted(msj, key=lambda m: (m["fecha"], m["hora"])):
        if m["direccion"] == "enviado" and m["tipo"] == "nuevo":
            primera.setdefault(m["tienda"], m["fecha"])
    semana = [m for m in msj if hace7 <= m["fecha"] <= fecha]
    contactadas = {m["tienda"] for m in semana if m["direccion"] == "enviado"}
    respondieron = {m["tienda"] for m in semana if m["direccion"] == "recibido" and m["tipo"] == "respuesta"}

    estado = lambda t: t.get("estado_contacto", "").lower()
    esperando = [t for t in tiendas if "esperando" in estado(t)]
    sin_resp = [t for t in esperando if t.get("ultima_consulta") and t["ultima_consulta"] <= hace3]
    cerradas = [t for t in tiendas if any(k in estado(t) for k in ("no vende", "sin stock", "no contactar", "sin whatsapp"))]

    con_precio = {f["producto"] for f in cbba if f["fecha"] <= fecha and "no cuenta" not in f.get("estado", "")
                  and not any(c in f.get("fuente", "") for c in ("La Paz", "Santa Cruz"))}
    productos = [v["producto"] for v in vig]

    # Oportunidades: la tabla del día que deja reportes.py (o la última disponible)
    convienen = justos = 0
    mejor, mejor_m = "", ""
    tablas = sorted(f for f in os.listdir(os.path.join(DIR, "historial")) if f[:10] <= fecha and f.endswith(".csv") and f[0] == "2") \
        if os.path.isdir(os.path.join(DIR, "historial")) else []
    if tablas:
        filas = leer(os.path.join("historial", tablas[-1]))
        convienen = sum(1 for f in filas if f.get("Estado") == "Conviene")
        justos = sum(1 for f in filas if f.get("Estado") == "Justo")
        conm = [f for f in filas if num(f.get("Margen")) is not None]
        if conm:
            b = max(conm, key=lambda f: num(f["Margen"]))
            mejor, mejor_m = b["Producto"], round(num(b["Margen"]), 4)

    fxd = max((f for f in fx if f["fecha"] <= fecha), key=lambda f: f["fecha"], default={})
    par = None
    if num(fxd.get("paralelo_compra")) and num(fxd.get("paralelo_venta")):
        par = round((num(fxd["paralelo_compra"]) + num(fxd["paralelo_venta"])) / 2, 3)

    activos = lambda filas: sum(1 for p in filas if p.get("estado") and p["estado"] != "entregado")
    acts = {a: sum(1 for x in act if x["fecha"] == fecha and x["agente"] == a) for a in AGENTES}

    r = {"fecha": fecha, "chats_nuevos": len(env("nuevo")), "seguimientos": len(env("seguimiento")),
         "respuestas": len(rec("respuesta")), "respuestas_con_precio": sum(1 for m in rec("respuesta") if m.get("con_precio") == "sí"),
         "automaticas": len(rec("automatica")),
         "tiendas_total": len(tiendas), "tiendas_nuevas": sum(1 for f in primera.values() if f == fecha),
         "tiendas_contactadas_7d": len(contactadas), "tiendas_respondieron_7d": len(respondieron & contactadas),
         "tasa_respuesta_7d": round(len(respondieron & contactadas) / len(contactadas), 3) if contactadas else "",
         "tiendas_esperando": len(esperando), "tiendas_sin_respuesta_3d": len(sin_resp), "tiendas_cerradas": len(cerradas),
         "precios_locales_nuevos": sum(1 for f in cbba if f["fecha"] == fecha),
         "precios_ebay_nuevos": sum(1 for f in eeuu if f["fecha"] == fecha),
         "productos_con_precio_local": len(con_precio & set(productos)), "productos_total": len(productos),
         "convienen": convienen, "justos": justos, "mejor_producto": mejor, "mejor_margen": mejor_m,
         "dolar_bcb": fxd.get("oficial", ""), "dolar_paralelo": par if par else "", "dolar_calculos": fxd.get("usado", ""),
         "pedidos_activos": activos(pedidos), "pedidos_entregados": sum(1 for p in pedidos if p.get("estado") == "entregado"),
         "pedidos_prueba_activos": activos(prueba)}
    r.update({f"act_{a}": n for a, n in acts.items()})

    alertas = []
    domingo = d.weekday() == 6
    if r["chats_nuevos"] > LIMITE_CHATS:
        alertas.append(f"se pasó el límite de chats nuevos ({r['chats_nuevos']}/{LIMITE_CHATS})")
    if not domingo:
        if not acts["nube"]:
            alertas.append("la rutina de la nube no anotó actividad hoy")
        if not r["precios_ebay_nuevos"]:
            alertas.append("no hay precios de eBay de hoy")
        if not acts["wa"]:
            alertas.append("WhatsApp no trabajó hoy")
        if not acts["mkt"]:
            alertas.append("Marketplace no trabajó hoy")
        if (pedidos or prueba) and not acts["pedidos"] and (r["pedidos_activos"] or r["pedidos_prueba_activos"]):
            alertas.append("hay pedidos en camino y nadie los rastreó hoy")
    if sin_resp:
        alertas.append(f"{len(sin_resp)} tiendas llevan 3 días o más sin responder")
    if not any(f["fecha"] == fecha for f in fx):
        alertas.append("falta el dólar de hoy en tipo-cambio.csv")
    r["alertas"] = " | ".join(alertas)
    r["_sin_respuesta"] = [t["tienda"] for t in sin_resp]
    return r


def guardar(r):
    ruta = os.path.join(DIR, "metricas.csv")
    filas = [f for f in leer("metricas.csv") if f["fecha"] != r["fecha"]]
    filas.append({k: r.get(k, "") for k in COLUMNAS})
    filas.sort(key=lambda f: f["fecha"])
    with open(ruta, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNAS, lineterminator="\n")
        w.writeheader()
        w.writerows(filas)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fecha", default=hoy_bolivia())
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    r = calcular(a.fecha)
    guardar(r)
    if a.json:
        print(json.dumps(r, ensure_ascii=False, indent=2))
    else:
        print(f"metricas.csv: {a.fecha} · {r['chats_nuevos']} chats nuevos · {r['respuestas']} respuestas · "
              f"{r['precios_locales_nuevos']} precios locales · {r['convienen']} convienen · alertas: {r['alertas'] or 'ninguna'}")


if __name__ == "__main__":
    main()
