#!/usr/bin/env python3
"""Arma los datos del mapa de envíos (pantalla del agente Pedidos) en oficina/mapa/.

    python3 oficina/mapa_datos.py           # calles nuevas de seguimiento.csv (y la base si falta)
    python3 oficina/mapa_datos.py --base    # rehace también estados, carreteras, ciudades y zonas urbanas

Base: Natural Earth (dominio público). Calles: OpenStreetMap vía Overpass (© colaboradores de OSM, ODbL),
un círculo de ~3 km alrededor de cada lugar de seguimiento.csv y de los puntos fijos (courier en Miami, Cochabamba).
La página no puede cargar mosaicos de otros sitios, así que todo se publica como archivos del artifact.
"""
import csv
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

OFI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(OFI)
OUT = os.path.join(OFI, "mapa")
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
CACHE = os.path.join(os.environ.get("TEMP", "/tmp"), "natural-earth")
FIJOS = [("Miami (bodegas de courier)", 25.81, -80.33, 4500), ("Cochabamba", -17.39, -66.157, 3500)]
SERVIDORES = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
US_BBOX = (-125.5, 24.0, -66.5, 49.6)


def bajar(nombre):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, nombre)
    if not os.path.exists(p):
        print("descargando", nombre)
        urllib.request.urlretrieve(NE + nombre, p)
    with open(p, encoding="utf-8") as f:
        return json.load(f)["features"]


def r(c, d):
    return [round(c[0], d), round(c[1], d)]


def geom(g, d):
    t, c = g["type"], g["coordinates"]
    if t == "LineString":
        return [[r(p, d) for p in c]]
    if t == "MultiLineString":
        return [[r(p, d) for p in l] for l in c]
    if t == "Polygon":
        return [[[r(p, d) for p in ring] for ring in c]]
    if t == "MultiPolygon":
        return [[[r(p, d) for p in ring] for ring in poly] for poly in c]
    return []


def dentro(g, bbox):
    def pts(c):
        if isinstance(c[0], (int, float)):
            yield c
        else:
            for x in c:
                yield from pts(x)
    return any(bbox[0] <= p[0] <= bbox[2] and bbox[1] <= p[1] <= bbox[3] for p in pts(g["coordinates"]))


def guardar(nombre, obj):
    os.makedirs(os.path.dirname(os.path.join(OUT, nombre)), exist_ok=True)
    with open(os.path.join(OUT, nombre), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(nombre, os.path.getsize(os.path.join(OUT, nombre)) // 1024, "KB")


def base():
    # países de América (contexto y la ruta hasta Bolivia)
    paises = [{"n": f["properties"]["NAME_ES"] or f["properties"]["NAME"], "g": geom(f["geometry"], 2)}
              for f in bajar("ne_50m_admin_0_countries.geojson")
              if f["properties"]["CONTINENT"] in ("North America", "South America")]
    estados = []
    for f in bajar("ne_50m_admin_1_states_provinces_lakes.geojson"):
        p = f["properties"]
        if p["adm0_a3"] != "USA":
            continue
        estados.append({"n": p["name"], "a": (p.get("postal") or ""), "c": [round(p["latitude"], 2), round(p["longitude"], 2)], "g": geom(f["geometry"], 3)})
    rutas = []
    for f in bajar("ne_10m_roads.geojson"):
        p = f["properties"]
        if p.get("sov_a3") != "USA" or p.get("type") not in ("Major Highway", "Secondary Highway", "Beltway"):
            continue
        k = 1 if p["type"] == "Major Highway" or p["type"] == "Beltway" else 2
        rutas.append({"k": k, "n": (p.get("label") or p.get("name") or "").strip(), "g": geom(f["geometry"], 3)})
    urb = [{"g": geom(f["geometry"], 3)} for f in bajar("ne_10m_urban_areas.geojson") if dentro(f["geometry"], US_BBOX)]
    ciud = []
    for f in bajar("ne_10m_populated_places_simple.geojson"):
        p = f["properties"]
        if p["adm0_a3"] in ("USA", "BOL"):
            ciud.append({"n": p["name"], "e": p.get("adm1name") or "", "c": [round(p["latitude"], 3), round(p["longitude"], 3)], "p": int(p["pop_max"] or 0), "z": round(p.get("min_zoom") or 6, 1)})
    ciud.sort(key=lambda c: -c["p"])
    guardar("base.json", {"paises": paises, "estados": estados, "ciudades": ciud})
    guardar("rutas.json", rutas)
    guardar("urbano.json", urb)


def slug(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


TIPOS = {"motorway": 1, "trunk": 1, "motorway_link": 1, "trunk_link": 1, "primary": 2, "primary_link": 2, "secondary": 2,
         "secondary_link": 2, "tertiary": 3, "tertiary_link": 3, "residential": 4, "unclassified": 4, "living_street": 4}


def calles(nombre, lat, lon, radio):
    q = f'[out:json][timeout:90];way(around:{radio},{lat},{lon})[highway~"^({"|".join(TIPOS)})$"];out tags geom;'
    for i, url in enumerate(SERVIDORES * 2):
        req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(),
                                     headers={"User-Agent": "oficina-agentes/1.0 (mapa de envios)"})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                js = json.load(resp)
            break
        except Exception as e:
            print("  ", url, e)
            if i == len(SERVIDORES) * 2 - 1:
                raise
            time.sleep(5)
    l = []
    for w in js.get("elements", []):
        g = w.get("geometry")
        if not g:
            continue
        l.append({"k": TIPOS[w["tags"]["highway"]], "n": w["tags"].get("name", ""), "g": [[round(p["lon"], 5), round(p["lat"], 5)] for p in g]})
    return {"n": nombre, "c": [lat, lon], "r": radio, "l": l}


def zonas():
    lugares = list(FIJOS)
    p = os.path.join(RAIZ, "seguimiento.csv")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            for e in csv.DictReader(f):
                if e.get("lat") and e.get("lon"):
                    # solo la ciudad: el código postal no se publica
                    lugar = re.sub(r"\s*\d{5}(-\d{4})?$", "", e["lugar"]).strip()
                    lugares.append((lugar, float(e["lat"]), float(e["lon"]), 3000))
    idx_p = os.path.join(OUT, "calles", "indice.json")
    idx = json.load(open(idx_p, encoding="utf-8")) if os.path.exists(idx_p) else []
    hechos = {z["f"] for z in idx}
    for nombre, lat, lon, radio in lugares:
        f = slug(nombre) + ".json"
        if f in hechos:
            continue
        print("calles de", nombre)
        z = calles(nombre, lat, lon, radio)
        guardar("calles/" + f, z)
        idx.append({"n": nombre, "f": f, "c": [lat, lon], "r": radio})
        hechos.add(f)
        guardar("calles/indice.json", idx)  # si falla la ciudad siguiente, esta no se vuelve a bajar
        time.sleep(2)
    guardar("calles/indice.json", idx)


if __name__ == "__main__":
    if "--base" in sys.argv or not os.path.exists(os.path.join(OUT, "base.json")):
        base()
    zonas()
