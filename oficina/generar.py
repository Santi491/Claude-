#!/usr/bin/env python3
"""Arma oficina/datos.js (productos, historial, dólar, actividad y documentos) a partir de los CSV del repo.

    python3 oficina/generar.py

Después: publicar oficina/index.html con datos.js en https://claude.ai/artifact/7B7QhWLBKLVZD1kB197TxJ
"""
import csv
import glob
import json
import os
import sys
from datetime import datetime

OFI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(OFI)
sys.path.insert(0, RAIZ)
import demanda  # noqa: E402
import finanzas  # noqa: E402
import agenda  # noqa: E402


def leer(nombre):
    with open(os.path.join(RAIZ, nombre), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def categoria(nombre):
    n = nombre.lower()
    return "RAM" if "ddr" in n else "SSD" if "ssd" in n else "CPU"


def nota_ebay(fuente):
    partes = fuente.split("; ", 1)
    return partes[1] if len(partes) > 1 else ""


def via(fuente):
    return "API" if "API" in fuente else "Chrome" if "Chrome" in fuente else "web"


def es_referencia(f):
    """Precio local que cuenta para el cálculo (Cochabamba y mismo modelo)."""
    return "no cuenta" not in f["estado"] and not any(c in f["fuente"] for c in ("La Paz", "Santa Cruz"))


def main():
    vigilar, eeuu, cbba = leer("vigilar.csv"), leer("precios-eeuu.csv"), leer("precios-cochabamba.csv")
    tiendas, fx, act = leer("tiendas-cochabamba.csv"), leer("tipo-cambio.csv"), leer("actividad.csv")

    def estado_tienda(fuente):
        for t in tiendas:
            if t["tienda"].lower() in fuente.lower():
                return t["estado_contacto"]
        return ""

    # ---------- Productos: la última oferta de eBay por condición y todos los precios locales ----------
    productos = []
    for v in vigilar:
        nombre = v["producto"]
        ofertas = {}
        for f in sorted((f for f in eeuu if f["producto"] == nombre), key=lambda f: f["fecha"]):
            ofertas[f["condicion"]] = f  # gana la última fila del día más reciente

        def oferta(c):
            f = ofertas.get(c)
            if not f:
                return None
            o = {"usd": float(f["precio_usd"]), "ship": float(f["envio_usd"] or 0), "url": f["link"],
                 "note": nota_ebay(f["fuente"]), "via": via(f["fuente"]), "fecha": f["fecha"]}
            if "OPEN BOX" in f["fuente"].upper():
                o["cond"] = "OPEN BOX"
            return o

        local = []
        for f in cbba:
            if f["producto"] != nombre:
                continue
            tienda = "Marketplace" not in f["fuente"]
            est = estado_tienda(f["fuente"]) if tienda else ""
            local.append({"bs": float(f["precio_bs"]), "ref": es_referencia(f), "src": "tienda" if tienda else "mkt",
                          "vendedor": f["fuente"], "estado": f["estado"], "contacto": est,
                          "url": f["link"], "fecha": f["fecha"]})
        productos.append({"name": nombre, "cat": categoria(nombre), "g": float(v["peso_g_con_caja"]),
                          "nw": oferta("nuevo"), "us": oferta("usado"), "local": local})

    # ---------- Historial: cada precio visto, en orden, con el cambio contra el anterior de la misma serie ----------
    mov = []
    for i, f in enumerate(eeuu):
        total = float(f["precio_usd"]) + float(f["envio_usd"] or 0)
        mov.append({"fecha": f["fecha"], "orden": i, "tipo": "ebay", "serie": f"ebay|{f['producto']}|{f['condicion']}",
                    "producto": f["producto"], "concepto": f"eBay {f['condicion']}", "detalle": via(f["fuente"]) + (
                        " · " + nota_ebay(f["fuente"]) if nota_ebay(f["fuente"]) else ""),
                    "valor": round(total, 2), "moneda": "USD", "url": f["link"]})
    for i, f in enumerate(cbba):
        mkt = "Marketplace" in f["fuente"]
        vendedor = f["fuente"].split(" (")[0]
        mov.append({"fecha": f["fecha"], "orden": 1000 + i, "tipo": "local",
                    "serie": f"local|{f['producto']}|{f['link'] or vendedor}", "producto": f["producto"],
                    "concepto": ("Marketplace" if mkt else "Tienda") + (" · " + vendedor if not mkt else ""),
                    "detalle": f["estado"] + ("" if es_referencia(f) else " · no cuenta para el cálculo"),
                    "valor": float(f["precio_bs"]), "moneda": "Bs", "url": f["link"]})
    for f in fx:
        for k, etiqueta in (("oficial", "Dólar oficial BCB"), ("usado", "Dólar usado en cálculos")):
            if f[k]:
                mov.append({"fecha": f["fecha"], "orden": -10 if k == "oficial" else -9, "tipo": "dolar",
                            "serie": f"dolar|{k}", "producto": "", "concepto": etiqueta, "detalle": f["fuente"],
                            "valor": float(f[k]), "moneda": "Bs/USD", "url": ""})
        if f["paralelo_compra"] and f["paralelo_venta"]:
            pm = round((float(f["paralelo_compra"]) + float(f["paralelo_venta"])) / 2, 3)
            mov.append({"fecha": f["fecha"], "orden": -8, "tipo": "dolar", "serie": "dolar|paralelo", "producto": "",
                        "concepto": "Dólar paralelo (promedio)",
                        "detalle": f"compra {f['paralelo_compra']} · venta {f['paralelo_venta']}",
                        "valor": pm, "moneda": "Bs/USD", "url": ""})
    mov.sort(key=lambda m: (m["fecha"], m["orden"]))
    ultimo = {}
    for m in mov:
        prev = ultimo.get(m["serie"])
        m["antes"] = prev
        ultimo[m["serie"]] = m["valor"]
        del m["orden"]

    # ---------- Documentos (gabinete) ----------
    gh = "https://github.com/Santi491/Claude-/blob/claude/agente-independiente-s3uc8z/"
    docs = []

    def leer_txt(ruta):
        with open(ruta, encoding="utf-8-sig") as f:
            return f.read()

    excel = os.path.join(RAIZ, "importacion-cochabamba.xlsx")
    if os.path.exists(excel):
        docs.append({"id": "excel", "carpeta": "Excel", "titulo": "Importación Cochabamba (Excel)", "tipo": "Excel",
                     "fecha": datetime.fromtimestamp(os.path.getmtime(excel)).strftime("%Y-%m-%d"),
                     "url": gh + "importacion-cochabamba.xlsx",
                     "nota": "Hojas: Hoy (con fórmulas), Historial, Dólar, Movimientos y Supuestos. Se abre en GitHub y se descarga desde ahí."})
    h = os.path.join(RAIZ, "historial", "historial.csv")
    if os.path.exists(h):
        docs.append({"id": "historial", "carpeta": "Tabla diaria", "titulo": "Historial completo", "tipo": "CSV",
                     "fecha": datetime.fromtimestamp(os.path.getmtime(h)).strftime("%Y-%m-%d"),
                     "url": gh + "historial/historial.csv", "csv": leer_txt(h)})
    for ruta in sorted(glob.glob(os.path.join(RAIZ, "historial", "2*.csv")), reverse=True):
        dia = os.path.basename(ruta)[:-4]
        docs.append({"id": "tabla-" + dia, "carpeta": "Tabla diaria", "titulo": f"Tabla del {dia}", "tipo": "CSV",
                     "fecha": dia, "url": gh + f"historial/{dia}.csv", "csv": leer_txt(ruta)})
        if os.path.exists(ruta[:-4] + ".pdf"):
            docs.append({"id": "pdf-" + dia, "carpeta": "Tabla diaria", "titulo": f"Tabla del {dia}", "tipo": "PDF",
                         "fecha": dia, "url": gh + f"historial/{dia}.pdf",
                         "nota": "La misma tabla del día en PDF (A4 horizontal). Se abre en GitHub."})
    comp = os.path.join(RAIZ, "comparacion.md")
    if os.path.exists(comp):
        docs.append({"id": "comparacion", "carpeta": "Informes", "titulo": "Comparación EE.UU. → Cochabamba", "tipo": "Tabla de comparación",
                     "fecha": datetime.fromtimestamp(os.path.getmtime(comp)).strftime("%Y-%m-%d"),
                     "url": gh + "comparacion.md", "md": leer_txt(comp)})
    for ruta in sorted(glob.glob(os.path.join(RAIZ, "informes", "*.md")), reverse=True):
        nombre = os.path.basename(ruta)[:-3]
        docs.append({"id": "inf-" + nombre, "carpeta": "Informes", "titulo": f"Informe diario {nombre}", "tipo": "Informe de la nube",
                     "fecha": nombre, "url": gh + f"informes/{nombre}.md", "md": leer_txt(ruta)})

    lista_tiendas = [{"tienda": t["tienda"], "ciudad": t["ciudad"], "estado": t["estado_contacto"],
                      "ultima": t["ultima_consulta"]} for t in tiendas]
    # Capturas de pantalla de cada agente (oficina/capturas.csv): la oficina muestra la última de cada uno
    ruta_cap = os.path.join(OFI, "capturas.csv")
    capturas = []
    if os.path.exists(ruta_cap):
        with open(ruta_cap, encoding="utf-8") as f:
            capturas = [c for c in csv.DictReader(f) if os.path.exists(os.path.join(OFI, c["archivo"]))]
    # Pedidos (pedidos.csv): solo campos aptos para la página pública; nunca guía, número de pedido ni dirección
    seg = leer("seguimiento.csv") if os.path.exists(os.path.join(RAIZ, "seguimiento.csv")) else []
    def lista_pedidos(nombre, prueba):
        if not os.path.exists(os.path.join(RAIZ, nombre)):
            return []
        out = []
        for f in leer(nombre):
            d = {k: f.get(k, "") for k in ("id", "fecha_compra", "tienda", "producto", "cantidad", "courier", "origen", "destino",
                                            "destino_lat", "destino_lon", "estado", "eta", "actualizado", "foto")}
            d["prueba"] = prueba
            d["eventos"] = [{k: e[k] for k in ("fecha", "hora", "lugar", "lat", "lon", "evento")} for e in seg if e["id"] == f.get("id")]
            out.append(d)
        return out
    pedidos = lista_pedidos("pedidos.csv", False) + lista_pedidos("pedidos-prueba.csv", True)
    # Gerente: métricas por día, plan con decisiones, mensajes (sin notas; en Messenger son personas: sin nombre) e informes
    existe = lambda n: os.path.exists(os.path.join(RAIZ, n))
    metricas = leer("metricas.csv") if existe("metricas.csv") else []
    plan = leer("plan.csv") if existe("plan.csv") else []
    mensajes = [{"fecha": m["fecha"], "hora": m["hora"], "canal": m["canal"], "direccion": m["direccion"], "tipo": m["tipo"],
                 "con_precio": m["con_precio"], "tienda": m["tienda"] if m["canal"] == "whatsapp" else "Vendedor de Marketplace"}
                for m in (leer("mensajes.csv") if existe("mensajes.csv") else [])]
    informes_gerente = [{k: f[k] for k in ("fecha", "tipo", "url")}
                        for f in (leer("informes/gerente/indice.csv") if existe("informes/gerente/indice.csv") else [])]
    # Catálogos y listas de precios que mandan las tiendas (catalogos.csv + oficina/catalogos/): cajón propio del Archivo,
    # con los precios que se pasaron a precios-cochabamba.csv desde ese catálogo (misma tienda y día)
    catalogos = []
    if existe("catalogos.csv"):
        pcb = leer("precios-cochabamba.csv")
        for c in leer("catalogos.csv"):
            ruta = c.get("archivo", "")
            c["hay_archivo"] = bool(ruta) and os.path.exists(os.path.join(OFI, ruta))
            c["precios"] = [{k: r[k] for k in ("producto", "precio_bs", "estado")} for r in pcb
                            if r["fecha"] == c["fecha"] and c["tienda"].lower() in r["fuente"].lower()]
            catalogos.append(c)
    # Salud del equipo (salud.py): estado de hoy, últimos 14 días e historial de sesiones (sesiones.csv)
    import sys as _sys
    _sys.path.insert(0, RAIZ)
    import salud as _salud
    salud_equipo = {"hoy": _salud.estado_dia(), "semana": _salud.semana(14),
                    "horario": {k: {"nombre": h["nombre"], "hora": h["hora"], "dias": list(h["dias"]), "ligera": h.get("ligera", [])} for k, h in _salud.HORARIO.items()},
                    "sesiones": _salud.sesiones()[-80:]}
    # Frescura (Oficina, 17/10): fecha del último dato de cada fuente, para que cada pantalla avise si está vencido
    def ultima(nombre, col="fecha"):
        if not existe(nombre):
            return ""
        return max((f.get(col) or "")[:16] for f in leer(nombre)) if leer(nombre) else ""
    frescura = {"ebay": ultima("precios-eeuu.csv"), "cochabamba": ultima("precios-cochabamba.csv"), "dolar": ultima("tipo-cambio.csv"),
                "mensajes": ultima("mensajes.csv"), "pedidos": max([ultima("pedidos.csv", "actualizado"), ultima("pedidos-prueba.csv", "actualizado")]),
                "demanda": ultima("demanda.csv"), "catalogos": ultima("catalogos.csv"), "plan": ultima("plan.csv", "fecha_propuesta"),
                "actividad": ultima("actividad.csv")}
    # Chat interno del equipo (chat.py): solo trabajo; los agentes no ponen datos privados (reglas-cargo-brothers)
    chat_eq = [{k: f.get(k, "") for k in ("id", "fecha", "hora", "de", "para", "texto", "ref", "estado", "respuesta_a")}
               for f in (leer("chat.csv") if existe("chat.csv") else [])][-300:]
    datos = {"generado": datetime.now().strftime("%Y-%m-%d %H:%M"), "productos": productos, "movimientos": mov,
             "frescura": frescura, "chat": chat_eq,
             "dolar": fx, "actividad": act, "documentos": docs, "tiendas": lista_tiendas, "capturas": capturas,
             "pedidos": pedidos, "metricas": metricas, "plan": plan, "mensajes": mensajes, "informes_gerente": informes_gerente, "catalogos": catalogos, "salud": salud_equipo,
             # lo que los agentes le piden a Santi (sin datos privados): lo usa la animación del Gerente
             # id = número de fila del CSV (las filas nunca se borran): con eso la oficina aprueba o da por resuelto
             "necesidades": [{"id": i, "fecha": f.get("fecha", ""), "agente": f.get("agente", ""), "necesita": f.get("necesita", ""),
                              "para_que": f.get("para_que", ""), "quien": f.get("quien", "")}
                             for i, f in enumerate(leer("necesidades.csv"), 1) if f.get("estado", "abierta") != "resuelta"],
             # las ya resueltas, para la vista "Decididas" del tablero
             "necesidades_resueltas": [{"id": i, "fecha": f.get("fecha", ""), "agente": f.get("agente", ""), "necesita": f.get("necesita", ""),
                                        "resuelto": f.get("resuelto", "")}
                                       for i, f in enumerate(leer("necesidades.csv"), 1) if f.get("estado") == "resuelta"],
             "ideas": [{"id": i, **{k: f.get(k, "") for k in ("fecha", "agente", "idea", "por_que", "estado", "decision")}}
                       for i, f in enumerate(leer("ideas.csv") if existe("ideas.csv") else [], 1)],
             "finanzas": finanzas.calcular(), "demanda": demanda.calcular(),
             # agenda de seguimientos de WhatsApp (agenda.py), ventas sin notas (pueden tener nombres) y las últimas alertas
             "agenda": agenda.calcular(),
             "ventas": [{k: f.get(k, "") for k in ("fecha", "producto", "cantidad", "precio_bs", "canal", "estado")}
                        for f in (leer("ventas.csv") if existe("ventas.csv") else [])],
             "alertas": (lambda e: {"ultimas": e.get("ultimas", []), "revisado": e.get("revisado", "")})(
                 json.load(open(os.path.join(RAIZ, "alertas-estado.json"), encoding="utf-8")) if existe("alertas-estado.json") else {})}
    with open(os.path.join(OFI, "datos.js"), "w", encoding="utf-8") as f:
        f.write("window.DATOS = " + json.dumps(datos, ensure_ascii=False) + ";\n")
    print(f"oficina/datos.js: {len(productos)} productos, {len(mov)} movimientos, {len(docs)} documentos")


if __name__ == "__main__":
    main()
