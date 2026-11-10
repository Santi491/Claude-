#!/usr/bin/env python3
"""Busca precios reales en eBay EE.UU. con la Browse API.

Usa las variables de entorno EBAY_CLIENT_ID y EBAY_CLIENT_SECRET (claves de Production).
Si no están, las lee de ~/.ebay-claves (lo crea configurar-ebay.sh; queda fuera del repo).

    python3 ebay.py "AMD Ryzen 5 5600 CPU"            # un producto
    python3 ebay.py --vigilar                         # todos los de vigilar.csv
    python3 ebay.py --vigilar --condicion usado --json
    python3 ebay.py --vigilar --guardar               # además agrega el más barato a precios-eeuu.csv
    python3 ebay.py --revisar                         # ¿los anuncios de hoy siguen a la venta? (en cada ronda)

Stock (Santi, 10/11): la oficina muestra solo lo que se puede comprar hoy. Antes de guardar un anuncio se le pregunta
a eBay si sigue a la venta y con stock; si se vendió, terminó o está agotado, se toma el siguiente más barato.
--revisar vuelve a preguntar por los anuncios guardados hoy: si alguno se vendió entre rondas, su fila pasa a
tipo "agotado" y se guarda el siguiente disponible (si no hay ninguno, la oficina dice "sin oferta hoy").
"""
import argparse
import base64
import csv
import datetime
import http.client
import json
import os
import re
import sys
import urllib.parse
import urllib.request

TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
ITEM_URL = "https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id"
MAX_REVISAR = 8   # anuncios que se prueban por producto antes de rendirse
# conditionIds de eBay: 1000 nuevo; 1500 open box; 3000 usado
CONDICIONES = {"nuevo": "1000", "openbox": "1500", "usado": "3000", "todos": None}
# Categorías de eBay: procesadores, memoria RAM de escritorio, SSD
CATEGORIAS = {"cpu": "164", "ram": "170083", "ssd": "175669"}
# Anuncios que no son el producto en sí
EXCLUIR = ("box only", "empty box", "caja vacía", "for parts", "not working", "broken", "lot of",
           "cooler only", "heatsink only", "fan only", "replacement fan", "so dimm", "sodimm", "bundle", "combo", "motherboard", "laptop", "sodimm", "so-dimm",
           "macbook", "imac", "mac mini", "mac pro",
           # para repuestos o con defectos (Rastreador eBay, 17/10): nunca cuentan como precio
           "for parts", "parts only", "as is", "as-is", "untested", "not tested", "damaged", "bent pin", "missing pin",
           "read description", "no post", "does not post", "defective", "faulty", "repair")
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
        filtros.append(f"conditionIds:{{{CONDICIONES[condicion]}}}")
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
        if condicion == "nuevo" and it.get("condition") != "New":
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
            "link": it.get("itemWebUrl", "").split("?")[0],
        })
    unicos = {(x["vendedor"], x["titulo"], x["precio_usd"]): x for x in out}
    return sorted(unicos.values(), key=lambda x: x["total_usd"])


def disponible(tok, link):
    """True si el anuncio sigue a la venta con stock; False si se vendió, terminó o está agotado;
    None si eBay no contestó (en la duda no se descarta)."""
    m = re.search(r"/itm/(\d+)", link or "")
    if not m:
        return None
    req = urllib.request.Request(f"{ITEM_URL}?legacy_item_id={m.group(1)}", headers={
        "Authorization": f"Bearer {tok}", "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"})
    d = None
    for _ in range(2):   # una conexión cortada se reintenta una vez
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
            break
        except (OSError, http.client.HTTPException, ValueError):   # URLError, cortes y tiempos de espera
            continue
    if d is None:
        return None
    fin = d.get("itemEndDate")
    if fin and datetime.datetime.fromisoformat(fin.replace("Z", "+00:00")) <= datetime.datetime.now(datetime.timezone.utc):
        return False
    for a in d.get("estimatedAvailabilities") or []:
        if a.get("estimatedAvailabilityStatus") == "OUT_OF_STOCK" or a.get("estimatedAvailableQuantity") == 0:
            return False
    return True


def primer_disponible(tok, items):
    """El más barato que sigue a la venta (devuelve el anuncio y cuántos se descartaron por vendidos o agotados)."""
    fuera = 0
    for it in items[:MAX_REVISAR]:
        if disponible(tok, it["link"]) is False:
            fuera += 1
            continue
        return it, fuera
    return None, fuera


def fila(hoy, nombre, condicion, it):
    return [hoy, nombre, condicion, f"{it['precio_usd']:.2f}", f"{it['envio_usd'] or 0:.2f}", "real",
            f"eBay API; vendedor {it['vendedor']} {it['feedback_pct']}%; {it['titulo'][:60]}"
            + ("; envío no indicado" if it["envio_usd"] is None else ""), it["link"]]


def guardar(elegidos, condicion):
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "precios-eeuu.csv")
    hoy = datetime.date.today().isoformat()
    with open(ruta, "a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        for nombre, it in elegidos.items():
            if it:
                w.writerow(fila(hoy, nombre, condicion, it))


def revisar(tok, productos):
    """Vuelve a preguntar por los anuncios guardados hoy; los vendidos o agotados pasan a "agotado" y se reemplazan."""
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "precios-eeuu.csv")
    with open(ruta, encoding="utf-8", newline="") as f:
        crudo = f.read()
    lector = csv.DictReader(crudo.splitlines())
    campos, filas = lector.fieldnames, list(lector)
    hoy, hora = datetime.date.today().isoformat(), datetime.datetime.now().strftime("%H:%M")
    nuevas, informe, revisados = [], [], 0
    for nombre, q in productos:
        for cond in ("nuevo", "usado"):
            de_hoy = [f for f in filas if f["producto"] == nombre and f["condicion"] == cond
                      and f["tipo"] == "real" and f["fecha"] == hoy]
            if not de_hoy:
                continue
            f = de_hoy[-1]
            revisados += 1
            if disponible(tok, f["link"]) is not False:
                continue
            f["tipo"] = "agotado"
            f["fuente"] += f"; vendido o agotado al revisar a las {hora}"
            try:
                otros = [x for x in buscar(tok, q, cond) if x["link"] != f["link"]]
            except (OSError, http.client.HTTPException, ValueError):
                otros = []   # la búsqueda no contestó: queda "sin oferta hoy" hasta la próxima revisión
            alt, _ = primer_disponible(tok, otros)
            if alt:
                nuevas.append(dict(zip(campos, fila(hoy, nombre, cond, alt))))
                informe.append(f"{nombre} {cond}: USD {f['precio_usd']} ya no está; ahora USD {alt['precio_usd']:.2f} ({alt['vendedor']})")
            else:
                informe.append(f"{nombre} {cond}: USD {f['precio_usd']} ya no está y no hay otro disponible (sin oferta hoy)")
    if informe:
        with open(ruta, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=campos, lineterminator="\r\n" if "\r\n" in crudo else "\n")
            w.writeheader()
            w.writerows(filas + nuevas)
    print(f"revisados {revisados} anuncios de hoy; " + (f"{len(informe)} cambiaron:\n  " + "\n  ".join(informe) if informe else "todos siguen a la venta"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("consulta", nargs="?")
    ap.add_argument("--vigilar", action="store_true", help="buscar todos los productos de vigilar.csv")
    ap.add_argument("--condicion", choices=CONDICIONES, default="nuevo")
    ap.add_argument("--top", type=int, default=3)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--guardar", action="store_true", help="agregar el más barato de cada producto a precios-eeuu.csv")
    ap.add_argument("--revisar", action="store_true", help="¿los anuncios guardados hoy siguen a la venta? (en cada ronda)")
    a = ap.parse_args()
    if not a.consulta and not a.vigilar and not a.revisar:
        ap.error("pasa una consulta, --vigilar o --revisar")

    if a.vigilar or a.revisar:
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vigilar.csv")
        with open(ruta, encoding="utf-8") as f:
            productos = [(r["producto"], r["busqueda_ebay"]) for r in csv.DictReader(f)]
    else:
        productos = [(a.consulta, a.consulta)]

    tok = token()
    if a.revisar:
        revisar(tok, productos)
        return
    resultados = {nombre: buscar(tok, q, a.condicion) for nombre, q in productos}
    if a.guardar:
        # solo se guarda un anuncio que sigue a la venta con stock (Santi, 10/11)
        elegidos = {}
        for nombre, items in resultados.items():
            elegidos[nombre], fuera = primer_disponible(tok, items)
            if fuera:
                print(f"{nombre}: {fuera} anuncio(s) más barato(s) ya vendidos o agotados, se saltaron")
            if elegidos[nombre]:
                resultados[nombre] = [elegidos[nombre]] + [x for x in items if x is not elegidos[nombre]]
        guardar(elegidos, a.condicion)
    resultados = {k: v[: a.top] for k, v in resultados.items()}
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
