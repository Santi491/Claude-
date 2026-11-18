#!/usr/bin/env python3
"""Datos de la app de iPhone de Cargo Brothers (Santi, 18/11).

Arma app/datos-app.json, un resumen chico de la oficina para la app nativa (app-ios/), que lo lee desde GitHub.
Sale SOLO de oficina/datos.js (que ya pasó el filtro de privacidad de la oficina) y de analista.py --json:
nunca guías, números de pedido, direcciones, teléfonos ni nombres de personas. Lo corre oficina/generar.py al final.

    python3 app_datos.py
"""
import json
import os
import subprocess
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

DIR = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(DIR, "app", "datos-app.json")

ETAPAS = ["comprado", "enviado", "en bodega del courier", "en camino a Santa Cruz",
          "en camino a Cochabamba", "en Cochabamba", "entregado"]
NOMBRES = {"gerente": "Gerente", "wa": "WhatsApp", "mkt": "Marketplace", "ebay": "Rastreador eBay", "ana": "Analista",
           "pedidos": "Pedidos", "fin": "Finanzas", "dem": "Analista de demanda", "nube": "Informe diario",
           "local": "Oficina", "cat": "Catálogos"}


def leer_oficina():
    txt = open(os.path.join(DIR, "oficina", "datos.js"), encoding="utf-8").read()
    return json.loads(txt[txt.index("{"):txt.rstrip().rstrip(";").rindex("}") + 1])


def num(x):
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return None


def analisis():
    try:
        out = subprocess.run([sys.executable, os.path.join(DIR, "analista.py"), "--json"], capture_output=True,
                             text=True, cwd=DIR, timeout=120).stdout
        return json.loads(out).get("productos", [])
    except Exception:  # noqa: BLE001
        return []


def etapa_idx(estado):
    e = (estado or "").lower()
    for i, n in reversed(list(enumerate(ETAPAS))):
        if e.startswith(n.lower()):
            return i
    return 0


def main():
    D = leer_oficina()
    hoy = datetime.now(ZoneInfo("America/La_Paz"))

    pedidos = []
    for p in D.get("pedidos", []):
        if p.get("prueba"):
            continue
        pedidos.append({
            "id": p["id"], "producto": p["producto"], "cantidad": int(num(p.get("cantidad")) or 1),
            "estado": p.get("estado", ""), "etapa": etapa_idx(p.get("estado")), "etapas": ETAPAS,
            "fecha_compra": p.get("fecha_compra", ""), "actualizado": p.get("actualizado", ""),
            "eventos": [{"fecha": e["fecha"], "hora": e.get("hora", ""), "lugar": e.get("lugar", ""),
                         "evento": e.get("evento", "")} for e in p.get("eventos", [])],
        })

    fx = D.get("dolar", [])
    ult = fx[-1] if fx else {}
    dolar = {"usado": num(ult.get("usado")), "oficial": num(ult.get("oficial")),
             "paralelo": num(ult.get("paralelo_venta")), "fecha": ult.get("fecha", ""),
             "serie": [{"fecha": f["fecha"], "valor": num(f.get("usado"))} for f in fx[-30:] if num(f.get("usado"))]}

    productos = []
    for a in analisis():
        esc = a.get("escenarios_margen_pct") or {}
        productos.append({
            "producto": a["producto"], "condicion": a.get("condicion", ""), "ebay_usd": a.get("ebay_usd"),
            "costo_bs": a.get("costo_bs"), "local_bs": a.get("mejor_local_bs"), "sugerido_bs": a.get("precio_sugerido_bs"),
            "margen": a.get("margen_pct"), "peor": esc.get("peor caso"), "recomendacion": a.get("recomendacion", ""),
            "por_que": a.get("por_que", ""), "link": a.get("link_ebay") or "",
        })
    orden = {"traer": 0, "esperar": 1, "sin datos": 2, "no traer": 3}
    productos.sort(key=lambda p: (orden.get(p["recomendacion"], 2), -(p["margen"] or -99)))

    caz = D.get("cazador", {})
    nuevos = {p["name"]: p.get("nw") or {} for p in D.get("productos", [])}
    cazador = []
    for t in caz.get("topes", []):
        nw = nuevos.get(t["producto"], {})
        hoy_usd = round((nw.get("usd") or 0) + (nw.get("ship") or 0), 2) if nw.get("usd") else None
        cazador.append({"producto": t["producto"], "tope_usd": t.get("tope_usd"), "mediana_bs": t.get("mediana_bs"),
                        "hoy_usd": hoy_usd, "link": nw.get("url", ""),
                        "bajo_tope": bool(t.get("tope_usd") and hoy_usd and hoy_usd <= t["tope_usd"])})

    decidir = []
    for f in D.get("plan", []):
        if f.get("estado") == "propuesto":
            decidir.append({"tipo": "plan", "ref": f["id"], "agente": f.get("agente", ""), "fecha": f.get("fecha_propuesta", ""),
                            "titulo": f.get("tarea", ""), "detalle": f.get("motivo", ""), "plazo": f.get("plazo", "")})
    for f in D.get("ideas", []):
        if f.get("estado") == "propuesta":
            decidir.append({"tipo": "idea", "ref": str(f["id"]), "agente": f.get("agente", ""), "fecha": f.get("fecha", ""),
                            "titulo": f.get("idea", ""), "detalle": f.get("por_que", ""), "plazo": ""})
    for f in D.get("necesidades", []):
        decidir.append({"tipo": "necesidad", "ref": str(f["id"]), "agente": f.get("agente", ""), "fecha": f.get("fecha", ""),
                        "titulo": f.get("necesita", ""), "detalle": f.get("para_que", ""), "plazo": ""})
    decidir.sort(key=lambda d: d["fecha"], reverse=True)

    ob = D.get("objetivos", {})
    rend = ob.get("rendimiento", {})
    equipo = []
    for ag, r in rend.items():
        u = r.get("ultima") or {}
        equipo.append({"agente": ag, "nombre": NOMBRES.get(ag, ag), "acciones": r.get("acciones", 0), "serie": r.get("serie", []),
                       "ultima": u.get("texto", ""), "cuando": f"{u.get('fecha', '')} {u.get('hora', '')}".strip()})
    objetivos = [{"id": o["id"], "agente": o["agente"], "nombre": NOMBRES.get(o["agente"], o["agente"]), "objetivo": o["objetivo"],
                  "meta": o.get("meta", ""), "avance": o.get("avance"), "hasta": o.get("hasta", ""),
                  "cumplido": bool(o.get("cumplido")), "vencido": bool(o.get("vencido")), "estado": o.get("estado") or ""} for o in ob.get("objetivos", [])]

    salud = [{"parte": k, "nombre": v.get("nombre", k), "estado": v.get("estado", ""), "hora": v.get("hora", "")}
             for k, v in (D.get("salud", {}).get("hoy") or {}).items()]

    fin = D.get("finanzas", {})
    finanzas = {k: fin.get(k) for k in ("invertido_bs", "unidades_compradas", "unidades_en_camino", "unidades_en_stock",
                                         "unidades_vendidas", "ventas_bs", "ganancia_bs")}

    alertas = (D.get("alertas") or {}).get("ultimas") if isinstance(D.get("alertas"), dict) else None

    out = {
        "generado": D.get("generado") or hoy.strftime("%Y-%m-%d %H:%M"),
        "etapa": {"numero": ob.get("etapa"), "nombre": ob.get("nombre", "")},
        "dolar": dolar, "pedidos": pedidos, "finanzas": finanzas, "productos": productos,
        "cazador": {"meta": caz.get("meta"), "topes": cazador}, "decidir": decidir,
        "equipo": sorted(equipo, key=lambda e: e["cuando"], reverse=True), "objetivos": objetivos, "salud": salud,
        "alertas": alertas or [],
    }
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    json.dump(out, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"app/datos-app.json: {len(productos)} productos, {len(pedidos)} pedidos, {len(decidir)} por decidir")


if __name__ == "__main__":
    main()
