#!/usr/bin/env python3
"""Productos candidatos para la lista (Santi, 12/11: "que me recomienden añadir productos, como hicimos con el 9600X").

Las tiendas nos mandan catálogos y listas con muchos más productos que los de vigilar.csv. Esos precios van a mercado.csv
(fecha, producto, categoria, precio_bs, moneda, precio_original, estado, tienda, canal, en_stock, notas): los anotan el agente
Catálogos (webs y PDF), WhatsApp (lo que dicen las tiendas) y Marketplace (anuncios). Solo componentes que podríamos traer
(procesadores, RAM y SSD); nada de datos de personas.

Este script junta, por modelo, lo que dice el mercado de Cochabamba en los últimos 45 días:
  - cuántas tiendas lo tienen y a qué precio (mediana), y cuántas dijeron que no tienen (en_stock = no): si muchas no tienen,
    hay hueco para vender;
  - cuántos anuncios hay en Marketplace (señal de que se mueve);
y le pregunta a eBay cuánto cuesta nuevo y con stock, para calcular el margen con el MISMO cálculo del Analista y del
Cazador (courier más barato, dólar USDT, venta 5 % debajo de la mediana local) y el peor caso.

    python3 candidatos.py                  # tabla de candidatos (sin eBay: rápido)
    python3 candidatos.py --ebay           # con precio de eBay y margen (lo corre el Analista los lunes)
    python3 candidatos.py --ebay --proponer   # además, propone a Santi (ideas.csv) los mejores, como máximo 3
    python3 candidatos.py --importar-notas # una sola vez: pasa a mercado.csv los precios que estaban en notas

Se propone un producto solo si: margen ≥ 20 %, peor caso ≥ 5 %, al menos 2 tiendas con precio en 45 días, no está en
vigilar.csv y no se propuso en los últimos 14 días. Agregarlo a la lista lo decide Santi (como el 9600X).
"""
import csv
import os
import re
import statistics
import sys
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIR)
ARCH = os.path.join(DIR, "mercado.csv")
COLS = ["fecha", "producto", "categoria", "precio_bs", "moneda", "precio_original", "estado", "tienda", "canal", "en_stock", "notas"]
DIAS = 45
HOY = datetime.now(ZoneInfo("America/La_Paz")).date()


def leer(n):
    ruta = os.path.join(DIR, n)
    return list(csv.DictReader(open(ruta, encoding="utf-8"))) if os.path.exists(ruta) else []


def num(v):
    try:
        return float(str(v).replace(".", "").replace(",", ".")) if re.search(r"\d\.\d{3}", str(v)) else float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


def normalizar(t):
    """Nombre canónico de un procesador ('5800X3D' → 'Ryzen 7 5800X3D', 'i5 13400f' → 'Intel Core i5-13400F'); RAM y SSD quedan como vienen."""
    s = re.sub(r"\s+", " ", t or "").strip()
    m = re.search(r"(?:ryzen\s?([3579])\s?)?(\d{4})(x3d|xt|x|gt|g|f)?\b", s, re.I)
    if m and (m.group(1) or re.search(r"ryzen|x3d", s, re.I) or m.group(3)) and not re.search(r"\bi[3579]|ultra|ddr|rtx|rx\s", s, re.I):
        n, mod, suf = m.group(1), m.group(2), (m.group(3) or "").upper()
        if not n:   # sin la serie: se deduce del modelo (5800X3D → 7, 9950X3D → 9, 5500 → 5, 3200G → 3)
            n = {"9": "9", "8": "7", "7": "7", "6": "5", "5": "5", "4": "5", "3": "5", "2": "3", "1": "3"}.get(mod[1], "5")
            if mod[1] == "7" and mod[0] in "3": n = "3"
        return f"Ryzen {n} {mod}{suf}"
    m = re.search(r"\bi([3579])[- ]?(\d{4,5})([a-z]{0,2})\b", s, re.I)
    if m:
        return f"Intel Core i{m.group(1)}-{m.group(2)}{m.group(3).upper()}"
    m = re.search(r"ultra\s?([579])\s?(\d{3})([a-z]{0,2})\b", s, re.I)
    if m:
        return f"Intel Core Ultra {m.group(1)} {m.group(2)}{m.group(3).upper()}"
    return s


def categoria(p):
    return "cpu" if re.search(r"ryzen|intel core", p, re.I) else "ram" if re.search(r"ddr[345]", p, re.I) else "ssd" if re.search(r"ssd|nvme", p, re.I) else "otro"


def en_lista():
    return {normalizar(v["producto"]).lower() for v in leer("vigilar.csv")}


def tc_del(fecha):
    fx = sorted((f for f in leer("tipo-cambio.csv") if num(f.get("usado"))), key=lambda f: f["fecha"])
    antes = [f for f in fx if f["fecha"] <= fecha]
    return num((antes or fx)[-1]["usado"]) if fx else None


def guardar(filas):
    nuevo = not os.path.exists(ARCH)
    with open(ARCH, "a", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS, lineterminator="\n")
        if nuevo:
            w.writeheader()
        w.writerows(filas)


def importar_notas():
    """Una vez: los precios de modelos fuera de la lista que quedaron escritos en notas de catálogos, mensajes y precios."""
    pat = re.compile(r"(Ryzen\s?[3579]\s?\d{4}[A-Z0-9]{0,3}|\b\d{4}X3D|(?:Core\s)?i[3579][- ]\d{4,5}[A-Z]{0,2}|(?:Core\s)?Ultra\s?[579]\s?\d{3}[A-Z]{0,2})"
                     r"([^;,()]{0,25}?)\b(Bs|USD)\s?([\d.]+(?:,\d+)?)", re.I)
    lista, vistos, filas = en_lista(), {(r["fecha"], r["producto"], r["tienda"]) for r in leer("mercado.csv")}, []
    for fn, campos, canal in (("catalogos.csv", ("descripcion", "notas"), "web"), ("mensajes.csv", ("nota",), "whatsapp"),
                              ("precios-cochabamba.csv", ("estado", "condiciones"), "")):
        for r in leer(fn):
            if fn == "mensajes.csv" and r.get("canal") != "whatsapp":
                continue
            txt = " ".join(r.get(k, "") for k in campos)
            for m in pat.finditer(txt):
                prod = normalizar(m.group(1))
                if prod.lower() in lista or "7700X3D" in prod:   # 7700X3D no existe: es un error de la nota
                    continue
                tienda = re.sub(r"\s*\((WhatsApp|catálogo.*?|web)\)\s*$", "", r.get("tienda") or r.get("fuente", "")).strip()
                mon, val = m.group(3).upper(), num(m.group(4))
                if not val or (fn == "precios-cochabamba.csv" and not tienda):
                    continue
                tc = tc_del(r["fecha"])
                bs = val if mon == "BS" else (round(val * tc) if tc else None)
                clave = (r["fecha"], prod, tienda)
                if not bs or clave in vistos:
                    continue
                vistos.add(clave)
                est = "oem" if re.search(r"oem|tray", m.group(2) + txt[m.start():m.end() + 10], re.I) else "nuevo"
                filas.append({"fecha": r["fecha"], "producto": prod, "categoria": categoria(prod), "precio_bs": f"{bs:g}", "moneda": "Bs" if mon == "BS" else "USD",
                              "precio_original": f"{val:g}", "estado": est, "tienda": tienda, "canal": canal or ("whatsapp" if "WhatsApp" in r.get("fuente", "") else "web"),
                              "en_stock": "sí", "notas": f"importado de las notas de {fn} (12/11)"})
    guardar(filas)
    print(f"mercado.csv: {len(filas)} precios importados de las notas")


def juntar():
    desde = (HOY - timedelta(days=DIAS)).isoformat()
    lista, g = en_lista(), {}
    for r in leer("mercado.csv"):
        if r["fecha"] < desde:
            continue
        p = normalizar(r["producto"])
        if p.lower() in lista:
            continue
        x = g.setdefault(p, {"producto": p, "categoria": r.get("categoria") or categoria(p), "precios": [], "tiendas": set(), "sin_stock": set(),
                             "marketplace": 0, "ultimo": ""})
        x["ultimo"] = max(x["ultimo"], r["fecha"])
        if (r.get("en_stock") or "").lower().startswith("n"):
            x["sin_stock"].add(r["tienda"])
            continue
        if r.get("canal") == "marketplace":
            x["marketplace"] += 1
        if num(r.get("precio_bs")):
            x["por_tienda"] = x.get("por_tienda", {})
            ant = x["por_tienda"].get(r["tienda"])
            if not ant or r["fecha"] >= ant[0]:      # una sola cifra por tienda: la más reciente
                x["por_tienda"][r["tienda"]] = (r["fecha"], num(r["precio_bs"]))
            x["tiendas"].add(r["tienda"])
    for x in g.values():
        x["precios"] = [v for _, v in x.get("por_tienda", {}).values()]
        x["mediana_bs"] = round(statistics.median(x["precios"])) if x["precios"] else None
    return sorted(g.values(), key=lambda x: (-len(x["tiendas"]), -(x["marketplace"]), x["producto"]))


def con_ebay(cands, maximo=15):
    import cazador as Z
    import ebay
    ebay.cargar_claves()
    tok = ebay.token()
    tc = tc_del(HOY.isoformat())
    for x in [c for c in cands if c["mediana_bs"]][:maximo]:
        q = (("AMD " if x["producto"].startswith("Ryzen") else "") + x["producto"] + (" CPU" if x["categoria"] == "cpu" else ""))
        try:
            it, _ = ebay.primer_disponible(tok, [i for i in ebay.buscar(tok, q, "nuevo") if i["envio_usd"] is not None])
        except Exception as e:  # noqa: BLE001
            x["ebay_error"] = e.__class__.__name__
            continue
        if not it:
            continue
        m, costo, venta, _ = Z.margen(it["total_usd"], 350 if x["categoria"] == "cpu" else 150, tc, x["mediana_bs"])
        peor = Z.margen(it["total_usd"], 350 if x["categoria"] == "cpu" else 150, tc, x["mediana_bs"], 1.03, 1.2, 0.9)[0]
        x |= {"ebay_usd": round(it["total_usd"], 2), "ebay_link": it["link"], "costo_bs": round(costo), "venta_bs": venta,
              "margen": round(m * 100, 1), "peor": round(peor * 100, 1)}
    return cands


def proponer(cands):
    ideas = leer("ideas.csv")
    hace14 = (HOY - timedelta(days=14)).isoformat()
    ya = {i["idea"] for i in ideas if i["fecha"] >= hace14}
    buenos = [x for x in cands if (x.get("margen") or 0) >= 20 and (x.get("peor") or -99) >= 5 and len(x["tiendas"]) >= 2
              and not any(x["producto"] in i for i in ya)]
    buenos.sort(key=lambda x: (-(x["peor"]), -len(x["tiendas"])))
    hora = datetime.now(ZoneInfo("America/La_Paz")).strftime("%H:%M")
    filas = []
    for x in buenos[:3]:
        hueco = f", {len(x['sin_stock'])} dijeron que no tienen" if x["sin_stock"] else ""
        mkt = f", {x['marketplace']} anuncio(s) en Marketplace" if x["marketplace"] else ""
        filas.append([HOY.isoformat(), hora, "ana", f"Agregar {x['producto']} a vigilar.csv (candidato de mercado.csv)",
                      f"En Cochabamba lo tienen {len(x['tiendas'])} tiendas a una mediana de Bs {x['mediana_bs']:,}{hueco}{mkt}; "
                      f"en eBay nuevo USD {x['ebay_usd']}: margen {x['margen']} % y peor caso {x['peor']} % (mismo cálculo del Analista). "
                      f"Falta medir la demanda con Marketplace antes de comprar.".replace(",", "."), "propuesta", ""])
    if filas:
        with open(os.path.join(DIR, "ideas.csv"), "a", encoding="utf-8", newline="") as f:
            csv.writer(f, lineterminator="\n").writerows(filas)
    print(f"Propuestas nuevas en ideas.csv: {len(filas)}")


def main():
    if "--importar-notas" in sys.argv:
        importar_notas()
        return
    cands = juntar()
    if "--ebay" in sys.argv:
        cands = con_ebay(cands)
    print(f"Candidatos fuera de la lista (últimos {DIAS} días de mercado.csv): {len(cands)}")
    for x in cands:
        eb = f" · eBay USD {x['ebay_usd']} → margen {x['margen']} %, peor {x['peor']} %" if x.get("ebay_usd") else ""
        ss = f" · {len(x['sin_stock'])} sin stock" if x["sin_stock"] else ""
        mk = f" · {x['marketplace']} en Marketplace" if x["marketplace"] else ""
        print(f"- {x['producto']}: {len(x['tiendas'])} tienda(s), mediana Bs {x['mediana_bs'] or '—'}{ss}{mk}{eb}")
    if "--proponer" in sys.argv:
        proponer(cands)


if __name__ == "__main__":
    main()
