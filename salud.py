#!/usr/bin/env python3
"""Salud del equipo: el horario de cada parte y si hoy (o cualquier día) corrió.

    python3 salud.py            # estado de hoy en texto
    python3 salud.py --json     # lo mismo en JSON (lo usan el vigilante de la Raspberry y oficina/generar.py)

Fuentes: sesiones.csv (una fila por sesión de trabajo: nube, mac, pc, gerente, raspberry), informes/AAAA-MM-DD.md
(la nube), informes/gerente/indice.csv (el Gerente de las 20:00), actividad.csv (respaldo para días viejos) y
salud-raspberry.json (el último latido de la Raspberry).
Horario (Santi, 17/10): nube y Gerente todos los días; Mac lunes a viernes; PC lunes a sábado (sábado ronda ligera);
domingo sin rondas con Chrome.
"""
import csv
import json
import os
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

RAIZ = os.path.dirname(os.path.abspath(__file__))
TZ = ZoneInfo("America/La_Paz")
SESIONES = os.path.join(RAIZ, "sesiones.csv")
CAMPOS = ["fecha", "quien", "tipo", "inicio", "fin", "estado", "nota"]
INICIO = "2026-10-12"   # primer día con el equipo trabajando: antes no cuenta como falla

# dias: 0 = lunes ... 6 = domingo; limite: hora a la que, si no corrió, cuenta como "no corrió"
HORARIO = {
    "nube": {"nombre": "Nube · revisión 7:52", "dias": range(7), "hora": "07:52", "limite": "09:30"},
    "mac": {"nombre": "Mac · ronda 10:30", "dias": range(5), "hora": "10:30", "limite": "13:00"},
    "pc": {"nombre": "PC · ronda 16:00", "dias": range(6), "hora": "16:00", "limite": "18:00", "ligera": [5]},
    "gerente": {"nombre": "Gerente · informe 20:00", "dias": range(7), "hora": "20:00", "limite": "20:45"},
}


def ahora():
    return datetime.now(TZ)


def leer(nombre):
    ruta = os.path.join(RAIZ, nombre)
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def sesiones():
    return leer("sesiones.csv")


def anotar(quien, tipo, estado="ok", nota="", inicio="", fin=""):
    """Agrega una fila a sesiones.csv (no hace commit)."""
    t = ahora()
    nueva = not os.path.exists(SESIONES)
    with open(SESIONES, "a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        if nueva:
            w.writerow(CAMPOS)
        w.writerow([t.strftime("%Y-%m-%d"), quien, tipo, inicio or t.strftime("%H:%M"), fin or t.strftime("%H:%M"), estado, nota])


def corrio(quien, fecha, S=None):
    """La sesión de `quien` que corrió ese día (dict) o None."""
    S = sesiones() if S is None else S
    filas = [s for s in S if s["fecha"] == fecha and s["quien"] == quien and s["estado"] in ("ok", "arreglado")
             and not s["tipo"].startswith(("encargo", "vigilante", "encendido", "cubre"))]
    if filas:
        return filas[-1]
    # respaldos para días anteriores al registro de sesiones
    if quien == "nube" and os.path.exists(os.path.join(RAIZ, "informes", f"{fecha}.md")):
        return {"fecha": fecha, "quien": "nube", "tipo": "revisión", "inicio": "", "fin": "", "estado": "ok", "nota": "informe del día"}
    if quien == "gerente" and any(r["fecha"] == fecha for r in leer("informes/gerente/indice.csv")):
        return {"fecha": fecha, "quien": "gerente", "tipo": "informe", "inicio": "", "fin": "", "estado": "ok", "nota": "informe en el Doc"}
    return None


def en_curso(quien, fecha, S=None, horas=6):
    """La ronda de `quien` empezó hoy (fila 'en curso' de `salud.py empezar`) y todavía no terminó (27/10: la Mac
    empezó tarde dos días y el vigilante la creyó caída)."""
    S = sesiones() if S is None else S
    hoy = [s for s in S if s["fecha"] == fecha and s["quien"] == quien]
    if not hoy or hoy[-1]["estado"] != "en curso":
        return None
    try:
        ini = datetime.strptime(f"{fecha} {hoy[-1]['inicio']}", "%Y-%m-%d %H:%M").replace(tzinfo=TZ)
        if (ahora() - ini).total_seconds() > horas * 3600:
            return None   # empezó hace demasiado: se colgó
    except ValueError:
        pass
    return hoy[-1]


def empezar(quien, tipo="ronda"):
    """Anota que la ronda empezó y la sube a GitHub, para que el vigilante sepa que está en curso."""
    import subprocess
    anotar(quien, tipo, "en curso", "empezó")
    g = lambda *a: subprocess.run(["git", "-C", RAIZ, *a], capture_output=True, text=True, timeout=120)
    g("add", "sesiones.csv"); g("commit", "-q", "-m", f"Sesión: {quien} empezó la {tipo}")
    for _ in range(3):
        if g("push", "-q").returncode == 0:
            return True
        g("pull", "--no-rebase", "--no-edit", "-q")
    return False


def cubierta(quien, fecha, S=None):
    """Si otra máquina cubrió la ronda (por ejemplo, la PC hizo la de la Mac)."""
    S = sesiones() if S is None else S
    return next((s for s in S if s["fecha"] == fecha and s["tipo"] == f"cubre {quien}" and s["estado"] in ("ok", "arreglado")), None)


def estado_dia(fecha=None, hora=None):
    """Estado de cada parte en esa fecha: ok | cubierta | pendiente | no corrió | no toca."""
    t = ahora()
    fecha = fecha or t.strftime("%Y-%m-%d")
    hoy = fecha == t.strftime("%Y-%m-%d")
    hora = hora or (t.strftime("%H:%M") if hoy else "23:59")
    dia = datetime.strptime(fecha, "%Y-%m-%d").weekday()
    S = sesiones()
    out = {}
    for k, h in HORARIO.items():
        s = corrio(k, fecha, S)
        c = cubierta(k, fecha, S) if not s else None
        if fecha < INICIO:
            e = "antes"
        elif dia not in h["dias"]:
            e = "ok" if s else "no toca"
        elif s:
            e = "ok"
        elif c:
            e = "cubierta"
        elif en_curso(k, fecha, S):
            e = "en curso"
        elif hora < h["limite"]:
            e = "pendiente"
        else:
            e = "no corrió"
        out[k] = {"nombre": h["nombre"], "estado": e, "hora": h["hora"], "limite": h["limite"],
                  "ligera": dia in h.get("ligera", []), "sesion": s or c}
    out["raspberry"] = raspberry()
    return out


def raspberry():
    ruta = os.path.join(RAIZ, "salud-raspberry.json")
    if not os.path.exists(ruta):
        return {"nombre": "Raspberry · siempre prendida", "estado": "sin datos"}
    d = json.load(open(ruta, encoding="utf-8"))
    try:
        ult = datetime.strptime(d.get("ultima", ""), "%Y-%m-%d %H:%M").replace(tzinfo=TZ)
        horas = (ahora() - ult).total_seconds() / 3600
    except ValueError:
        horas = 99
    # el latido se sube cada 3 horas: más de 7 horas sin latido es que se apagó o perdió internet
    d.update({"nombre": "Raspberry · siempre prendida", "estado": "ok" if horas < 7 else "sin señal", "horas": round(horas, 1)})
    return d


def semana(dias=14):
    """Estado de los últimos `dias` días (para la grilla de la oficina)."""
    t = ahora()
    return [{"fecha": f, **{k: v["estado"] for k, v in estado_dia(f).items() if k != "raspberry"}}
            for f in ((t - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(dias - 1, -1, -1))]


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "empezar":   # python3 salud.py empezar mac [ronda]
        ok = empezar(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "ronda")
        print("anotada en curso" + ("" if ok else " (no se pudo subir a GitHub)"))
        sys.exit(0)
    e = estado_dia()
    if "--json" in sys.argv:
        print(json.dumps({"hoy": e, "semana": semana()}, ensure_ascii=False, indent=1, default=str))
    else:
        for k, v in e.items():
            print(f"{v.get('nombre', k)}: {v['estado']}")
