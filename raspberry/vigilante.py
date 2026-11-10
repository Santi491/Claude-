#!/usr/bin/env python3
"""Vigilante del equipo (Raspberry, cada 30 minutos por cron; no usa IA ni gasta el plan de Claude).

    python3 raspberry/vigilante.py           # revisa, arregla lo que puede y avisa a Santi
    python3 raspberry/vigilante.py --probar  # solo muestra qué haría

Qué hace (Santi, 17/10: "que me diga: pasó esto, hice esto y lo solucioné"):
- Mañana (desde el 11/11 la hace la PC, Santi 10/11): de lunes a viernes prende la PC a las 10:00 para la ronda de las
  10:30; si a las 10:30 sigue apagada la vuelve a prender y a las 11:00 avisa; si a las 13:00 no hizo la ronda, la
  relanza una vez (pedido + encender).
- Si a las 16:15 de lunes a sábado la PC no prendió, la vuelve a prender; si a las 16:30 sigue apagada, avisa.
- Si a las 18:00 la PC no hizo su ronda, la relanza una vez (pedido + encender).
- Si la nube (9:30) o el Gerente de las 20:00 (20:45) no corrieron, avisa (eso no lo puede arreglar la Raspberry;
  los agentes de la ronda local recuperan el dólar y eBay si faltan).
- Si un pedido a la PC lleva más de 2 horas y media sin hacerse, avisa (la PC revisa los pedidos cada 2 horas desde el
  10/11). Si lleva más de 4 horas y la PC no está
  trabajando en él, lo da por perdido: lo borra y avisa (Santi, 10/11: un pedido trabado del 07/11 frenó todas las
  reparaciones hasta el 09/11, porque el vigilante no relanza nada mientras haya un pedido).
- Si una ronda terminó en "alerta" (a medias: por ejemplo, Chrome desconectado y WhatsApp sin hacer), le avisa a Santi
  con la nota; no la repite sola para no duplicar mensajes a tiendas (Santi puede pedir "ronda ahora").
- Si el git pull choca (dos computadoras cambiaron lo mismo), se recupera solo con git_seguro.py y avisa.
- Si el propio vigilante se rompe, avisa una vez por día con el error.
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
import git_seguro  # noqa: E402
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
        return ""
    return git_seguro.subir(REPO, msg, archivos)[1]


def avisar(texto):
    print("AVISO:", texto)
    if not PROBAR:
        try:
            telegram(texto)
        except Exception as e:
            print("no se pudo avisar:", e)


def pc_prendida():
    import red   # busca la PC por su MAC (el router cambia las IP tras un corte, 27/10)
    return red.pc_prendida()


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
    problema_git = "" if PROBAR else git_seguro.pull(REPO)
    t = salud.ahora()
    hoy, hora, dia = t.strftime("%Y-%m-%d"), t.strftime("%H:%M"), t.weekday()
    est = json.load(open(ESTADO)) if os.path.exists(ESTADO) else {}
    if est.get("dia") != hoy:
        est = {"dia": hoy, "hecho": [], "latido": est.get("latido", "")}
    hecho = set(est["hecho"])
    e = salud.estado_dia(hoy, hora)
    cambios, eventos = [], []
    try:
        pedido = json.load(open(PEDIDO, encoding="utf-8")) if os.path.exists(PEDIDO) else None
    except ValueError:
        pedido = {"id": "roto", "tipo": "?", "pedido": "2000-01-01 00:00"}   # archivo roto: que caduque abajo

    if problema_git and "git" not in hecho:
        hecho.add("git")
        eventos.append(("arreglo", "git de la Raspberry: " + problema_git[:150]))
        avisar("Te cuento, Santi: " + problema_git + ". No tienes que hacer nada.")

    # 0. Pedido trabado (10/11): si la sesión que lo hacía se cortó, el archivo queda y frena todas las reparaciones
    #    (abajo nada se relanza mientras haya pedido). Más de 4 h y nada trabajando: se da por perdido.
    #    bloquear_si_no_es_ronda.ps1 ya no abre Claude por un pedido de más de 3 horas.
    if pedido:
        try:
            edad = (t - datetime.strptime(pedido["pedido"], "%Y-%m-%d %H:%M").replace(tzinfo=salud.TZ)).total_seconds() / 60
        except (KeyError, ValueError, TypeError):
            edad = 9999
        ult = [s for s in salud.sesiones() if s["fecha"] == hoy and s["quien"] == "pc"][-1:]
        trabajando = bool(ult and ult[0]["estado"] == "en curso"
                          and salud.en_curso("manana" if ult[0]["inicio"] < "14:00" else "pc", hoy))
        if edad > 240 and not trabajando and "07:00" <= hora < "22:00":
            if not PROBAR:
                os.remove(PEDIDO)
            cambios.append("pedido-pc.json")
            hecho.add(f"pedido-viejo-{pedido.get('id')}")
            eventos.append(("arreglo", f"pedido a la PC sin hacer hace {int(edad)} min: dado por perdido y borrado"))
            cuanto = "estaba dañado" if pedido.get("id") == "roto" else f"lleva {int(edad // 60)} h sin hacerse"
            avisar(f"Santi, el pedido a la PC ({pedido.get('tipo')}: {str(pedido.get('motivo', ''))[:80]}) {cuanto}, "
                   "así que lo di por perdido y lo borré para que el equipo siga normal. "
                   "Si todavía lo quieres, pídelo de nuevo (por ejemplo \"ronda ahora\").")
            pedido = None
        elif edad > 150 and f"pedido-viejo-{pedido.get('id')}" not in hecho and not trabajando and "07:00" <= hora < "22:00":
            hecho.add(f"pedido-viejo-{pedido.get('id')}")
            eventos.append(("alerta", f"pedido a la PC sin hacer hace {int(edad)} min"))
            avisar(f"Santi, el pedido a la PC ({pedido.get('tipo')}: {str(pedido.get('motivo', ''))[:80]}) lleva {int(edad)} minutos "
                   "sin hacerse. Puede que Claude no se haya abierto en la PC; ¿la puedes mirar cuando llegues? "
                   "Si a las 4 horas sigue sin hacerse, lo borro para que no frene al resto.")

    # 1. Ronda de la mañana en la PC (desde el 11/11; antes la hacía la Mac y la PC la cubría)
    # (si la ronda anotó "en curso" no se toca: está trabajando, solo empezó tarde; salud lo da como "en curso")
    m = e["manana"]["estado"]
    if dia in salud.HORARIO["manana"]["dias"] and m == "pendiente":
        if "10:00" <= hora < "10:30" and "prende-manana" not in hecho:
            hecho.add("prende-manana")
            if pc_prendida() is False:
                prender_pc()
        if "10:30" <= hora < "11:00" and "reintento-manana" not in hecho and pc_prendida() is False:
            prender_pc()
            hecho.add("reintento-manana")
            eventos.append(("arreglo", "la PC no prendió a las 10:00: segundo intento"))
        if "11:00" <= hora and "pc-apagada-manana" not in hecho and pc_prendida() is False:
            hecho.add("pc-apagada-manana")
            eventos.append(("alerta", "la PC no prendió para la ronda de las 10:30"))
            avisar("Santi, ojo: intenté prender la PC dos veces para la ronda de las 10:30 y no respondió. "
                   "Puede ser la luz o el cable de red. A las 13:00 lo vuelvo a intentar.")
    if m == "no corrió" and "relanza-manana" not in hecho and not pedido:
        pedir_a_pc("ronda", "la PC no hizo la ronda de las 10:30")
        prender_pc()
        hecho.add("relanza-manana")
        cambios.append("pedido-pc.json")
        eventos.append(("arreglo", "la PC no hizo la ronda de las 10:30: relanzada"))
        avisar("Te cuento, Santi: la ronda de las 10:30 no se hizo, así que se la volví a pedir a la PC y la prendí. "
               "Cuando termine te mando el resumen; no tienes que hacer nada.")

    # 2. La PC no prendió para la ronda de las 16:00
    if dia in salud.HORARIO["pc"]["dias"] and e["pc"]["estado"] == "pendiente":   # "en curso" no entra: ya prendió
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

    # 5. Una ronda terminó a medias ("alerta"): cuenta como hecha (no se relanza sola para no repetir mensajes a
    #    tiendas), pero Santi se entera aunque el mensaje del Gerente no haya salido (10/11)
    for k, cuando in (("manana", "de las 10:30"), ("pc", "de las 16:00")):
        s = e[k].get("sesion") or {}
        if s.get("estado") == "alerta" and f"alerta-{k}-{s.get('inicio')}" not in hecho:
            hecho.add(f"alerta-{k}-{s.get('inicio')}")
            eventos.append(("alerta", f"la ronda {cuando} terminó a medias"))
            avisar(f"Santi, la ronda {cuando} terminó a medias: {s.get('nota', '')[:220]}. No la repito sola para no "
                   "escribirle dos veces a las tiendas; si quieres que la rehaga, escríbeme \"ronda ahora\".")

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


def main_seguro():
    """Si el vigilante se rompe (un archivo mal escrito, un cambio de código), avisa una vez por día en vez de
    callarse para siempre (10/11)."""
    try:
        main()
    except Exception as ex:
        import traceback
        traceback.print_exc()
        marca = os.path.expanduser("~/.cargo-vigilante-error")
        hoy = salud.ahora().strftime("%Y-%m-%d")
        if PROBAR or (os.path.exists(marca) and open(marca).read().strip() == hoy):
            return
        open(marca, "w").write(hoy)
        avisar(f"Santi, el vigilante de la Raspberry se rompió y hoy no está revisando al equipo: {type(ex).__name__}: "
               f"{str(ex)[:150]}. Pásale este mensaje a Claude en la PC para que lo arregle.")


if __name__ == "__main__":
    main_seguro()
