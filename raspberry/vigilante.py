#!/usr/bin/env python3
"""Vigilante del equipo (Raspberry, cada 30 minutos por cron; no usa IA ni gasta el plan de Claude).

    python3 raspberry/vigilante.py           # revisa, arregla lo que puede y avisa a Santi
    python3 raspberry/vigilante.py --probar  # solo muestra qué haría

Qué hace (Santi, 17/10: "que me diga: pasó esto, hice esto y lo solucioné"):
- Si a las 13:00 de lunes a viernes la Mac no hizo su ronda, pide a la PC que la cubra (pedido-pc.json) y la prende.
- Si a las 16:15 de lunes a sábado la PC no prendió, la vuelve a prender; si a las 16:30 sigue apagada, avisa.
- Si a las 18:00 la PC no hizo su ronda, la relanza una vez (pedido + encender).
- Si la nube (9:30) o el Gerente de las 20:00 (20:45) no corrieron, avisa (eso no lo puede arreglar la Raspberry;
  los agentes de la ronda local recuperan el dólar y eBay si faltan).
- Si un pedido a la PC lleva más de 90 minutos sin hacerse, avisa.
- Cada 3 horas sube su latido (salud-raspberry.json) para que la oficina y el Gerente sepan que está viva.
Todo lo que hace queda en sesiones.csv (quien raspberry, tipo vigilante) y se sube a GitHub.
"""
import json
import os
import subprocess
import sys
from datetime import datetime

DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(DIR)
sys.path.insert(0, REPO)
import salud  # noqa: E402
from notificar import cargar, telegram  # noqa: E402

PROBAR = "--probar" in sys.argv
ESTADO = os.path.expanduser("~/.cargo-vigilante.json")
PEDIDO = os.path.join(REPO, "pedido-pc.json")
cargar("~/.cargo-bot", ("PC_MAC", "PC_IP"))
cargar("~/.telegram", ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"))


def git(*a):
    return subprocess.run(["git", "-C", REPO, *a], capture_output=True, text=True, timeout=120)


def subir(msg, archivos):
    if PROBAR:
        return
    git("add", *archivos)
    if git("diff", "--cached", "--quiet").returncode == 0:
        return
    git("commit", "-q", "-m", msg)
    for _ in range(3):
        if git("push", "-q").returncode == 0:
            return
        git("pull", "--no-rebase", "--no-edit", "-q")


def avisar(texto):
    print("AVISO:", texto)
    if not PROBAR:
        try:
            telegram(texto)
        except Exception as e:
            print("no se pudo avisar:", e)


def pc_prendida():
    ip = os.environ.get("PC_IP")
    if not ip:
        return None
    subprocess.run(["ping", "-c", "1", "-W", "1", ip], capture_output=True)
    return "REACHABLE" in subprocess.run(["ip", "neigh", "show", ip], capture_output=True, text=True).stdout


def prender_pc():
    if PROBAR:
        print("prendería la PC")
        return
    subprocess.Popen([sys.executable, os.path.join(DIR, "despertar_pc.py")], cwd=REPO,
                     stdout=open(os.path.expanduser("~/despertar.log"), "a"), stderr=subprocess.STDOUT)


def pedir_a_pc(tipo, motivo, ligera=False):
    t = salud.ahora()
    p = {"id": t.strftime("%Y-%m-%d-%H%M"), "tipo": tipo, "ligera": ligera, "motivo": motivo,
         "pedido": t.strftime("%Y-%m-%d %H:%M"), "por": "vigilante"}
    if not PROBAR:
        json.dump(p, open(PEDIDO, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return p


def main():
    if not PROBAR:
        git("pull", "--no-rebase", "--no-edit", "-q")
    t = salud.ahora()
    hoy, hora, dia = t.strftime("%Y-%m-%d"), t.strftime("%H:%M"), t.weekday()
    est = json.load(open(ESTADO)) if os.path.exists(ESTADO) else {}
    if est.get("dia") != hoy:
        est = {"dia": hoy, "hecho": [], "latido": est.get("latido", "")}
    hecho = set(est["hecho"])
    e = salud.estado_dia(hoy, hora)
    cambios, eventos = [], []
    pedido = json.load(open(PEDIDO, encoding="utf-8")) if os.path.exists(PEDIDO) else None

    # 1. La Mac no hizo su ronda de la mañana: la cubre la PC
    if e["mac"]["estado"] == "no corrió" and "cubre-mac" not in hecho and not pedido:
        pedir_a_pc("cubre mac", "la Mac no hizo la ronda de la mañana")
        prender_pc()
        hecho.add("cubre-mac")
        cambios.append("pedido-pc.json")
        eventos.append(("arreglo", "la Mac no hizo la ronda de la mañana: la cubre la PC"))
        avisar("Te cuento, Santi: la Mac no hizo la ronda de la mañana (seguramente estaba apagada), así que prendí la PC "
               "y la está haciendo ahí. Cuando termine te mando el resumen; no tienes que hacer nada.")

    # 2. La PC no prendió para la ronda de las 16:00
    if dia in salud.HORARIO["pc"]["dias"] and e["pc"]["estado"] == "pendiente":
        if "16:15" <= hora < "16:30" and "reintento-pc" not in hecho and pc_prendida() is False:
            prender_pc()
            hecho.add("reintento-pc")
            eventos.append(("arreglo", "la PC no prendió a las 15:50: segundo intento"))
        if "16:30" <= hora and "pc-apagada" not in hecho and pc_prendida() is False:
            hecho.add("pc-apagada")
            eventos.append(("alerta", "la PC no prendió para la ronda de las 16:00"))
            avisar("Santi, ojo: intenté prender la PC dos veces para la ronda de las 16:00 y no respondió. "
                   "Puede ser la luz o el cable de red. Hoy la tarde queda sin ronda hasta que la revises.")

    # 3. La PC prendió pero no hizo la ronda: se relanza una vez
    if e["pc"]["estado"] == "no corrió" and "relanza-pc" not in hecho and not pedido:
        pedir_a_pc("ronda", "la PC no hizo la ronda de las 16:00", ligera=dia == 5)
        prender_pc()
        hecho.add("relanza-pc")
        cambios.append("pedido-pc.json")
        eventos.append(("arreglo", "la PC no hizo la ronda de las 16:00: relanzada"))
        avisar("Te cuento: la ronda de las 16:00 no se hizo, así que se la volví a pedir a la PC y la prendí. "
               "Si en una hora no te llega el resumen, es que algo la está frenando y lo revisamos.")

    # 4. La nube o el Gerente no corrieron (no lo puede arreglar la Raspberry)
    for k, txt in (("nube", "la revisión de la nube de las 7:52 no corrió hoy. No te preocupes: la ronda local trae el dólar y eBay si faltan."),
                   ("gerente", "el informe de las 20:00 no salió hoy. Mañana lo reviso; si se repite, hay que mirar la rutina en la nube.")):
        if e[k]["estado"] == "no corrió" and f"no-{k}" not in hecho:
            hecho.add(f"no-{k}")
            eventos.append(("alerta", f"{k} no corrió"))
            avisar("Santi, te aviso que " + txt)

    # 5. Un pedido a la PC lleva demasiado sin hacerse
    if pedido:
        try:
            edad = (t - datetime.strptime(pedido["pedido"], "%Y-%m-%d %H:%M").replace(tzinfo=salud.TZ)).total_seconds() / 60
        except (KeyError, ValueError):
            edad = 0
        if edad > 90 and f"pedido-viejo-{pedido.get('id')}" not in hecho:
            hecho.add(f"pedido-viejo-{pedido.get('id')}")
            eventos.append(("alerta", f"pedido a la PC sin hacer hace {int(edad)} min"))
            avisar(f"Santi, el pedido a la PC ({pedido.get('tipo')}: {pedido.get('motivo', '')[:80]}) lleva {int(edad)} minutos "
                   "sin hacerse. Puede que Claude no se haya abierto en la PC; ¿la puedes mirar cuando llegues?")

    # latido cada 3 horas (o si hubo eventos)
    lat = os.path.join(REPO, "salud-raspberry.json")
    if eventos or not est.get("latido") or (t - datetime.strptime(est["latido"], "%Y-%m-%d %H:%M").replace(tzinfo=salud.TZ)).total_seconds() > 3 * 3600:
        bot = subprocess.run(["systemctl", "is-active", "cargo-bot"], capture_output=True, text=True).stdout.strip()
        d = {"ultima": t.strftime("%Y-%m-%d %H:%M"), "bot": bot, "pc": {True: "prendida", False: "apagada", None: "?"}[pc_prendida()],
             "eventos_hoy": len(est.get("eventos", [])) + len(eventos)}
        if not PROBAR:
            json.dump(d, open(lat, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        est["latido"] = d["ultima"]
        cambios.append("salud-raspberry.json")
    for tipo, nota in eventos:
        if not PROBAR:
            salud.anotar("raspberry", "vigilante", "arreglado" if tipo == "arreglo" else "alerta", nota)
        cambios.append("sesiones.csv")
    est["hecho"] = sorted(hecho)
    est["eventos"] = est.get("eventos", []) + [n for _, n in eventos]
    if not PROBAR:
        json.dump(est, open(ESTADO, "w"))
    if cambios:
        subir("Vigilante (Raspberry): " + ("; ".join(n for _, n in eventos) or "latido"), sorted(set(cambios)))
    print(hora, {k: v["estado"] for k, v in e.items()}, "eventos:", [n for _, n in eventos])


if __name__ == "__main__":
    main()
