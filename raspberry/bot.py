#!/usr/bin/env python3
"""Bot de Telegram del Gerente de Cargo Brothers, para la Raspberry Pi (siempre prendida).

Responde al momento a Santi. Lo simple lo resuelve solo, sin IA y sin gastar el plan Pro:
    apruebo 1 3 · rechazo 2 · sí a todo · no a todo   -> marca las tareas propuestas en plan.csv
    plan                                               -> lista las tareas propuestas
    tarea: <texto>  /  tarea wa: <texto>              -> agrega una tarea aprobada por Santi
    modelo haiku | sonnet | opus                       -> cambia el modelo de las preguntas
    uso                                                -> cuántas preguntas a Claude van hoy
    ayuda
Cualquier otro mensaje es una pregunta: solo ahí llama a Claude Code (plan Pro), en modo solo lectura.

Claves (nunca en el repo): ~/.telegram (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) y ~/.cargo-bot
(CLAUDE_CODE_OAUTH_TOKEN de `claude setup-token`, opcional CLAUDE_MODELO y MAX_PREGUNTAS_DIA).
El texto de Santi no se guarda en el repo: solo la decisión en plan.csv y una línea en actividad.csv.
"""
import csv
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO)
from notificar import cargar, pedir  # noqa: E402

TZ = ZoneInfo("America/La_Paz")
ESTADO = os.path.expanduser("~/.cargo-bot-estado.json")  # fuera del repo
MODELOS = ("haiku", "sonnet", "opus")
AGENTES = ("nube", "ebay", "wa", "mkt", "ana", "pedidos", "gerente", "local")
AYUDA = ("Comandos: apruebo 1 3 · rechazo 2 · sí a todo · no a todo · plan · "
         "tarea: <texto> (o tarea wa: / tarea mkt:) · modelo haiku|sonnet|opus · uso.\n"
         "Cualquier otra cosa es una pregunta y la contesto con Claude (solo lectura).")

cargar("~/.cargo-bot", ("CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_MODELO", "MAX_PREGUNTAS_DIA"))
TOKEN, CHAT = cargar("~/.telegram", ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"))
MAX_DIA = int(os.environ.get("MAX_PREGUNTAS_DIA", "15"))


def ahora():
    return datetime.now(TZ)


def leer_estado():
    try:
        return json.load(open(ESTADO))
    except Exception:
        return {}


def guardar_estado(e):
    json.dump(e, open(ESTADO, "w"))


def responder(texto):
    try:
        pedir(f"https://api.telegram.org/bot{TOKEN}/sendMessage",
              {"chat_id": CHAT, "text": texto[:4000], "disable_web_page_preview": "true"})
    except Exception as e:  # sin la URL: lleva el token
        print(f"no se pudo responder ({type(e).__name__})", flush=True)


def escribiendo():
    try:
        pedir(f"https://api.telegram.org/bot{TOKEN}/sendChatAction", {"chat_id": CHAT, "action": "typing"})
    except Exception:
        pass


def git(*args):
    return subprocess.run(["git", "-C", REPO, *args], capture_output=True, text=True, timeout=120)


def actualizar_repo():
    git("pull", "--no-rebase", "--no-edit", "-q")


def subir(mensaje):
    git("add", "plan.csv", "actividad.csv")
    if git("diff", "--cached", "--quiet").returncode == 0:
        return True
    git("commit", "-q", "-m", mensaje)
    for _ in range(3):
        if git("push", "-q").returncode == 0:
            return True
        git("pull", "--no-rebase", "--no-edit", "-q")
    return False


def leer_csv(nombre):
    with open(os.path.join(REPO, nombre), encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        return r.fieldnames, list(r)


def escribir_csv(nombre, campos, filas):
    with open(os.path.join(REPO, nombre), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos, lineterminator="\n")
        w.writeheader()
        w.writerows(filas)


def anotar_actividad(texto):
    with open(os.path.join(REPO, "actividad.csv"), "a", encoding="utf-8", newline="") as f:
        t = ahora()
        csv.writer(f, lineterminator="\n").writerow([t.strftime("%Y-%m-%d"), t.strftime("%H:%M"), "gerente", texto])


def propuestas(filas):
    """Las tareas propuestas más recientes (el número es el final del id: AAAA-MM-DD-N)."""
    abiertas = [f for f in filas if f.get("estado") == "propuesto"]
    if not abiertas:
        return {}
    ultima = max(f["fecha_para"] for f in abiertas)
    return {f["id"].rsplit("-", 1)[-1]: f for f in abiertas if f["fecha_para"] == ultima}


def simple(texto):
    t = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn").strip()


def decidir(t):
    """Devuelve (aprobar, rechazar, todo_aprobar, todo_rechazar) o None si no es una decisión."""
    if re.fullmatch(r"(si|apruebo|aprobado) a? ?todo\.?", t) or t in ("apruebo todo", "si a todo"):
        return set(), set(), True, False
    if re.fullmatch(r"(no|rechazo) a? ?todo\.?", t):
        return set(), set(), False, True
    ap, re_ = set(), set()
    for verbo, nums in re.findall(r"(apruebo|aprueba|si a la|si a|rechazo|rechaza|no a la|no a)\s+([\d ,y]+)", t):
        destino = ap if verbo.startswith(("apr", "si")) else re_
        destino.update(re.findall(r"\d+", nums))
    if ap or re_:
        return ap, re_, False, False
    return None


def cmd_decision(d):
    actualizar_repo()
    campos, filas = leer_csv("plan.csv")
    abiertas = propuestas(filas)
    if not abiertas:
        return "No hay tareas propuestas pendientes en plan.csv."
    ap, rech, todo_si, todo_no = d
    if todo_si:
        ap = set(abiertas)
    if todo_no:
        rech = set(abiertas)
    sello = "Telegram " + ahora().strftime("%d/%m %H:%M")
    hechas, faltan = [], sorted((ap | rech) - set(abiertas))
    for n, f in abiertas.items():
        if n in ap or n in rech:
            f["estado"] = "aprobado" if n in ap else "rechazado"
            f["decision"] = sello
            hechas.append(f"{n} {f['estado']}")
    if not hechas:
        return f"No encontré esas tareas. Las propuestas son: {', '.join(sorted(abiertas))}. Escribe 'plan' para verlas."
    escribir_csv("plan.csv", campos, filas)
    anotar_actividad(f"Telegram (Raspberry): {', '.join(hechas)}")
    ok = subir("Plan: decisiones de Santi por Telegram (Raspberry)")
    msg = "Anotado: " + ", ".join(hechas) + "."
    if faltan:
        msg += f" No existen: {', '.join(faltan)}."
    return msg + ("" if ok else " Ojo: no pude subirlo a GitHub; lo reintento en el próximo cambio.")


def cmd_plan():
    actualizar_repo()
    _, filas = leer_csv("plan.csv")
    abiertas = propuestas(filas)
    if not abiertas:
        return "No hay tareas propuestas pendientes."
    fecha = next(iter(abiertas.values()))["fecha_para"]
    lineas = [f"{n}. {f['agente']}: {f['tarea']}" for n, f in sorted(abiertas.items(), key=lambda x: int(x[0]))]
    return f"Plan propuesto para {fecha}:\n" + "\n".join(lineas) + "\n\nResponde: apruebo 1 3 / rechazo 2 / sí a todo"


def cmd_tarea(agente, texto):
    actualizar_repo()
    campos, filas = leer_csv("plan.csv")
    hoy = ahora().strftime("%Y-%m-%d")
    n = 1 + max([int(f["id"].rsplit("-", 1)[-1]) for f in filas if f["id"].startswith(hoy)] or [0])
    filas.append({c: "" for c in campos} | {
        "id": f"{hoy}-{n}", "fecha_para": hoy, "agente": agente, "tarea": texto.strip(),
        "motivo": "instrucción de Santi por Telegram", "estado": "aprobado", "propuesto_por": "santi",
        "fecha_propuesta": hoy, "decision": "Telegram " + ahora().strftime("%d/%m %H:%M")})
    escribir_csv("plan.csv", campos, filas)
    anotar_actividad(f"Telegram (Raspberry): tarea nueva de Santi {hoy}-{n} para {agente}")
    ok = subir("Plan: tarea nueva de Santi por Telegram (Raspberry)")
    aviso = " Si es un mensaje nuevo a una tienda, igual te muestran el texto antes de mandarlo." if agente in ("wa", "mkt", "local") else ""
    return f"Anotada la tarea {hoy}-{n} para {agente}, aprobada.{aviso}" + ("" if ok else " (no pude subirla a GitHub todavía)")


PROMPT = """Eres el Gerente de Cargo Brothers (importación de componentes de PC de EE.UU. a Cochabamba).
Santi te escribió por Telegram. Contéstale en español, claro y en máximo 8 líneas, sin formato markdown.
Usa solo los datos de este repo y lee solo lo necesario: comparacion.md (precios y ganancia por producto), el último archivo de informes/,
plan.csv, tiendas-cochabamba.csv, precios-cochabamba.csv, precios-eeuu.csv, tipo-cambio.csv, pedidos.csv, actividad.csv, mensajes.csv;
las reglas están en CLAUDE.md. Nunca inventes cifras: si no está en los archivos, dilo. La ganancia de la tabla es potencial, no real.
No modifiques archivos. Si Santi pide hacer algo (escribir a una tienda, buscar algo, comprar), no lo hagas: dile que lo mande como
"tarea: ..." para que quede aprobado; comprar, pagar u ofertar nunca se hace por Telegram.

Mensaje de Santi:
"""


def cmd_pregunta(texto, estado):
    hoy = ahora().strftime("%Y-%m-%d")
    uso = estado.get("uso", {})
    if uso.get("dia") != hoy:
        uso = {"dia": hoy, "n": 0}
    if uso["n"] >= MAX_DIA:
        return f"Ya van {uso['n']} preguntas hoy (límite {MAX_DIA}, para cuidar tu plan Pro). Mañana sigo, o sube MAX_PREGUNTAS_DIA en ~/.cargo-bot."
    modelo = estado.get("modelo") or os.environ.get("CLAUDE_MODELO", "haiku")
    escribiendo()
    actualizar_repo()
    try:
        r = subprocess.run(["claude", "-p", PROMPT + texto, "--model", modelo, "--allowedTools", "Read,Grep,Glob",
                            "--output-format", "text"], cwd=REPO, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return "Claude tardó demasiado (más de 5 minutos). Prueba de nuevo o con una pregunta más corta."
    except FileNotFoundError:
        return "No encuentro Claude Code en la Raspberry. Revisa la instalación (raspberry/LEEME.md)."
    uso["n"] += 1
    estado["uso"] = uso
    salida = (r.stdout or "").strip()
    if r.returncode != 0 or not salida:
        error = (r.stderr or "").strip().splitlines()[-1:] or ["sin detalle"]
        return f"Claude no pudo responder ({error[0][:200]}). Si dice que llegaste al límite del plan, espera unas horas."
    return salida + f"\n\n— {modelo} · pregunta {uso['n']}/{MAX_DIA} de hoy"


def atender(texto, estado):
    t = simple(texto)
    if t in ("ayuda", "/start", "/ayuda", "help", "?"):
        return AYUDA
    if t in ("plan", "/plan", "tareas"):
        return cmd_plan()
    if t in ("uso", "/uso"):
        u = estado.get("uso", {})
        n = u.get("n", 0) if u.get("dia") == ahora().strftime("%Y-%m-%d") else 0
        return f"Hoy van {n} de {MAX_DIA} preguntas a Claude, con el modelo {estado.get('modelo') or os.environ.get('CLAUDE_MODELO', 'haiku')}."
    m = re.fullmatch(r"/?modelo\s+(\w+)", t)
    if m:
        if m.group(1) not in MODELOS:
            return "Modelos: haiku (gasta muy poco), sonnet (intermedio) u opus (el mejor, gasta más)."
        estado["modelo"] = m.group(1)
        return f"Listo: las preguntas van con {m.group(1)}."
    m = re.match(r"tarea\s*(\w+)?\s*:\s*(.+)", texto.strip(), re.I | re.S)
    if m:
        agente = (m.group(1) or "local").lower()
        if agente not in AGENTES:
            return f"No conozco al agente '{agente}'. Usa: {', '.join(AGENTES)}."
        return cmd_tarea(agente, m.group(2))
    d = decidir(t)
    if d:
        return cmd_decision(d)
    return cmd_pregunta(texto, estado)


def main():
    if not TOKEN or not CHAT:
        sys.exit("Faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID en ~/.telegram")
    estado = leer_estado()
    print("Bot de Cargo Brothers escuchando Telegram", flush=True)
    while True:
        try:
            _, cuerpo = pedir(f"https://api.telegram.org/bot{TOKEN}/getUpdates?offset={estado.get('offset', 0)}&timeout=50")
            updates = json.loads(cuerpo).get("result", [])
        except Exception as e:  # incluye el 409 si otra sesión lee Telegram al mismo tiempo
            print(f"Telegram no respondió ({type(e).__name__}); reintento en 15 s", flush=True)
            time.sleep(15)
            continue
        for u in updates:
            estado["offset"] = u["update_id"] + 1
            m = u.get("message") or {}
            if str(m.get("chat", {}).get("id")) != str(CHAT) or not m.get("text"):
                continue
            try:
                respuesta = atender(m["text"], estado)
            except Exception as e:
                respuesta = f"Algo falló en la Raspberry ({type(e).__name__}). Lo veo en el próximo mensaje."
                print(f"error: {e!r}", flush=True)
            responder(respuesta)
            guardar_estado(estado)
        guardar_estado(estado)


if __name__ == "__main__":
    main()
