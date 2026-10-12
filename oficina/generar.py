#!/usr/bin/env python3
"""Arma oficina/datos.js (productos, historial, dólar, actividad y documentos) a partir de los CSV del repo.

    python3 oficina/generar.py

Después: publicar oficina/index.html con datos.js en https://claude.ai/artifact/7B7QhWLBKLVZD1kB197TxJ
"""
import csv
import glob
import json
import os
from datetime import datetime

OFI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(OFI)


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

    # ---------- Documentos ----------
    docs = []
    for ruta in sorted(glob.glob(os.path.join(RAIZ, "informes", "*.md")), reverse=True):
        nombre = os.path.basename(ruta)[:-3]
        docs.append({"id": "inf-" + nombre, "titulo": f"Informe diario {nombre}", "tipo": "Informe de la nube",
                     "fecha": nombre, "md": open(ruta, encoding="utf-8").read()})
    comp = os.path.join(RAIZ, "comparacion.md")
    if os.path.exists(comp):
        docs.insert(0, {"id": "comparacion", "titulo": "Comparación EE.UU. → Cochabamba", "tipo": "Tabla de comparación",
                        "fecha": datetime.fromtimestamp(os.path.getmtime(comp)).strftime("%Y-%m-%d"),
                        "md": open(comp, encoding="utf-8").read()})

    lista_tiendas = [{"tienda": t["tienda"], "ciudad": t["ciudad"], "estado": t["estado_contacto"],
                      "ultima": t["ultima_consulta"]} for t in tiendas]
    datos = {"generado": datetime.now().strftime("%Y-%m-%d %H:%M"), "productos": productos, "movimientos": mov,
             "dolar": fx, "actividad": act, "documentos": docs, "tiendas": lista_tiendas}
    with open(os.path.join(OFI, "datos.js"), "w", encoding="utf-8") as f:
        f.write("window.DATOS = " + json.dumps(datos, ensure_ascii=False) + ";\n")
    print(f"oficina/datos.js: {len(productos)} productos, {len(mov)} movimientos, {len(docs)} documentos")


if __name__ == "__main__":
    main()
