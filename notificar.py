#!/usr/bin/env python3
"""Manda un aviso corto al WhatsApp de Santi con CallMeBot (gratis, solo a su propio número).

    python3 notificar.py "texto del aviso"
    python3 notificar.py --archivo aviso.txt

Lee CALLMEBOT_PHONE y CALLMEBOT_APIKEY del entorno (rutina de la nube) o de ~/.callmebot (Mac, lo crea
configurar-callmebot.sh). Nunca imprime la clave. Mandar solo resúmenes cortos y links: el texto pasa por CallMeBot.
"""
import argparse
import os
import sys
import urllib.parse
import urllib.request


def claves():
    ruta = os.path.expanduser("~/.callmebot")
    if os.path.exists(ruta):
        for linea in open(ruta, encoding="utf-8"):
            k, _, v = linea.strip().partition("=")
            if k in ("CALLMEBOT_PHONE", "CALLMEBOT_APIKEY") and v:
                os.environ.setdefault(k, v)
    tel, key = os.environ.get("CALLMEBOT_PHONE"), os.environ.get("CALLMEBOT_APIKEY")
    if not tel or not key:
        sys.exit("Faltan CALLMEBOT_PHONE / CALLMEBOT_APIKEY: no se mandó el aviso.")
    return tel, key


def enviar(texto):
    tel, key = claves()
    q = urllib.parse.urlencode({"phone": tel, "text": texto[:1500], "apikey": key})
    with urllib.request.urlopen(f"https://api.callmebot.com/whatsapp.php?{q}", timeout=60) as r:
        cuerpo = r.read().decode("utf-8", "replace")
    ok = r.status == 200 and "error" not in cuerpo.lower()
    print("aviso enviado" if ok else f"CallMeBot respondió con un problema (HTTP {r.status})")
    return ok


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("texto", nargs="?")
    ap.add_argument("--archivo")
    a = ap.parse_args()
    texto = open(a.archivo, encoding="utf-8").read() if a.archivo else a.texto
    if not texto:
        ap.error("pasa el texto o --archivo")
    sys.exit(0 if enviar(texto.strip()) else 1)
