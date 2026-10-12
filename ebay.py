#!/usr/bin/env python3
"""Busca precios reales en eBay EE.UU. con la Browse API.

Usa las variables de entorno EBAY_CLIENT_ID y EBAY_CLIENT_SECRET (claves de Production).
Si no están, las lee de ~/.ebay-claves (lo crea configurar-ebay.sh; queda fuera del repo).

    python3 ebay.py "AMD Ryzen 5 5600 CPU"            # un producto
    python3 ebay.py --vigilar                         # todos los de vigilar.csv
    python3 ebay.py --vigilar --condicion usado --json
    python3 ebay.py --vigilar --guardar               # además agrega el más barato a precios-eeuu.csv
"""
import argparse
import base64
import csv
import datetime
import json
import os
import re
import sys
import urllib.parse
import urllib.request

TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
CONDICIONES = {"nuevo": "NEW", "usado": "USED", "todos": None}
# Categorías de eBay: procesadores, memoria RAM de escritorio, SSD
CATEGORIAS = {"cpu": "164", "ram": "170083", "ssd": "175669"}
# Anuncios que no son el producto en sí
EXCLUIR = ("box only", "empty box", "caja vacía", "for parts", "not working", "broken", "lot of",
           "cooler only", "heatsink only", "fan only", "replacement fan", "so dimm", "sodimm", "bundle", "combo", "motherboard", "laptop", "sodimm", "so-dimm")
MIN_FEEDBACK_PCT = 98.0
MIN_FEEDBACK_SCORE = 50


def cargar_claves():
    ruta = os.path.expanduser("~/.ebay-claves")
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                k, _, v = linea.strip().partition("=")
                if k in ("EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET") and v:
                    os.environ.setdefault(k, v)


def token():
    cargar_claves()
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


def normalizar(texto):
    t = texto.lower().replace("-", " ")
    t = re.sub(r"(\d)\s*x\s*(\d)", r"\1x\2", t)      # "2 x 16GB" -> "2x16gb"
    t = re.sub(r"(\d)\s+(gb|tb)\b", r"\1\2", t)      # "32 GB" -> "32gb"
    t = re.sub(r"(\d)\s*mhz\b", r"\1", t)             # "6000MHz" -> "6000"
    return t


def coincide(consulta, titulo):
    """El título debe tener todas las palabras con números de la consulta (modelo, capacidad, velocidad)."""
    t = normalizar(titulo)
    if any(x in t for x in EXCLUIR):
        return False
    claves = [w for w in normalizar(consulta).split() if any(c.isdigit() for c in w)]
    # Anuncios con varias capacidades (ej. "Netac 2TB 1TB 500GB") muestran el precio de la más barata
    if any(re.fullmatch(r"\d+tb", w) for w in claves):
        capacidades = set(re.findall(r"(?<![0-9a-z])(\d+(?:gb|tb))(?![0-9a-z])", t))
        if capacidades - set(claves):
            return False
    return all(re.search(rf"(?<![0-9a-z]){re.escape(w)}(?![0-9a-z])", t) for w in claves)


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

    out = []
    for it in data.get("itemSummaries", []):
        titulo = it.get("title", "")
        if not coincide(consulta, titulo):
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
    unicos = {(x["vendedor"], x["titulo"], x["precio_usd"]): x for x in out}
    return sorted(unicos.values(), key=lambda x: x["total_usd"])


def guardar(resultados, condicion):
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "precios-eeuu.csv")
    hoy = datetime.date.today().isoformat()
    with open(ruta, "a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        for nombre, items in resultados.items():
            if items:
                it = items[0]
                w.writerow([hoy, nombre, "usado" if condicion == "usado" else "nuevo",
                            f"{it['precio_usd']:.2f}", f"{it['envio_usd'] or 0:.2f}", "real",
                            f"eBay API ({condicion}; {it['vendedor']} {it['feedback_pct']}%)", it["link"]])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("consulta", nargs="?")
    ap.add_argument("--vigilar", action="store_true", help="buscar todos los productos de vigilar.csv")
    ap.add_argument("--condicion", choices=CONDICIONES, default="nuevo")
    ap.add_argument("--top", type=int, default=3)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--guardar", action="store_true", help="agregar el más barato de cada producto a precios-eeuu.csv")
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
    if a.guardar:
        guardar(resultados, a.condicion)
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
