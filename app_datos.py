#!/usr/bin/env python3
"""Datos de la app de iPhone de Cargo Brothers (Santi, 18/11).

Arma app/datos-app.json, un resumen chico de la oficina para la app nativa (app-ios/), que lo lee desde GitHub.
Sale SOLO de oficina/datos.js (que ya pasó el filtro de privacidad de la oficina) y de analista.py --json:
nunca guías, números de pedido, direcciones, teléfonos ni nombres de personas. Lo corre oficina/generar.py al final.

    python3 app_datos.py
"""
import csv
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

DIR = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(DIR, "app", "datos-app.json")
sys.path.insert(0, DIR)

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


def leer_csv(nombre):
    ruta = os.path.join(DIR, nombre)
    if not os.path.exists(ruta):
        return []
    return list(csv.DictReader(open(ruta, encoding="utf-8-sig")))


def extras(D, caz):
    """Lo que usan las pantallas de cada agente, la calculadora y la venta (Santi, 18/11)."""
    import comparar as C
    topes = {t["producto"]: t for t in caz.get("topes", [])}
    cats = {p["name"]: p.get("cat", "") for p in D.get("productos", [])}
    vig = []
    for v in leer_csv("vigilar.csv"):
        t = topes.get(v["producto"], {})
        vig.append({"producto": v["producto"], "cat": cats.get(v["producto"], ""),
                    "peso_g": num(v.get("peso_g_con_caja")) or 350, "mediana_bs": t.get("mediana_bs"), "tope_usd": t.get("tope_usd")})
    # historial de precios por producto (de historial/historial.csv): último mes
    hist = {}
    for f in leer_csv("historial/historial.csv"):
        hist.setdefault(f["Producto"], []).append({"fecha": f["Fecha"], "nuevo": num(f.get("eBay nuevo USD")),
                                                    "usado": num(f.get("eBay usado USD")),
                                                    "mkt": num(f.get("Marketplace Bs")), "tienda": num(f.get("Tiendas Bs"))})
    hist = {k: sorted(v, key=lambda x: x["fecha"])[-45:] for k, v in hist.items()}
    # precios de Cochabamba de cada producto (lo que ve la oficina): para la competencia en la venta
    locales = {}
    for p in D.get("productos", []):
        locales[p["name"]] = [{"bs": l.get("bs"), "src": l.get("src", ""), "vendedor": l.get("vendedor", ""),
                               "estado": l.get("estado", ""), "fecha": l.get("fecha", ""), "url": l.get("url", ""),
                               "cuenta": "no cuenta" not in (l.get("estado") or "")} for l in p.get("local", [])]
    met = (D.get("metricas") or [{}])[-1]
    ag = D.get("agenda") or {}
    whatsapp = {
        "tiendas_total": num(met.get("tiendas_total")), "contactadas_7d": num(met.get("tiendas_contactadas_7d")),
        "respondieron_7d": num(met.get("tiendas_respondieron_7d")), "tasa_7d": num(met.get("tasa_respuesta_7d")),
        "lista_pedida": ag.get("lista_pedida"), "lista_faltan": len(ag.get("lista_completa") or []),
        "seguimiento": [x["tienda"] for x in ag.get("seguimiento") or []],
        "responder": [x["tienda"] for x in ag.get("responder") or []],
        "frias": len(ag.get("frias") or []), "respondieron": len(ag.get("respondieron") or []),
        "serie": [{"fecha": m["fecha"], "nuevos": num(m.get("chats_nuevos")) or 0, "respuestas": num(m.get("respuestas")) or 0,
                   "con_precio": num(m.get("respuestas_con_precio")) or 0} for m in (D.get("metricas") or [])[-21:]],
    }
    dem = D.get("demanda") or {}
    demanda = [{"producto": d["producto"], "anuncios": d.get("anuncios_prom"), "nuevos": d.get("nuevos"),
                "desaparecidos": d.get("desaparecidos"), "precio_bs": d.get("precio_ultimo_bs"),
                "tendencia": d.get("tendencia_precio"), "lectura": d.get("lectura", ""), "puntaje": d.get("puntaje")}
               for d in dem.get("productos", []) if d.get("vigilado")]
    docs = [{"titulo": d.get("titulo", ""), "tipo": d.get("tipo", ""), "fecha": d.get("fecha", ""), "url": d.get("url", ""),
             "carpeta": d.get("carpeta", "")} for d in D.get("documentos", []) if d.get("url")]
    docs.sort(key=lambda d: d["fecha"], reverse=True)
    informes = sorted([{"fecha": i["fecha"], "tipo": i.get("tipo", ""), "url": i.get("url", "")}
                       for i in D.get("informes_gerente", []) if i.get("url")], key=lambda i: i["fecha"], reverse=True)
    memoria = [{"id": m["id"], "tipo": m.get("tipo", ""), "resumen": m.get("resumen", ""), "vence": m.get("vence", ""),
                "fecha": m.get("fecha", "")} for m in D.get("memoria", []) if m.get("estado") == "abierta"]
    chat = [{"id": c["id"], "fecha": c["fecha"], "hora": c.get("hora", ""), "de": c["de"], "para": c["para"],
             "texto": c.get("texto", "")} for c in D.get("chat", [])[-150:]]
    salud14 = (D.get("salud") or {}).get("semana") or []
    fin = D.get("finanzas", {})
    fin_prod = [{"producto": p["producto"], "comprado": p.get("comprado"), "en_camino": p.get("en_camino"),
                 "en_stock": p.get("en_stock"), "vendido": p.get("vendido"), "costo_unitario_bs": p.get("costo_unitario_bs"),
                 "ganancia_bs": p.get("ganancia_bs")} for p in fin.get("productos", [])]
    rec = [r for r in leer_csv("recomendaciones.csv")]
    if rec:
        ult = max(r["fecha"] + " " + r.get("hora", "") for r in rec)
        rec = [{"texto": r["texto"], "por_que": r.get("por_que", ""), "accion": r.get("accion", "")}
               for r in rec if r["fecha"] + " " + r.get("hora", "") == ult]
        rec_cuando = ult
    else:
        rec_cuando = ""
    # ---------- ventas: clientes potenciales, nuestros anuncios y tiendas (Santi, 18/11) ----------
    clientes = [{"tienda": c["tienda"], "grupo": c.get("grupo", ""), "prioridad": c.get("prioridad", ""),
                 "por_que": c.get("por_que", ""), "productos": c.get("productos_interes", ""),
                 "precio_ref_bs": num(c.get("precio_referencia_bs")), "proximo_paso": c.get("proximo_paso", ""),
                 "actualizado": c.get("actualizado", "")} for c in leer_csv("clientes-potenciales.csv")]
    publicaciones = [{k: f.get(k, "") for k in ("fecha", "hora", "producto", "pedido_id", "accion", "precio_bs", "cantidad", "titulo",
                                                "clics", "mensajes", "notas")} for f in leer_csv("publicaciones.csv")]
    msj = leer_csv("mensajes.csv")
    pcb = leer_csv("precios-cochabamba.csv")
    cli = {c["tienda"].lower(): c for c in clientes}
    frias = {(x.get("tienda") if isinstance(x, dict) else str(x)) for x in (ag.get("frias") or [])}
    tiendas = []
    for t in leer_csv("tiendas-cochabamba.csv"):   # sin teléfono, dirección ni notas (pueden traer números)
        n = t["tienda"]
        mm = [m for m in msj if m.get("tienda") == n]
        pr = [{"fecha": x["fecha"], "producto": x["producto"], "precio_bs": num(x.get("precio_bs")), "estado": x.get("estado", "")}
              for x in pcb if (x.get("fuente") or "").lower().startswith(n.lower()) and num(x.get("precio_bs"))]
        c = cli.get(n.lower(), {})
        tiendas.append({"id": t.get("id", ""), "tienda": n, "ciudad": t.get("ciudad", ""), "estado": t.get("estado_contacto", ""),
                        "vende": t.get("vende_componentes", ""), "ultima": t.get("ultima_consulta", ""),
                        "enviados": sum(1 for m in mm if m.get("direccion") == "enviado"),
                        "recibidos": sum(1 for m in mm if m.get("direccion") == "recibido"),
                        "con_precio": sum(1 for m in mm if (m.get("con_precio") or "").startswith("s")),
                        "ultimo_mensaje": max((m["fecha"] for m in mm), default=""),
                        "lista": any((m.get("nota") or "").lower().startswith("lista completa") for m in mm if m.get("direccion") == "enviado"),
                        "fria": n in frias,
                        "grupo": c.get("grupo", ""), "precios": sorted(pr, key=lambda x: x["fecha"], reverse=True)[:12]})
    # ---------- documentos para leer dentro de la app ----------
    import glob
    inf_nube = [{"fecha": os.path.basename(f)[:10], "ruta": "informes/" + os.path.basename(f)}
                for f in sorted(glob.glob(os.path.join(DIR, "informes", "20??-??-??.md")), reverse=True)[:30]]
    catalogos = [{"fecha": c["fecha"], "tienda": c["tienda"], "canal": c.get("canal", ""), "formato": c.get("formato", ""),
                  "descripcion": c.get("descripcion", ""), "productos": c.get("productos", ""), "precios": c.get("precios_anotados", ""),
                  "ruta": ("oficina/" + c["archivo"]) if c.get("archivo") and os.path.exists(os.path.join(DIR, "oficina", c["archivo"])) else ""}
                 for c in leer_csv("catalogos.csv")]
    catalogos.sort(key=lambda c: c["fecha"], reverse=True)
    capturas = [{"fecha": c["fecha"], "hora": c.get("hora", ""), "agente": c.get("agente", ""), "descripcion": c.get("descripcion", ""),
                 "ruta": "oficina/" + c["archivo"]} for c in leer_csv("oficina/capturas.csv")
                if c.get("archivo") and os.path.exists(os.path.join(DIR, "oficina", c["archivo"])) and c.get("agente") != "wa"]
    capturas.sort(key=lambda c: c["fecha"] + c["hora"], reverse=True)
    # ---------- decisiones ya tomadas (vista "Decididas"), últimos 30 días ----------
    hace30 = (datetime.now(ZoneInfo("America/La_Paz")) - timedelta(days=30)).strftime("%Y-%m-%d")
    decididas = []
    for f in D.get("plan", []):
        if f.get("estado") in ("aprobado", "rechazado", "hecho") and (f.get("fecha_propuesta") or f.get("fecha_para", "")) >= hace30:
            decididas.append({"tipo": "plan", "ref": f["id"], "agente": f.get("agente", ""), "titulo": f.get("tarea", ""),
                              "estado": f["estado"], "decision": f.get("decision", ""), "fecha": f.get("fecha_para", "")})
    for f in D.get("ideas", []):
        if f.get("estado") in ("aprobada", "rechazada", "hecha"):
            decididas.append({"tipo": "idea", "ref": str(f["id"]), "agente": f.get("agente", ""), "titulo": f.get("idea", ""),
                              "estado": f["estado"], "decision": f.get("decision", ""), "fecha": f.get("fecha", "")})
    for f in D.get("necesidades_resueltas", []):
        if (f.get("resuelto") or "")[:10] >= hace30:
            decididas.append({"tipo": "necesidad", "ref": str(f["id"]), "agente": f.get("agente", ""), "titulo": f.get("necesita", ""),
                              "estado": "resuelta", "decision": f.get("resuelto", ""), "fecha": f.get("fecha", "")})
    decididas.sort(key=lambda d: d["fecha"], reverse=True)
    # ---------- la libreta del Gerente completa (abiertas y cerradas) ----------
    libreta = [{"id": m["id"], "fecha": m.get("fecha", ""), "tipo": m.get("tipo", ""), "fuente": m.get("fuente", ""),
                "resumen": m.get("resumen", ""), "vence": m.get("vence", ""), "estado": m.get("estado", ""), "cerrado": m.get("cerrado", "")}
               for m in D.get("memoria", [])]
    # ---------- estado de cuenta: cada precio que cambió (últimos 400 movimientos) ----------
    movimientos = [{"fecha": m["fecha"], "tipo": m.get("tipo", ""), "producto": m.get("producto", ""), "concepto": m.get("concepto", ""),
                    "detalle": (m.get("detalle") or "")[:140], "valor": m.get("valor"), "antes": m.get("antes"), "moneda": m.get("moneda", "")}
                   for m in D.get("movimientos", [])][-400:]
    # ---------- tabla completa de productos (como la de la oficina) ----------
    tabla = []
    for p in D.get("productos", []):
        def tot(o):
            return round((o.get("usd") or 0) + (o.get("ship") or 0), 2) if o and o.get("usd") else None
        cuentan = [l for l in p.get("local", []) if l.get("bs") and "no cuenta" not in (l.get("estado") or "")]
        mk = [l["bs"] for l in cuentan if l.get("src") == "mkt"]
        ti = [l["bs"] for l in cuentan if l.get("src") != "mkt"]
        tabla.append({"producto": p["name"], "cat": p.get("cat", ""), "peso_g": p.get("g") or 350,
                      "nuevo_usd": tot(p.get("nw")), "usado_usd": tot(p.get("us")),
                      "mkt_bs": min(mk) if mk else None, "tienda_bs": min(ti) if ti else None,
                      "nuevo_link": (p.get("nw") or {}).get("url", ""), "usado_link": (p.get("us") or {}).get("url", "")})
    # ---------- sincronización ----------
    ses = leer_csv("sesiones.csv")
    rondas = [x for x in ses if "ronda" in (x.get("tipo") or "") and x.get("fin")]
    publ = [a for a in D.get("actividad", []) if a.get("agente") == "local" and "publicad" in (a.get("texto") or "").lower()]
    sinc = {"ultima_ronda": (f"{rondas[-1]['fecha']} {rondas[-1].get('fin', '')}" if rondas else ""),
            "ultima_ronda_quien": rondas[-1].get("quien", "") if rondas else "",
            "oficina_publicada": (f"{publ[-1]['fecha']} {publ[-1].get('hora', '')}" if publ else ""),
            "armado_por": "GitHub (automático)" if os.environ.get("GITHUB_ACTIONS") else "una ronda o sesión",
            "armado": datetime.now(ZoneInfo("America/La_Paz")).strftime("%Y-%m-%d %H:%M")}
    # ---------- gráficos (Santi, 20/11): ventas y anuncios por día de Marketplace por producto ----------
    ventas = [{"fecha": v["fecha"], "producto": v["producto"], "cantidad": num(v.get("cantidad")) or 1, "precio_bs": num(v.get("precio_bs")),
               "canal": v.get("canal", ""), "pedido_id": v.get("pedido_id", ""), "estado": v.get("estado", "") or "vendida",
               "cobrado_bs": num(v.get("cobrado_bs")), "comision_bs": num(v.get("comision_bs"))} for v in leer_csv("ventas.csv") if v.get("fecha")]
    dserie = {}
    for f in leer_csv("demanda.csv"):
        if (f.get("fuente") or "marketplace") == "marketplace" and (f.get("ciudad") or "Cochabamba") == "Cochabamba":
            dserie.setdefault(f["producto"], []).append({"fecha": f["fecha"], "anuncios": num(f.get("anuncios")) or 0,
                                                         "nuevos": num(f.get("nuevos")) or 0, "desaparecidos": num(f.get("desaparecidos")) or 0,
                                                         "min_bs": num(f.get("precio_min_bs")), "med_bs": num(f.get("precio_med_bs"))})
    dserie = {k: sorted(v, key=lambda x: x["fecha"])[-60:] for k, v in dserie.items()}
    return {
        "ventas": ventas, "demanda_serie": dserie,
        "decididas": decididas[:120], "libreta": libreta, "movimientos": movimientos, "tabla": tabla, "sincronizacion": sinc,
        "clientes": clientes, "publicaciones": publicaciones, "tiendas": tiendas,
        "informes_nube": inf_nube, "catalogos": catalogos, "capturas": capturas[:30],
        "vigilar": vig, "historial": hist, "locales": locales, "whatsapp": whatsapp, "demanda": demanda,
        "documentos": docs[:40], "informes": informes[:30], "memoria": memoria, "chat": chat, "salud14": salud14,
        "finanzas_productos": fin_prod, "recomendaciones": rec, "recomendaciones_cuando": rec_cuando,
        "constantes": {"b_usd_kg": C.B_USD_KG, "b_min_kg": C.B_MIN_KG, "b_paso_kg": C.B_PASO_KG,
                       "caja_g": C.CAJA_EXTERIOR_G, "a_usd": C.A_USD_UNIDAD, "a_tax": C.A_TAX_DEF},
    }


_PED = None


def costo_pedido(pid):
    """Costo real por unidad en Bs (precio_usd + envio_usd, al dólar con que se pagó). Sin guía ni notas."""
    global _PED
    if _PED is None:
        _PED = {r["id"]: r for r in leer_csv("pedidos.csv") + leer_csv("pedidos-prueba.csv")}
    r = _PED.get(pid) or {}
    u, e, tc = num(r.get("precio_usd")), num(r.get("envio_usd")) or 0, num(r.get("tc"))
    return round((u + e) * tc, 2) if u and tc else None


def main():
    D = leer_oficina()
    hoy = datetime.now(ZoneInfo("America/La_Paz"))

    pedidos = []
    for p in D.get("pedidos", []):
        pedidos.append({
            "prueba": bool(p.get("prueba")),
            "id": p["id"], "producto": p["producto"], "cantidad": int(num(p.get("cantidad")) or 1),
            "estado": p.get("estado", ""), "etapa": etapa_idx(p.get("estado")), "etapas": ETAPAS,
            "fecha_compra": p.get("fecha_compra", ""), "actualizado": p.get("actualizado", ""),
            "tienda": p.get("tienda", ""), "courier": p.get("courier", ""),
            "costo_unit_bs": costo_pedido(p["id"]),
            "eventos": [{"fecha": e["fecha"], "hora": e.get("hora", ""), "lugar": e.get("lugar", ""),
                         "evento": e.get("evento", ""), "lat": num(e.get("lat")), "lon": num(e.get("lon"))}
                        for e in p.get("eventos", [])],
        })

    fx = D.get("dolar", [])
    ult = fx[-1] if fx else {}
    dolar = {"usado": num(ult.get("usado")), "oficial": num(ult.get("oficial")),
             "paralelo": num(ult.get("paralelo_venta")), "fecha": ult.get("fecha", ""),
             "serie": [{"fecha": f["fecha"], "valor": num(f.get("usado")), "oficial": num(f.get("oficial")),
                        "paralelo": num(f.get("paralelo_venta"))} for f in fx[-45:] if num(f.get("usado"))]}

    productos = []
    for a in analisis():
        esc = a.get("escenarios_margen_pct") or {}
        productos.append({
            "producto": a["producto"], "condicion": a.get("condicion", ""), "ebay_usd": a.get("ebay_usd"),
            "costo_bs": a.get("costo_bs"), "local_bs": a.get("mejor_local_bs"), "sugerido_bs": a.get("precio_sugerido_bs"),
            "margen": a.get("margen_pct"), "peor": esc.get("peor caso"), "recomendacion": a.get("recomendacion", ""),
            "por_que": a.get("por_que", ""), "link": a.get("link_ebay") or "",
            "courier_usd": a.get("courier_usd"), "tc": a.get("tc"), "ganancia_bs": a.get("ganancia_bs"),
            "precios_locales": a.get("precios_locales"), "via": a.get("via", ""),
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
                            "titulo": f.get("tarea", ""), "detalle": f.get("motivo", ""), "plazo": f.get("plazo", ""),
                            "fecha_para": f.get("fecha_para", "")})
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
        "etapa": {"numero": ob.get("etapa"), "nombre": ob.get("nombre", ""), "auto": ob.get("auto"), "fijada": ob.get("fijada")},
        "dolar": dolar, "pedidos": pedidos, "finanzas": finanzas, "productos": productos,
        "cazador": {"meta": caz.get("meta"), "topes": cazador}, "decidir": decidir,
        "equipo": sorted(equipo, key=lambda e: e["cuando"], reverse=True), "objetivos": objetivos, "salud": salud,
        "alertas": alertas or [],
    }
    out.update(extras(D, caz))
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    json.dump(out, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"app/datos-app.json: {len(productos)} productos, {len(pedidos)} pedidos, {len(decidir)} por decidir")


if __name__ == "__main__":
    main()
