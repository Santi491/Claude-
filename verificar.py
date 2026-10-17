#!/usr/bin/env python3
"""Verificación de los agentes, sin IA: revisa que lo que dejó cada agente en los archivos esté bien.

    python3 verificar.py comun           # datos privados que no deben salir a la oficina
    python3 verificar.py pedidos         # pedidos.csv, pedidos-prueba.csv, seguimiento.csv y el mapa
    python3 verificar.py pedidos --ronda # además: que hoy se revisaron todas las guías activas y hay fila `pedidos`
    python3 verificar.py todo            # todos los agentes que tienen chequeo
    python3 verificar.py ... --json      # para el Gerente y la oficina

Cada línea es OK, AVISO (algo para contar en el informe) o ERROR (corregir antes de entregar).
Sale con código 1 si hay algún ERROR. Nunca imprime guías, teléfonos ni direcciones: solo el id del pedido.
Lo usan los agentes al terminar su turno (skill reglas-cargo-brothers, sección 12) y el Gerente para controlar.
"""
import csv
import json
import os
import re
import sys
from datetime import date, datetime, timedelta

DIR = os.path.dirname(os.path.abspath(__file__))
HOY = date.today()
ESTADOS_PEDIDO = ["comprado", "enviado", "en bodega del courier", "en camino a Bolivia", "en Cochabamba", "entregado", "cancelado"]
COLS_PEDIDO = ["id", "fecha_compra", "tienda", "producto", "cantidad", "precio_usd", "envio_usd", "courier", "guia", "origen",
               "destino", "destino_lat", "destino_lon", "estado", "eta", "actualizado", "foto", "notas",
               "paquete", "incidencia", "reclamo_hasta"]
COLS_SEG = ["id", "fecha", "hora", "lugar", "lat", "lon", "evento", "fuente"]
CP = re.compile(r"\b\d{5}(-\d{4})?\b")


def leer(nombre):
    ruta = os.path.join(DIR, nombre)
    if not os.path.exists(ruta):
        return None, []
    with open(ruta, encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        return r.fieldnames or [], list(r)


def fecha(s):
    try:
        return datetime.strptime((s or "")[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


class Res:
    def __init__(self, agente):
        self.agente, self.lineas = agente, []

    def ok(self, t): self.lineas.append(("OK", t))
    def aviso(self, t): self.lineas.append(("AVISO", t))
    def error(self, t): self.lineas.append(("ERROR", t))

    @property
    def errores(self): return sum(1 for n, _ in self.lineas if n == "ERROR")


def comun(R, ronda=False):
    """Datos privados que no pueden aparecer en la oficina pública (oficina/datos.js) ni en actividad.csv."""
    ruta = os.path.join(DIR, "oficina", "datos.js")
    datos = open(ruta, encoding="utf-8").read() if os.path.exists(ruta) else ""
    _, act = leer("actividad.csv")
    texto_act = "\n".join(a.get("texto", "") for a in act)
    guias = [p["guia"].strip() for n in ("pedidos.csv", "pedidos-prueba.csv") for p in leer(n)[1] if len(p.get("guia", "").strip()) >= 8]
    tels = [re.sub(r"\D", "", t.get("whatsapp", "")) for t in leer("tiendas-cochabamba.csv")[1]]
    tels = [t[-8:] for t in tels if len(t) >= 8]
    fuga_d = sum(1 for g in guias if g in datos)
    fuga_a = sum(1 for g in guias if g in texto_act)
    (R.error if fuga_d else R.ok)(f"guías en la oficina (datos.js): {fuga_d}")
    (R.error if fuga_a else R.ok)(f"guías en actividad.csv: {fuga_a}")
    fuga_t = sum(1 for t in tels if t in datos)
    (R.error if fuga_t else R.ok)(f"teléfonos de tiendas en la oficina: {fuga_t}")
    cps = len(set(m.group(0) for m in re.finditer(r'"lugar":\s*"[^"]*?\b\d{5}\b', datos)))
    (R.error if cps else R.ok)(f"lugares con código postal en la oficina: {cps}")
    for clave in ("TELEGRAM_BOT_TOKEN", "EBAY_CLIENT_SECRET", "CALLMEBOT_APIKEY"):
        if re.search(clave + r"\s*=\s*\S{8,}", datos + texto_act):
            R.error(f"parece haber una clave ({clave}) en la oficina o en actividad.csv")


def pedidos(R, ronda=False):
    activos, ids = [], {}
    for nombre in ("pedidos.csv", "pedidos-prueba.csv"):
        cols, filas = leer(nombre)
        if cols is None:
            R.aviso(f"{nombre} no existe")
            continue
        falta = [c for c in COLS_PEDIDO if c not in cols]
        (R.error if falta else R.ok)(f"{nombre}: columnas {'faltan ' + ', '.join(falta) if falta else 'completas'}")
        for p in filas:
            pid = p.get("id", "").strip()
            if not pid:
                R.error(f"{nombre}: hay una fila sin id")
                continue
            if pid in ids:
                R.error(f"{nombre}: id repetido {pid}")
            ids[pid] = (nombre, p)
            est = p.get("estado", "").strip()
            if est not in ESTADOS_PEDIDO:
                R.error(f"{pid}: estado '{est}' no es válido ({' → '.join(ESTADOS_PEDIDO[:6])} o cancelado)")
            for c in ("fecha_compra", "eta", "actualizado", "reclamo_hasta"):
                if p.get(c) and not fecha(p[c]):
                    R.error(f"{pid}: {c} no es una fecha AAAA-MM-DD")
            if est not in ("entregado", "cancelado"):
                activos.append((pid, p, nombre))
    R.ok(f"pedidos activos: {len(activos)}")

    cols, seg = leer("seguimiento.csv")
    if cols is None:
        R.error("seguimiento.csv no existe")
        seg = []
    else:
        falta = [c for c in COLS_SEG if c not in cols]
        (R.error if falta else R.ok)(f"seguimiento.csv: columnas {'faltan ' + ', '.join(falta) if falta else 'completas'}")
    vistos, guias = set(), {p.get("guia", "").strip() for _, p in ids.values() if p.get("guia", "").strip()}
    for i, e in enumerate(seg, 2):
        clave = (e.get("id"), e.get("fecha"), e.get("hora"), e.get("lugar"), e.get("evento"))
        if clave in vistos:
            R.error(f"seguimiento.csv línea {i}: fila duplicada ({e.get('id')})")
        vistos.add(clave)
        if e.get("id") not in ids:
            R.error(f"seguimiento.csv línea {i}: el id {e.get('id')} no está en pedidos")
        if CP.search(e.get("lugar", "")):
            R.error(f"seguimiento.csv línea {i}: el lugar tiene código postal")
        if any(g and g in json.dumps(e) for g in guias):
            R.error(f"seguimiento.csv línea {i}: aparece una guía")
        try:
            la, lo = float(e["lat"]), float(e["lon"])
            if not (-60 <= la <= 72 and -170 <= lo <= -30):
                R.error(f"seguimiento.csv línea {i}: lat/lon fuera de América")
        except (TypeError, ValueError, KeyError):
            R.error(f"seguimiento.csv línea {i}: lat/lon vacías o no numéricas")
        if not fecha(e.get("fecha")):
            R.error(f"seguimiento.csv línea {i}: fecha no válida")
        if fecha(e.get("fecha")) and fecha(e["fecha"]) >= date(2026, 10, 18) and not e.get("fuente"):
            R.aviso(f"seguimiento.csv línea {i}: falta la fuente")

    # mapa: cada lugar con sus calles
    idx_p = os.path.join(DIR, "oficina", "mapa", "calles", "indice.json")
    con_mapa = {z["n"] for z in json.load(open(idx_p, encoding="utf-8"))} if os.path.exists(idx_p) else set()
    sin_mapa = sorted({CP.sub("", e.get("lugar", "")).strip() for e in seg if e.get("lat")} - con_mapa)
    (R.aviso if sin_mapa else R.ok)(f"lugares sin calles en el mapa: {', '.join(sin_mapa) if sin_mapa else 'ninguno'}"
                                    + (" (correr oficina/mapa_datos.py)" if sin_mapa else ""))

    # demoras, incidencias y plazos
    for pid, p, nombre in activos:
        ult = max([fecha(e["fecha"]) for e in seg if e.get("id") == pid and fecha(e.get("fecha"))], default=None)
        eta = fecha(p.get("eta"))
        if eta and eta < HOY:
            R.aviso(f"{pid}: la fecha estimada ({eta:%d/%m}) ya pasó y sigue '{p['estado']}'")
        if ult and p["estado"] in ("enviado", "en camino a Bolivia") and (HOY - ult).days >= 3:
            R.aviso(f"{pid}: {(HOY - ult).days} días sin movimiento")
        if p.get("incidencia"):
            R.aviso(f"{pid}: incidencia abierta: {p['incidencia']}")
        rh = fecha(p.get("reclamo_hasta"))
        if rh and p["estado"] in ("comprado", "enviado") and (rh - HOY).days <= 7:
            R.aviso(f"{pid}: quedan {(rh - HOY).days} días para reclamar a eBay")
        if nombre == "pedidos.csv" and "ebay" in p.get("tienda", "").lower() and not rh:
            R.aviso(f"{pid}: compra de eBay sin reclamo_hasta")
        act = fecha(p.get("actualizado"))
        if ronda and act != HOY:
            R.error(f"{pid}: no se revisó hoy (actualizado = {p.get('actualizado') or 'vacío'})")
        elif not ronda and (not act or (HOY - act).days >= 2):
            R.aviso(f"{pid}: última revisión {p.get('actualizado') or 'nunca'}")

    if ronda:
        _, act = leer("actividad.csv")
        hoy = [a for a in act if a.get("fecha") == HOY.isoformat() and a.get("agente") == "pedidos"]
        (R.ok if hoy else R.error)(f"fila 'pedidos' de hoy en actividad.csv: {'sí' if hoy else 'falta'}")


CHEQUEOS = {"comun": comun, "pedidos": pedidos}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    ronda, como_json = "--ronda" in sys.argv, "--json" in sys.argv
    pedidos_ = args or ["todo"]
    nombres = list(CHEQUEOS) if "todo" in pedidos_ else pedidos_
    resultados = []
    for n in nombres:
        if n not in CHEQUEOS:
            print(f"No hay chequeo para '{n}'. Disponibles: {', '.join(CHEQUEOS)}, todo")
            sys.exit(2)
        R = Res(n)
        CHEQUEOS[n](R, ronda)
        resultados.append(R)
    if como_json:
        print(json.dumps([{"agente": R.agente, "errores": R.errores, "lineas": [{"nivel": a, "texto": b} for a, b in R.lineas]}
                          for R in resultados], ensure_ascii=False, indent=1))
    else:
        for R in resultados:
            print(f"== {R.agente}")
            for nivel, t in R.lineas:
                print(f"  {nivel:5} {t}")
        total = sum(R.errores for R in resultados)
        print(f"\n{'Sin errores.' if not total else f'{total} ERROR(es): corregir antes de entregar.'}")
    sys.exit(1 if any(R.errores for R in resultados) else 0)


if __name__ == "__main__":
    main()
