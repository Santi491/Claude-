#!/usr/bin/env python3
"""Lee los mensajes nuevos que Santi le escribió al bot de Telegram del Gerente.

    python3 telegram_leer.py            # muestra los mensajes nuevos y los marca como leídos
    python3 telegram_leer.py --ver      # los muestra sin marcarlos como leídos

Solo cuenta los mensajes del chat de Santi (TELEGRAM_CHAT_ID); los de cualquier otro chat se ignoran.
El texto NO se guarda en el repo (es público): quien los lee anota la decisión en plan.csv / actividad.csv.
En el repo queda solo el último update_id leído (telegram-estado.json), para no procesar dos veces el mismo mensaje.
Telegram guarda los mensajes sin leer unas 24 horas: por eso los leen la nube de la mañana, cada ronda local y el Gerente.
"""
import argparse
import json
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from notificar import cargar, pedir

DIR = os.path.dirname(os.path.abspath(__file__))
ESTADO = os.path.join(DIR, "telegram-estado.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ver", action="store_true")
    ap.add_argument("--forzar", action="store_true", help="leer aunque la Raspberry esté activa")
    a = ap.parse_args()
    # Con la Raspberry prendida, ella lee Telegram al momento: si otra sesión lee, le quita los mensajes al bot
    if os.path.exists(os.path.join(DIR, "raspberry", "ACTIVA")) and not a.forzar:
        print("La Raspberry está activa y lee Telegram: no se leen mensajes acá. Lo que decidió Santi está en plan.csv y actividad.csv (\"Telegram (Raspberry)\").")
        return
    token, chat = cargar("~/.telegram", ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"))
    if not token or not chat:
        sys.exit("Faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID: no se pudo leer Telegram.")
    ultimo = json.load(open(ESTADO)).get("ultimo_update_id", 0) if os.path.exists(ESTADO) else 0
    try:
        _, cuerpo = pedir(f"https://api.telegram.org/bot{token}/getUpdates?offset={ultimo + 1}&timeout=0")
    except Exception as e:  # sin traceback: la URL lleva el token
        sys.exit(f"No se pudo leer Telegram ({type(e).__name__}).")
    nuevos, ignorados, maximo = [], 0, ultimo
    for u in json.loads(cuerpo).get("result", []):
        maximo = max(maximo, u["update_id"])
        m = u.get("message") or u.get("edited_message") or {}
        if str(m.get("chat", {}).get("id")) != str(chat):
            ignorados += 1
            continue
        texto = m.get("text") or m.get("caption") or "(mensaje sin texto)"
        cuando = datetime.fromtimestamp(m.get("date", 0), ZoneInfo("America/La_Paz"))
        nuevos.append({"fecha": cuando.strftime("%Y-%m-%d"), "hora": cuando.strftime("%H:%M"), "texto": texto})
    if not nuevos:
        print("Sin mensajes nuevos de Santi en Telegram.")
    for n in nuevos:
        print(f"[{n['fecha']} {n['hora']}] Santi: {n['texto']}")
    if ignorados:
        print(f"({ignorados} mensajes de otros chats ignorados)")
    if not a.ver and maximo > ultimo:
        json.dump({"ultimo_update_id": maximo}, open(ESTADO, "w"))
        # confirma a Telegram que ya se leyeron
        try:
            pedir(f"https://api.telegram.org/bot{token}/getUpdates?offset={maximo + 1}&timeout=0")
        except Exception:
            pass


if __name__ == "__main__":
    main()
