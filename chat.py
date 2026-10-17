#!/usr/bin/env python3
"""Chat interno del equipo: los agentes le escriben al Gerente (y él a ellos), sin gastar IA en el transporte.

    python3 chat.py escribir <de> <para> "texto" [--ref 2026-10-18-3]   # agrega un mensaje
    python3 chat.py leer <agente>              # mensajes nuevos para ese agente (y los marca leídos)
    python3 chat.py ver [<agente>] [--json]    # últimos mensajes, sin marcar nada
    python3 chat.py pendientes [--json]        # lo que espera respuesta del Gerente o de Santi

`chat.csv` (id, fecha, hora, de, para, texto, ref, estado nuevo|leido|respondido, respuesta_a).
Quién es quién: santi, gerente y los agentes (nube, ebay, wa, mkt, ana, pedidos, fin, dem, local; Catálogos firma como mkt y Oficina como local).
Flujo: un agente escribe al Gerente → la Raspberry (sin IA, cada 15 min) se lo pasa a Santi por Telegram si es para él →
Santi contesta "chat pedidos: ..." → queda en el chat → el agente lo lee al empezar su próximo turno (`chat.py leer pedidos`).
El repo y la oficina son públicos: solo cosas de trabajo; nunca guías, teléfonos, direcciones ni nombres de personas.
"""
import csv
import json
import os
import sys
from datetime import datetime

DIR = os.path.dirname(os.path.abspath(__file__))
RUTA = os.path.join(DIR, "chat.csv")
CAMPOS = ["id", "fecha", "hora", "de", "para", "texto", "ref", "estado", "respuesta_a"]
QUIENES = ("santi", "gerente", "nube", "ebay", "wa", "mkt", "ana", "pedidos", "fin", "dem", "local")


def ahora():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/La_Paz"))
    except Exception:
        return datetime.now()


def leer_todo():
    if not os.path.exists(RUTA):
        return []
    with open(RUTA, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def guardar_todo(filas):
    with open(RUTA, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, CAMPOS, lineterminator="\n", extrasaction="ignore")
        w.writeheader()
        w.writerows(filas)


def escribir(de, para, texto, ref="", respuesta_a=""):
    de, para = de.lower(), para.lower()
    if de not in QUIENES or para not in QUIENES:
        raise ValueError(f"de/para tiene que ser uno de: {', '.join(QUIENES)}")
    filas = leer_todo()
    t = ahora()
    n = 1 + max([int(f["id"].rsplit("-", 1)[-1]) for f in filas if f.get("id", "").startswith(t.strftime("%Y%m%d"))] or [0])
    fila = {"id": f"{t:%Y%m%d}-{n}", "fecha": t.strftime("%Y-%m-%d"), "hora": t.strftime("%H:%M"), "de": de, "para": para,
            "texto": " ".join(texto.split()), "ref": ref, "estado": "nuevo", "respuesta_a": respuesta_a}
    if respuesta_a:
        for f in filas:
            if f["id"] == respuesta_a:
                f["estado"] = "respondido"
    filas.append(fila)
    guardar_todo(filas)
    return fila


def leer(agente, marcar=True):
    filas = leer_todo()
    nuevos = [f for f in filas if f["para"] == agente and f["estado"] == "nuevo"]
    if marcar and nuevos:
        ids = {f["id"] for f in nuevos}
        for f in filas:
            if f["id"] in ids:
                f["estado"] = "leido"
        guardar_todo(filas)
    return nuevos


def pendientes():
    """Mensajes para el Gerente o Santi que nadie respondió todavía."""
    return [f for f in leer_todo() if f["para"] in ("gerente", "santi") and f["estado"] != "respondido"]


def main():
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    como_json = "--json" in sys.argv
    ref = sys.argv[sys.argv.index("--ref") + 1] if "--ref" in sys.argv else ""
    if ref in a:
        a.remove(ref)
    if not a:
        sys.exit(__doc__)
    if a[0] == "escribir" and len(a) >= 4:
        f = escribir(a[1], a[2], " ".join(a[3:]), ref)
        print(f"Mensaje {f['id']} de {f['de']} para {f['para']}.")
    elif a[0] == "leer" and len(a) == 2:
        nuevos = leer(a[1].lower())
        if como_json:
            print(json.dumps(nuevos, ensure_ascii=False, indent=1))
        else:
            print("\n".join(f"[{f['id']}] {f['fecha']} {f['hora']} de {f['de']}: {f['texto']}" for f in nuevos) or "Sin mensajes nuevos.")
    elif a[0] == "ver":
        filas = leer_todo()
        if len(a) > 1:
            filas = [f for f in filas if a[1] in (f["de"], f["para"])]
        filas = filas[-30:]
        print(json.dumps(filas, ensure_ascii=False, indent=1) if como_json else
              "\n".join(f"[{f['id']}] {f['fecha']} {f['hora']} {f['de']} → {f['para']} ({f['estado']}): {f['texto']}" for f in filas) or "Chat vacío.")
    elif a[0] == "pendientes":
        p = pendientes()
        print(json.dumps(p, ensure_ascii=False, indent=1) if como_json else
              "\n".join(f"[{f['id']}] {f['de']} → {f['para']}: {f['texto']}" for f in p) or "Nada pendiente.")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
