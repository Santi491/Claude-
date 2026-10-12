#!/usr/bin/env python3
"""Busca precios reales en eBay EE.UU. con la Browse API.

Usa las variables de entorno EBAY_CLIENT_ID y EBAY_CLIENT_SECRET (claves de Production).

    python3 ebay.py "AMD Ryzen 5 5600 CPU"            # un producto
    python3 ebay.py --vigilar                         # todos los de vigilar.csv
    python3 ebay.py --vigilar --condicion usado --json
"""
import argparse
import base64
import csv
import json
import os
import sys
import urllib.parse
import urllib.request

TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
CONDICIONES = {"nuevo": "NEW", "usado": "USED", "todos": None}
# Categorías de eBay: procesadores, memoria RAM de escritorio, SSD
CATEGORIAS = {"cpu": "164", "ram": "170083", "ssd": "175669"}
MIN_FEEDBACK_PCT = 98.0
MIN_FEEDBACK_SCORE = 50


def token():
    cid, secret = os.environ.get("EBAY_CLIENT_ID"), os.environ.get("EBAY_CLIENT_SECRET")
    if not cid or not secret:
        sys.exit("Faltan EBAY_CLIENT_ID / EBAY_CLIENT_SECRET en el entorno.")
    auth = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "scope": "https://api.ebay.com/oauth/api_scope",
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=body, headers={
        "Authorization": f"Basic {auth}",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)["access_token"]
    except urllib.error.HTTPError as e:
        sys.exit(f"eBay rechazó las claves ({e.code}): {e.read().decode()[:300]}")


def categoria(texto):
    t = texto.lower()
    if any(k in t for k in ("ddr4", "ddr5", "ram", "vengeance")):
        return CATEGORIAS["ram"]
    if any(k in t for k in ("ssd", "nvme")):
        return CATEGORIAS["ssd"]
    return CATEGORIAS["cpu"]


def buscar(tok, consulta, condicion="nuevo", limite=50):
    filtros = ["buyingOptions:{FIXED_PRICE}", "itemLocationCountry:US", "deliveryCountry:US"]
    if CONDICIONES[condicion]:
        filtros.append(f"conditions:{{{CONDICIONES[condicion]}}}")
    q = urllib.parse.urlencode({
        "q": consulta, "category_ids": categoria(consulta),
        "filter": ",".join(filtros), "limit": limite,
    })
    req = urllib.request.Request(f"{SEARCH_URL}?{q}", headers={
        "Authorization": f"Bearer {tok}",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)

    palabras = [w.lower() for w in consulta.replace('"', "").split() if len(w) > 2 and w.upper() != "OR"]
    out = []
    for it in data.get("itemSummaries", []):
        titulo = it.get("title", "")
        # Descarta anuncios que no mencionan al menos la mitad de las palabras clave (accesorios, lotes raros)
        if sum(w in titulo.lower() for w in palabras) < max(1, len(palabras) // 2):
            continue
        vend = it.get("seller", {})
        pct = float(vend.get("feedbackPercentage") or 0)
        score = int(vend.get("feedbackScore") or 0)
        if pct < MIN_FEEDBACK_PCT or score < MIN_FEEDBACK_SCORE:
            continue
        precio = float(it.get("price", {}).get("value") or 0)
        envios = it.get("shippingOptions") or [{}]
        envio = envios[0].get("shippingCost", {}).get("value")
        envio = float(envio) if envio is not None else None
        out.append({
            "titulo": titulo, "precio_usd": precio, "envio_usd": envio,
            "total_usd": precio + (envio or 0), "estado": it.get("condition", ""),
            "vendedor": vend.get("username", ""), "feedback_pct": pct, "feedback_score": score,
            "link": it.get("itemWebUrl", ""),
        })
    return sorted(out, key=lambda x: x["total_usd"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("consulta", nargs="?")
    ap.add_argument("--vigilar", action="store_true", help="buscar todos los productos de vigilar.csv")
    ap.add_argument("--condicion", choices=CONDICIONES, default="nuevo")
    ap.add_argument("--top", type=int, default=3)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    if not a.consulta and not a.vigilar:
        ap.error("pasa una consulta o --vigilar")

    if a.vigilar:
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vigilar.csv")
        with open(ruta, encoding="utf-8") as f:
            productos = [(r["producto"], r["busqueda_ebay"]) for r in csv.DictReader(f)]
    else:
        productos = [(a.consulta, a.consulta)]

    tok = token()
    resultados = {nombre: buscar(tok, q, a.condicion)[: a.top] for nombre, q in productos}
    if a.json:
        print(json.dumps(resultados, ensure_ascii=False, indent=2))
        return
    for nombre, items in resultados.items():
        print(f"\n## {nombre}")
        if not items:
            print("  (sin anuncios que pasen los filtros)")
        for it in items:
            envio = "envío ?" if it["envio_usd"] is None else f"envío ${it['envio_usd']:.2f}"
            print(f"  ${it['precio_usd']:.2f} + {envio} | {it['estado']} | {it['vendedor']} "
                  f"({it['feedback_pct']}%, {it['feedback_score']}) | {it['titulo'][:70]}\n    {it['link']}")


if __name__ == "__main__":
    main()
