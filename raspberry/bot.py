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
AGENTES = ("nube", "ebay", "wa", "mkt", "ana", "pedidos", "fin", "dem", "gerente", "local")
NOMBRES = {"nube": "la Nube", "ebay": "el Rastreador eBay", "wa": "WhatsApp", "mkt": "Marketplace", "ana": "el Analista",
           "pedidos": "Pedidos", "gerente": "el Gerente", "local": "la ronda local"}
DIAS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
AYUDA = ("Háblame como a tu gerente: \"hola, ¿cómo vamos?\", \"¿qué conviene traer?\", \"dile a WhatsApp que...\". "
         "Recuerdo la charla del día.\nAtajos al instante y sin gastar el plan: apruebo 1 3 · rechazo 2 · sí a todo · plan · "
         "necesidades · resuelta 2 · tarea: <texto> · venta: 2 Ryzen 5 7600 a 2800 · modelo haiku|sonnet|opus · uso · nueva charla.")

cargar("~/.cargo-bot", ("CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_MODELO", "MAX_PREGUNTAS_DIA", "AVISOS"))
TOKEN, CHAT = cargar("~/.telegram", ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"))
MAX_DIA = int(os.environ.get("MAX_PREGUNTAS_DIA", "20"))
# Horas en que el Gerente le escribe solo a Santi (el informe de las 20:00 ya lo manda la rutina de la nube). "" = nunca.
AVISOS = [h.strip() for h in os.environ.get("AVISOS", "08:20,13:30").split(",") if h.strip()]


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


ARRANQUE = os.path.getmtime(os.path.abspath(__file__))  # si un git pull trae un bot.py nuevo, el bot se reinicia solo


def git(*args):
    return subprocess.run(["git", "-C", REPO, *args], capture_output=True, text=True, timeout=120)


def actualizar_repo():
    git("pull", "--no-rebase", "--no-edit", "-q")


def subir(mensaje):
    git("add", "plan.csv", "actividad.csv", "necesidades.csv")
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
    aviso = " La hacen solos en la próxima ronda y te enteras por el resumen." if agente in ("wa", "mkt", "dem", "fin", "local") else ""
    return f"Anotada la tarea {hoy}-{n} para {agente}, aprobada.{aviso}" + ("" if ok else " (no pude subirla a GitHub todavía)")


def producto_de(texto):
    """El producto de vigilar.csv que coincide con lo que escribió Santi: deben estar todos sus números de modelo
    (7600, 2tb, 12400f, ddr5, 6000...) y gana el que comparte más palabras."""
    _, vig = leer_csv("vigilar.csv")
    tok = lambda x: set(re.findall(r"[a-z0-9]+", simple(x).replace("-", " ")))
    u = tok(texto)
    modelo = {w for w in u if re.search(r"\d", w) and len(w) >= 3}
    mejor = None
    for v in vig:
        pt = tok(v["producto"])
        if not modelo or not modelo <= pt:
            continue
        clave = (len(u & pt), -len(pt))
        if mejor is None or clave > mejor[0]:
            mejor = (clave, v["producto"])
    return mejor[1] if mejor else None

def cmd_venta(texto):
    """venta: 2 Ryzen 5 7600 a 2800  (precio por unidad; 'total' divide por la cantidad)."""
    m = re.match(r"\s*(\d+)?\s*(?:x|u|unidades?)?\s*(.+?)\s+(?:a|por|en)\s+(?:bs\.?\s*)?([\d.,]+)\s*(bs)?\s*(total)?\s*$", texto, re.I)
    if not m:
        return "No entendí la venta. Escríbela así: venta: 2 Ryzen 5 7600 a 2800 (precio por unidad en Bs; agrega 'total' si es el total)."
    cant = int(m.group(1) or 1)
    precio = float(m.group(3).replace(".", "").replace(",", ".")) if re.search(r"\.\d{3}$", m.group(3)) else float(m.group(3).replace(",", "."))
    if m.group(5):
        precio = precio / cant
    prod = producto_de(m.group(2))
    if not prod:
        return f"No encontré '{m.group(2).strip()}' en vigilar.csv. Escribe el modelo como en la tabla (ej.: Ryzen 5 7600, SSD NVMe 2TB)."
    actualizar_repo()
    campos, filas = leer_csv("ventas.csv")
    hoy = ahora().strftime("%Y-%m-%d")
    filas.append({c: "" for c in campos} | {"fecha": hoy, "producto": prod, "cantidad": str(cant), "precio_bs": f"{precio:.2f}", "canal": "telegram"})
    escribir_csv("ventas.csv", campos, filas)
    anotar_actividad(f"Telegram (Raspberry): venta anotada: {cant} × {prod} a Bs {precio:,.0f}")
    ok = subir("Ventas: venta anotada por Santi en Telegram (Raspberry)")
    return (f"Anotada la venta: {cant} × {prod} a Bs {precio:,.0f} c/u (total Bs {precio * cant:,.0f}). Finanzas calcula la ganancia real en la próxima ronda."
            + ("" if ok else " (no pude subirla a GitHub todavía)"))


def necesidades_abiertas():
    try:
        campos, filas = leer_csv("necesidades.csv")
    except FileNotFoundError:
        return None, [], []
    return campos, filas, [f for f in filas if f.get("estado", "abierta") != "resuelta"]


def informe_necesidades(breve=False):
    r = subprocess.run([sys.executable, os.path.join(REPO, "necesidades.py")] + (["--breve"] if breve else []),
                       capture_output=True, text=True, timeout=60)
    return (r.stdout or "").strip() or "No pude revisar las necesidades del equipo."


def cmd_necesidades():
    actualizar_repo()
    _, _, abiertas = necesidades_abiertas()
    pedidas = "\n".join(f"{i}. {f['necesita']} ({f['agente']})" for i, f in enumerate(abiertas, 1))
    resto = informe_necesidades()
    msg = "Lo que el equipo necesita ahora:\n" + resto
    if pedidas:
        msg += "\n\nPedidos de los agentes, por número:\n" + pedidas + "\nCuando lo resuelvas escríbeme: resuelta 2"
    return msg


def cmd_resuelta(nums):
    actualizar_repo()
    campos, filas, abiertas = necesidades_abiertas()
    hechas = []
    for i, f in enumerate(abiertas, 1):
        if str(i) in nums:
            f["estado"], f["resuelto"] = "resuelta", ahora().strftime("%Y-%m-%d %H:%M")
            hechas.append(f["necesita"])
    if not hechas:
        return "No encontré esa necesidad. Escribe 'necesidades' para ver los números."
    escribir_csv("necesidades.csv", campos, filas)
    anotar_actividad(f"Telegram (Raspberry): Santi resolvió {len(hechas)} necesidad(es) del equipo")
    subir("Necesidades: resueltas por Santi (Raspberry)")
    return "Genial, anotado como resuelto: " + "; ".join(hechas)


def avisar_necesidades_nuevas(estado):
    """Avisa a Santi (sin IA) cuando un agente anota algo que necesita."""
    _, _, abiertas = necesidades_abiertas()
    vistas = set(estado.get("necesidades_vistas", []))
    nuevas = [f for f in abiertas if f"{f['fecha']}|{f['agente']}|{f['necesita']}" not in vistas]
    if not nuevas:
        return
    if estado.get("necesidades_vistas") is not None:  # la primera vez solo las registra, para no avisar lo viejo
        for f in nuevas:
            quien = NOMBRES.get(f["agente"], f["agente"])
            responder(f"Santi, {quien} necesita algo: {f['necesita']}" + (f", para {f['para_que']}." if f.get("para_que") else ".")
                      + " Escribe 'necesidades' para ver todo.")
    estado["necesidades_vistas"] = sorted(vistas | {f"{f['fecha']}|{f['agente']}|{f['necesita']}" for f in abiertas})


PERSONA = """Eres el Gerente de Cargo Brothers, la empresa de Santi que importa componentes de PC (procesadores, RAM, SSD)
de EE.UU. a Cochabamba. Diriges a un equipo de agentes: la Nube (revisión de las 7:52 con el dólar y eBay), el Rastreador eBay,
WhatsApp (habla con las tiendas), Marketplace, el Analista (comparación y ganancia), Pedidos (rastrea envíos),
Finanzas e inventario (finanzas.py: invertido, stock, ventas y ganancia real) y el Analista de demanda (demanda.py: qué se mueve en Cochabamba).
Hablas con Santi por Telegram como su socio y gerente de confianza, NO como un bot ni un sistema que reporta.
Tu personaje está en CLAUDE.md ("Personalidad del Gerente"): un gerente profesional con experiencia en importación, que
conoce el mercado de Cochabamba. Tono formal y respetuoso pero cercano y natural, nunca robótico. Tienes criterio y lo dices
con el dato que lo respalda; hablas como socio ("nosotros", "te propongo", "¿qué te parece?"); reconoces lo bueno y señalas
lo que preocupa, con mesura; mencionas a los agentes como parte del equipo. Español claro y correcto, sin jerga ni modismos
forzados, frases cortas, de 1 a 8 líneas según lo que te pregunten (si escribe corto, contesta corto), sin emojis o uno muy
ocasional. Nunca suenes a plantilla: varía cómo empiezas; nada de markdown, títulos, viñetas, "Resumen:" ni "Estado:".
Retoma lo que hablaron hoy y consulta a Santi lo que es decisión suya. Las decisiones son de Santi.

Lo que sabes sale de este repo; lee solo lo que necesites: actividad.csv (qué hizo cada agente), informes/ (el último),
comparacion.md (ganancia por producto), plan.csv (tareas), tiendas-cochabamba.csv y mensajes.csv (contacto con tiendas),
precios-cochabamba.csv, precios-eeuu.csv, tipo-cambio.csv, pedidos.csv, ventas.csv, demanda.csv, ideas.csv (ideas de los agentes;
Santi las aprueba en la oficina con el botón Necesidades e ideas), clientes-potenciales.csv (tiendas por grupo; por ahora no se
ofrece nada) y catalogos.csv (catálogos y listas de precios que mandan las tiendas: los agentes los bajan y leen solos desde el
15/10; los archivos están en oficina/catalogos/ y se pueden leer). Las reglas están en CLAUDE.md.
Nunca inventes cifras ni hechos: si no está en los archivos, dilo. La ganancia de la tabla es potencial hasta que haya ventas.
Como buen gerente, estás atento a lo que le falta al equipo para trabajar (información, decisiones o acciones de Santi):
al inicio de cada mensaje te paso la lista actual de necesidades. Cuéntaselas a Santi cuando vengan al caso o sean
importantes, explicando qué se destraba si las resuelve, sin repetir la lista entera en cada mensaje.
No modificas archivos tú mismo. Para que algo pase, al final de tu mensaje agrega UNA línea por acción, exactamente así:
ACCION: aprobar 1 3          (tareas propuestas de plan.csv, por su número final)
ACCION: rechazar 2
ACCION: tarea <agente>: <qué hacer>   (agente: wa, mkt, ebay, pedidos, ana, fin, dem o local)
ACCION: resuelta 2           (Santi dice que ya resolvió la necesidad número 2 de los pedidos de los agentes)
Usa ACCION solo si Santi lo pidió o aceptó claramente en esta conversación; si dudas, pregúntale primero.
Desde el 13/10 WhatsApp y Marketplace escriben solos a las tiendas (Santi lo autorizó): no hace falta pedirle el texto.
Comprar, pagar, ofertar o dar datos personales nunca: eso
se confirma en una sesión con Santi, no por chat.
"""

INICIO = "Fecha y hora en Bolivia: {fecha}. "


def claude(texto, estado, nueva=False):
    """Una vuelta de conversación con Claude Code. La memoria dura el día: cada mañana empieza una charla nueva."""
    hoy = ahora().strftime("%Y-%m-%d")
    uso = estado.get("uso", {})
    if uso.get("dia") != hoy:
        uso = {"dia": hoy, "n": 0}
    if uso["n"] >= MAX_DIA:
        return f"Santi, por hoy ya hablamos {uso['n']} veces y llegué al tope que pusimos ({MAX_DIA}) para cuidar tu plan Pro. Las aprobaciones y 'plan' siguen funcionando; mañana seguimos."
    modelo = estado.get("modelo") or os.environ.get("CLAUDE_MODELO", "sonnet")
    sesion = estado.get("sesion", {})
    seguir = not nueva and sesion.get("dia") == hoy and sesion.get("id")
    escribiendo()
    actualizar_repo()
    _, _, abiertas = necesidades_abiertas()
    pedidas = "; ".join(f"{i}. {f['necesita']} ({f['agente']})" for i, f in enumerate(abiertas, 1)) or "ninguno"
    mensaje = (INICIO.format(fecha=DIAS[ahora().weekday()] + ahora().strftime(" %d/%m/%Y %H:%M"))
               + f"Pedidos abiertos de los agentes: {pedidas}.\nNecesidades del equipo:\n{informe_necesidades(breve=True)}\n\n"
               + "Mensaje: " + texto)
    cmd = ["claude", "-p", mensaje, "--model", modelo, "--allowedTools", "Read,Grep,Glob", "--output-format", "json"]
    cmd += ["--resume", sesion["id"]] if seguir else ["--append-system-prompt", PERSONA]
    try:
        r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return "Perdón Santi, me colgué pensando (más de 5 minutos). ¿Me lo repites más corto?"
    except FileNotFoundError:
        return "No encuentro Claude Code en la Raspberry. Revisa la instalación (raspberry/LEEME.md)."
    try:
        datos = json.loads(r.stdout)
    except Exception:
        datos = {}
    salida = (datos.get("result") or "").strip()
    if r.returncode != 0 or not salida or datos.get("is_error"):
        if seguir:  # la charla del día se rompió: empieza una nueva
            estado.pop("sesion", None)
        error = salida or ((r.stderr or "").strip().splitlines()[-1:] or ["sin detalle"])[0]
        return f"No pude responderte ({error[:200]}). Si dice que llegaste al límite del plan, espera unas horas."
    uso["n"] += 1
    estado["uso"] = uso
    if datos.get("session_id"):
        estado["sesion"] = {"dia": hoy, "id": datos["session_id"]}
    return ejecutar_acciones(salida)


def ejecutar_acciones(salida):
    """Saca las líneas ACCION: del mensaje del Gerente y las hace."""
    texto, hechos = [], []
    for linea in salida.splitlines():
        m = re.match(r"\s*ACCION:\s*(.+)", linea)
        if not m:
            texto.append(linea)
            continue
        orden = m.group(1).strip()
        t = re.match(r"tarea\s+(\w+)\s*:\s*(.+)", orden, re.I)
        a = re.match(r"(aprobar|rechazar)\s+([\d ,y]+)", simple(orden))
        res = re.match(r"resuelta\s+([\d ,y]+)", simple(orden))
        if res:
            hechos.append(cmd_resuelta(set(re.findall(r"\d+", res.group(1)))))
        elif t and t.group(1).lower() in AGENTES:
            hechos.append(cmd_tarea(t.group(1).lower(), t.group(2)))
        elif a:
            nums = set(re.findall(r"\d+", a.group(2)))
            hechos.append(cmd_decision((nums, set(), False, False) if a.group(1) == "aprobar" else (set(), nums, False, False)))
    msg = "\n".join(texto).strip()
    return msg + ("\n\n✔ " + "\n✔ ".join(hechos) if hechos else "")


def resumen_programado(cuando, estado):
    return claude(f"Es tu mensaje de {cuando} para Santi; él no te escribió. Revisa actividad.csv, el último informe y "
                  "mensajes.csv y cuéntale en 2 a 6 líneas, con tu personalidad, cómo va el equipo hoy: arranca con lo que más te llamó la atención "
                  "(bueno o malo), da tu opinión y dile qué le falta al equipo para avanzar. No empieces igual que tu mensaje anterior. "
                  "Si no hay nada nuevo desde tu último mensaje, dilo en una línea, a tu manera. No uses ACCION en este mensaje.",
                  estado)


def atender(texto, estado):
    t = simple(texto)
    if t in ("ayuda", "/start", "/ayuda", "help", "?"):
        return AYUDA
    if t in ("necesidades", "/necesidades", "que necesitan", "que falta", "que le falta al equipo"):
        return cmd_necesidades()
    m = re.fullmatch(r"resuelta\s+([\d ,y]+)", t)
    if m:
        return cmd_resuelta(set(re.findall(r"\d+", m.group(1))))
    if t in ("plan", "/plan", "tareas"):
        return cmd_plan()
    if t in ("uso", "/uso"):
        u = estado.get("uso", {})
        n = u.get("n", 0) if u.get("dia") == ahora().strftime("%Y-%m-%d") else 0
        return f"Hoy van {n} de {MAX_DIA} preguntas a Claude, con el modelo {estado.get('modelo') or os.environ.get('CLAUDE_MODELO', 'sonnet')}."
    if t in ("nueva charla", "/nueva", "olvida todo"):
        estado.pop("sesion", None)
        return "Listo, empezamos de cero. ¿En qué te ayudo?"
    m = re.fullmatch(r"/?modelo\s+(\w+)", t)
    if m:
        if m.group(1) not in MODELOS:
            return "Modelos: haiku (gasta muy poco), sonnet (intermedio) u opus (el mejor, gasta más)."
        estado["modelo"] = m.group(1)
        return f"Listo: las preguntas van con {m.group(1)}."
    m = re.match(r"(?:venta|vend[ií])\s*:?\s*(.+)", texto.strip(), re.I | re.S)
    if m:
        return cmd_venta(m.group(1))
    m = re.match(r"tarea\s*(\w+)?\s*:\s*(.+)", texto.strip(), re.I | re.S)
    if m:
        agente = (m.group(1) or "local").lower()
        if agente not in AGENTES:
            return f"No conozco al agente '{agente}'. Usa: {', '.join(AGENTES)}."
        return cmd_tarea(agente, m.group(2))
    d = decidir(t)
    if d:
        return cmd_decision(d)
    return claude(texto, estado)


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
        if time.time() - estado.get("ultima_revision", 0) > 900:  # cada 15 min
            estado["ultima_revision"] = time.time()
            try:
                actualizar_repo()
                avisar_necesidades_nuevas(estado)
            except Exception as e:
                print(f"revisión de necesidades: {e!r}", flush=True)
            guardar_estado(estado)
            if os.path.getmtime(os.path.abspath(__file__)) != ARRANQUE:
                print("bot.py cambió con el git pull: me reinicio para usar la versión nueva", flush=True)
                os.execv(sys.executable, [sys.executable, *sys.argv])
        hora, hoy = ahora().strftime("%H:%M"), ahora().strftime("%Y-%m-%d")
        hechos = estado.get("avisos", {}) if estado.get("avisos", {}).get("dia") == hoy else {"dia": hoy, "horas": []}
        for h in AVISOS:
            if h <= hora and h not in hechos["horas"] and hora < f"{int(h[:2]) + 2:02d}{h[2:]}":
                hechos["horas"].append(h)
                estado["avisos"] = hechos
                guardar_estado(estado)
                responder(resumen_programado("la mañana" if h < "12:00" else "la tarde", estado))
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
