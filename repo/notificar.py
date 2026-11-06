#!/usr/bin/env python3
"""Manda un aviso corto a Santi por Telegram (bot propio, API oficial) y/o WhatsApp (CallMeBot).

    python3 notificar.py "texto del aviso"
    python3 notificar.py --archivo aviso.txt
    python3 notificar.py --buscar-chat      # muestra el chat_id de quien le escribió al bot (para configurarlo)

Manda por cada canal que tenga claves; alcanza con que uno funcione.
- Telegram: TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID (entorno de la nube, o ~/.telegram creado con configurar-telegram.sh).
- WhatsApp: CALLMEBOT_PHONE y CALLMEBOT_APIKEY (entorno, o ~/.callmebot creado con configurar-callmebot.sh).
Nunca imprime claves ni tokens. Mandar solo resúmenes cortos y links.
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request


def cargar(archivo, nombres):
    ruta = os.path.expanduser(archivo)
    if os.path.exists(ruta):
        for linea in open(ruta, encoding="utf-8-sig"):   # -sig: el Bloc de notas de Windows puede guardar con BOM
            k, _, v = linea.strip().partition("=")
            if k in nombres and v:
                os.environ.setdefault(k, v)
    return [os.environ.get(n) for n in nombres]


def pedir(url, datos=None):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(datos).encode() if datos else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read().decode("utf-8", "replace")


def telegram(texto):
    token, chat = cargar("~/.telegram", ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"))
    if not token or not chat:
        return None
    try:
        _, cuerpo = pedir(f"https://api.telegram.org/bot{token}/sendMessage",
                          {"chat_id": chat, "text": texto[:4000], "disable_web_page_preview": "true"})
        return json.loads(cuerpo).get("ok", False)
    except Exception as e:  # el error no incluye el token
        print(f"Telegram: no se pudo mandar ({type(e).__name__})")
        return False


def whatsapp(texto):
    tel, key = cargar("~/.callmebot", ("CALLMEBOT_PHONE", "CALLMEBOT_APIKEY"))
    if not tel or not key:
        return None
    try:
        q = urllib.parse.urlencode({"phone": tel, "text": texto[:1500], "apikey": key})
        st, cuerpo = pedir(f"https://api.callmebot.com/whatsapp.php?{q}")
        return st == 200 and "error" not in cuerpo.lower()
    except Exception as e:
        print(f"WhatsApp (CallMeBot): no se pudo mandar ({type(e).__name__})")
        return False


def enviar(texto):
    res = {"Telegram": telegram(texto), "WhatsApp": whatsapp(texto)}
    usados = {k: v for k, v in res.items() if v is not None}
    if not usados:
        print("No hay ningún canal configurado (faltan TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID o CALLMEBOT_PHONE/CALLMEBOT_APIKEY): no se mandó el aviso.")
        return False
    for k, v in usados.items():
        print(f"{k}: {'aviso enviado' if v else 'falló'}")
    return any(usados.values())


def buscar_chat():
    token, _ = cargar("~/.telegram", ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"))
    if not token:
        sys.exit("Falta TELEGRAM_BOT_TOKEN.")
    try:
        _, cuerpo = pedir(f"https://api.telegram.org/bot{token}/getUpdates")
    except Exception as e:  # sin traceback: la URL lleva el token
        sys.exit("Telegram rechazó el token (revisa que esté completo, como 123456789:AAH...)." if "404" in str(e) or "401" in str(e) else f"No se pudo hablar con Telegram ({type(e).__name__}).")
    chats = {}
    for u in json.loads(cuerpo).get("result", []):
        m = u.get("message") or u.get("edited_message") or {}
        c = m.get("chat", {})
        if c.get("id"):
            chats[c["id"]] = c.get("first_name") or c.get("title") or ""
    if not chats:
        sys.exit("El bot todavía no recibió mensajes: abre tu bot en Telegram, toca Iniciar y escríbele \"hola\".")
    for cid, nombre in chats.items():
        print(f"{cid}\t{nombre}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("texto", nargs="?")
    ap.add_argument("--archivo")
    ap.add_argument("--buscar-chat", action="store_true")
    a = ap.parse_args()
    if a.buscar_chat:
        buscar_chat()
        sys.exit(0)
    texto = open(a.archivo, encoding="utf-8").read() if a.archivo else a.texto
    if not texto:
        ap.error("pasa el texto o --archivo")
    sys.exit(0 if enviar(texto.strip()) else 1)
