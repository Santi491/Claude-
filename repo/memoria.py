#!/usr/bin/env python3
"""Memoria del Gerente: una sola libreta para el Gerente de Telegram (Raspberry), el de fin de ronda y el de las 20:00.

    python3 memoria.py anotar <fuente> <tipo> "resumen" [--vence AAAA-MM-DD]   # fuente: telegram | ronda | 2000
    python3 memoria.py cumplir <id> ["cómo se cumplió"]                         # la cierra
    python3 memoria.py descartar <id> ["por qué"]                               # ya no sirve
    python3 memoria.py ver [--todo] [--json]                                    # abiertas (o todas)
    python3 memoria.py hoy                                                      # abiertas que vencen hoy o ya vencieron

`memoria-gerente.csv` (id, fecha, hora, fuente, tipo, resumen, vence, estado abierta|cumplida|descartada, cerrado).
Tipos (Santi, Fase 2, 19/10):
  compromiso  algo que el Gerente le prometió a Santi ("el viernes revisamos si T&T bajó el 7600")
  pedido      algo que Santi quiere y no es una tarea de un agente ("quiere saber cuánto cobra el courier B por 5 kg")
  preferencia cómo le gusta trabajar a Santi ("no quiere trabajar con tiendas que solo venden por mayor") — no vence
  dato        algo que contó Santi y no está en otro archivo ("la señora del courier A viaja el 25/10")
El repo y la oficina son públicos: solo el resumen de negocio, en palabras del Gerente; nunca el texto de Santi tal cual,
nombres de personas, teléfonos, direcciones, guías ni números de pedido.
"""
import csv
import json
import os
import sys
from datetime import datetime

DIR = os.path.dirname(os.path.abspath(__file__))
RUTA = os.path.join(DIR, "memoria-gerente.csv")
CAMPOS = ["id", "fecha", "hora", "fuente", "tipo", "resumen", "vence", "estado", "cerrado"]
TIPOS = ("compromiso", "pedido", "preferencia", "dato")
FUENTES = ("telegram", "ronda", "2000", "santi")


def ahora():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/La_Paz"))
    except Exception:
        return datetime.now()


def leer():
    if not os.path.exists(RUTA):
        return []
    with open(RUTA, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def guardar(filas):
    with open(RUTA, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, CAMPOS, lineterminator="\n", extrasaction="ignore")
        w.writeheader()
        w.writerows(filas)


def anotar(fuente, tipo, resumen, vence=""):
    fuente, tipo = fuente.lower(), tipo.lower()
    if tipo not in TIPOS:
        raise ValueError(f"tipo tiene que ser uno de: {', '.join(TIPOS)}")
    filas = leer()
    resumen = " ".join(resumen.split())
    # no repetir: si ya hay una abierta igual, se devuelve esa
    for f in filas:
        if f["estado"] == "abierta" and f["resumen"].lower() == resumen.lower():
            return f
    t = ahora()
    n = 1 + max([int(f["id"]) for f in filas if f.get("id", "").isdigit()] or [0])
    fila = {"id": str(n), "fecha": t.strftime("%Y-%m-%d"), "hora": t.strftime("%H:%M"), "fuente": fuente, "tipo": tipo,
            "resumen": resumen, "vence": vence, "estado": "abierta", "cerrado": ""}
    filas.append(fila)
    guardar(filas)
    return fila


def cerrar(id_, estado="cumplida", nota=""):
    filas = leer()
    for f in filas:
        if f["id"] == str(id_) and f["estado"] == "abierta":
            t = ahora()
            f["estado"] = estado
            f["cerrado"] = t.strftime("%d/%m %H:%M") + (f": {' '.join(nota.split())}" if nota else "")
            guardar(filas)
            return f
    return None


def abiertas():
    return [f for f in leer() if f["estado"] == "abierta"]


def vencen_hoy():
    hoy = ahora().strftime("%Y-%m-%d")
    return [f for f in abiertas() if f["vence"] and f["vence"] <= hoy]


def texto(filas, vacio="La libreta está vacía."):
    if not filas:
        return vacio
    return "\n".join(f"{f['id']}. [{f['tipo']}] {f['resumen']}" + (f" (vence {f['vence'][8:]}/{f['vence'][5:7]})" if f["vence"] else "")
                     + (f" — {f['estado']} {f['cerrado']}" if f["estado"] != "abierta" else "") for f in filas)


if __name__ == "__main__":
    a = sys.argv[1:]
    vence = ""
    if "--vence" in a:
        i = a.index("--vence")
        vence = a[i + 1]
        del a[i:i + 2]
    if a and a[0] == "anotar" and len(a) >= 4:
        print(json.dumps(anotar(a[1], a[2], " ".join(a[3:]), vence), ensure_ascii=False))
    elif a and a[0] in ("cumplir", "descartar") and len(a) >= 2:
        r = cerrar(a[1], "cumplida" if a[0] == "cumplir" else "descartada", " ".join(a[2:]))
        print(json.dumps(r, ensure_ascii=False) if r else f"No hay una nota abierta con id {a[1]}")
    elif a and a[0] == "hoy":
        print(texto(vencen_hoy(), "Nada vence hoy."))
    elif not a or a[0] == "ver":
        filas = leer() if "--todo" in a else abiertas()
        print(json.dumps(filas, ensure_ascii=False, indent=1) if "--json" in a else texto(filas))
    else:
        print(__doc__)
