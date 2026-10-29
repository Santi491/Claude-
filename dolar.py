#!/usr/bin/env python3
"""El dólar del día para tipo-cambio.csv (Santi, 28/10: los números en dólares van con el USDT).

Compramos en dólares pagando con USDT, así que el dólar de los cálculos (columna `usado`) es el precio para **comprar**
USDT con bolivianos en Binance P2P. El oficial del BCB y el paralelo de la calle se siguen anotando para comparar.

    python3 dolar.py                                  # muestra el USDT de ahora (no guarda)
    python3 dolar.py --guardar                        # anota o completa la fila de hoy en tipo-cambio.csv
    python3 dolar.py --guardar --oficial 12.02 --paralelo 12.16 12.14 --fuente "BCB y dolarbolivia.net 28/10 07:57"

Fuentes del USDT (sin claves): CriptoYa (junta Binance P2P, Bybit, Bitget...; https://criptoya.com/api/usdt/bob/1) y,
si falla, la API pública de Binance P2P (mediana de los 10 primeros anuncios). Si las dos fallan no inventa nada:
deja la fila sin USDT y `usado` con el paralelo, y lo dice en `fuente`.
"""
import argparse
import csv
import json
import os
import statistics
import sys
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

DIR = os.path.dirname(os.path.abspath(__file__))
ARCH = os.path.join(DIR, "tipo-cambio.csv")
COLS = ["fecha", "oficial", "paralelo_compra", "paralelo_venta", "usado", "fuente", "usdt_compra", "usdt_venta"]


def _json(url, datos=None):
    req = urllib.request.Request(url, data=json.dumps(datos).encode() if datos else None,
                                 headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def usdt_criptoya():
    d = _json("https://criptoya.com/api/usdt/bob/1")
    b = d["binancep2p"]
    otros = {k: v.get("totalAsk") for k, v in d.items() if k.endswith("p2p") and k != "binancep2p" and v.get("totalAsk")}
    return round(b["totalAsk"], 3), round(b["totalBid"], 3), "CriptoYa (Binance P2P)", otros


def usdt_binance():
    def mediana(tipo):
        d = _json("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
                  {"asset": "USDT", "fiat": "BOB", "tradeType": tipo, "page": 1, "rows": 10, "payTypes": [], "publisherType": None})
        return round(statistics.median(float(a["adv"]["price"]) for a in d["data"]), 3)
    # BUY = anuncios para comprar USDT (lo que pagamos); SELL = lo que nos pagan si vendemos
    return mediana("BUY"), mediana("SELL"), "Binance P2P (mediana de 10 anuncios)", {}


def usdt():
    errores = []
    for f in (usdt_criptoya, usdt_binance):
        try:
            return f()
        except Exception as e:  # noqa: BLE001
            errores.append(f"{f.__name__}: {e.__class__.__name__}")
    return None, None, "; ".join(errores), {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--guardar", action="store_true")
    ap.add_argument("--oficial", type=float)
    ap.add_argument("--paralelo", type=float, nargs=2, metavar=("COMPRA", "VENTA"))
    ap.add_argument("--fuente", default="", help="de dónde salieron el oficial y el paralelo")
    a = ap.parse_args()
    ahora = datetime.now(ZoneInfo("America/La_Paz"))
    hoy, hora = ahora.date().isoformat(), ahora.strftime("%H:%M")
    compra, venta, fuente_usdt, otros = usdt()
    if compra:
        print(f"USDT {hoy} {hora}: comprar {compra} Bs · vender {venta} Bs ({fuente_usdt})")
        if otros:
            print("  otros P2P (comprar):", ", ".join(f"{k.replace('p2p', '')} {v:.2f}" for k, v in otros.items()))
    else:
        print(f"No pude leer el USDT ({fuente_usdt})")
    if not a.guardar:
        return
    filas = list(csv.DictReader(open(ARCH, encoding="utf-8"))) if os.path.exists(ARCH) else []
    fila = next((f for f in filas if f["fecha"] == hoy), None)
    if not fila:
        fila = {c: "" for c in COLS}
        fila["fecha"] = hoy
        filas.append(fila)
    if a.oficial:
        fila["oficial"] = f"{a.oficial:g}"
    if a.paralelo:
        fila["paralelo_compra"], fila["paralelo_venta"] = (f"{x:g}" for x in a.paralelo)
    # la fuente de antes, sin la parte del USDT ni el aviso de "sin USDT" (se reescriben si se corre dos veces el mismo día)
    partes = [p for p in (fila.get("fuente") or "").split("; ") if p and not p.startswith(("USDT ", "sin USDT"))]
    if a.fuente.strip() and a.fuente.strip() not in partes:
        partes.insert(0, a.fuente.strip())
    if compra:
        fila["usdt_compra"], fila["usdt_venta"] = f"{compra:g}", f"{venta:g}"
        fila["usado"] = f"{compra:g}"
        partes.append(f"USDT {fuente_usdt} {hora} BOT (comprar {compra:g} / vender {venta:g}), usado = USDT para comprar")
    elif fila.get("paralelo_compra") and fila.get("paralelo_venta") and not fila.get("usdt_compra"):
        pm = (float(fila["paralelo_compra"]) + float(fila["paralelo_venta"])) / 2
        fila["usado"] = f"{round(pm, 3):g}"
        partes.append(f"sin USDT ({fuente_usdt}): usado = promedio del paralelo, revisar")
    fila["fuente"] = "; ".join(partes)
    w = csv.DictWriter(open(ARCH, "w", encoding="utf-8", newline=""), fieldnames=COLS, lineterminator="\n", extrasaction="ignore")
    w.writeheader()
    for f in filas:
        w.writerow({c: f.get(c) or "" for c in COLS})
    print(f"Guardado en tipo-cambio.csv: {hoy} usado {fila['usado']}")
    if not fila.get("usado"):
        sys.exit(1)


if __name__ == "__main__":
    main()
