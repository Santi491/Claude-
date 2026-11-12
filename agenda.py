#!/usr/bin/env python3
"""Agenda de seguimientos del agente WhatsApp: a qué tienda le toca qué hoy.

    python3 agenda.py            # lista de hoy, en texto (la lee el agente WhatsApp al empezar la ronda)
    python3 agenda.py --json     # para la oficina

Reglas (CLAUDE.md, "Mensajes a tiendas: autonomía"): si una tienda no responde, un solo seguimiento cada 2 días;
después de 2 seguimientos sin respuesta la tienda queda "fría" y no se le vuelve a escribir sin que Santi lo pida.
Si la tienda escribió después de nuestro último mensaje, toca responderle.

Lista completa (Santi, 12/11): ya casi no quedan números nuevos, así que a cada tienda que ya tenemos se le pide UNA vez
el precio de toda nuestra lista (o su catálogo / lista de precios). La sección "Pedir lista completa" dice a quiénes falta,
en orden: primero las que ya nos pasaron precios, después las que respondieron, las que dijeron "sin stock" de algo y las
que tocan seguimiento (el pedido de la lista les vale como seguimiento). Nunca a frías, "no vende", "no contactar",
sin WhatsApp o número equivocado. Se marca con "Lista completa" al inicio de la nota en mensajes.csv.

Fuentes: mensajes.csv (desde el 13/10, una fila por mensaje) y tiendas-cochabamba.csv (estado y ultima_consulta, que cubre
los contactos anteriores a mensajes.csv). Solo canal WhatsApp: en Messenger son personas.
"""
import csv
import json
import os
import re
import sys
from datetime import date, datetime, timedelta

DIR = os.path.dirname(os.path.abspath(__file__))
CERRADAS = re.compile(r"no vende|sin stock|no contactar|sin whatsapp|no sueltos|cerrad|n[uú]mero equivocado", re.I)
# cierres sin precio (la tienda dijo que no tiene o cerró la charla): no hay nada que responder (idea 10, 29/10)
CIERRES = re.compile(r"no tengo|agotad|sin stock|no hay|nom[aá]s|no se contesta|sin el producto|no vende", re.I)
# la tienda ya confirmó lo que le preguntamos, con o sin precio: tampoco hay nada que responder (tarea 2026-10-30-1)
RESUELTAS = re.compile(r"confirma", re.I)
DIAS_SEGUIMIENTO, MAX_SEGUIMIENTOS = 2, 2
LISTA_DESDE = "2026-11-12"
NUNCA_LISTA = re.compile(r"no vende|no contactar|sin whatsapp|no sueltos|n[uú]mero equivocado|sin whatsapp|otra ciudad", re.I)
LISTA_POR_RONDA = 10


def leer(nombre):
    ruta = os.path.join(DIR, nombre)
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def fecha(s):
    try:
        return datetime.strptime((s or "")[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def calcular(hoy=None):
    hoy = hoy or date.today()
    msgs = [m for m in leer("mensajes.csv") if m.get("canal") == "whatsapp"]
    out = {"hoy": hoy.isoformat(), "responder": [], "seguimiento": [], "esperar": [], "frias": [], "respondieron": [],
           "lista_completa": [], "lista_pedida": 0}
    tiendas = leer("tiendas-cochabamba.csv")
    for t in tiendas:
        nombre, estado = t.get("tienda", ""), t.get("estado_contacto", "")
        # los saludos automáticos no son una respuesta de una persona
        mios = [m for m in msgs if m["tienda"] == nombre
                and not (m["direccion"] == "recibido" and m.get("tipo") == "automatica")]
        env = [fecha(m["fecha"]) for m in mios if m["direccion"] == "enviado"]
        rec = [fecha(m["fecha"]) for m in mios if m["direccion"] == "recibido"]
        if re.search(r"esperando|consultad", estado, re.I) and fecha(t.get("ultima_consulta")):
            env.append(fecha(t["ultima_consulta"]))
        if re.search(r"respondi", estado, re.I) and fecha(t.get("ultima_consulta")):
            rec.append(fecha(t["ultima_consulta"]))
        env, rec = [d for d in env if d], [d for d in rec if d]
        if not env and not rec:
            continue
        if CERRADAS.search(estado):
            continue
        ult_env, ult_rec = max(env, default=None), max(rec, default=None)
        fila = {"tienda": nombre, "estado": estado, "ultimo_enviado": ult_env.isoformat() if ult_env else "",
                "ultimo_recibido": ult_rec.isoformat() if ult_rec else ""}
        # la tienda escribió y todavía no le contestamos (mismo día cuenta como respondida por nosotros si hay envío después)
        ult_env_dt = max([m["fecha"] + " " + m["hora"] for m in mios if m["direccion"] == "enviado"], default="")
        ult_rec_dt = max([m["fecha"] + " " + m["hora"] for m in mios if m["direccion"] == "recibido"], default="")
        ult_rec_m = max([m for m in mios if m["direccion"] == "recibido"], key=lambda m: m["fecha"] + " " + m["hora"], default=None)
        if ult_rec_dt and ult_rec_dt > ult_env_dt and ult_rec_m.get("con_precio") != "sí" and CIERRES.search(ult_rec_m.get("nota", "")):
            out["respondieron"].append({**fila, "motivo": "cerró sin precio"})
            continue
        if ult_rec_dt and ult_rec_dt > ult_env_dt and RESUELTAS.search(ult_rec_m.get("nota", "")):
            out["respondieron"].append({**fila, "motivo": "ya confirmó lo que preguntamos"})
            continue
        if ult_rec_dt and ult_rec_dt > ult_env_dt:
            out["responder"].append({**fila, "motivo": "escribió después de nuestro último mensaje"})
            continue
        if not ult_env or (ult_rec and ult_rec >= ult_env):
            out["respondieron"].append(fila)
            continue
        segs = [m for m in mios if m["direccion"] == "enviado" and m["tipo"] == "seguimiento"
                and (not ult_rec or fecha(m["fecha"]) > ult_rec)]
        dias = (hoy - ult_env).days
        fila |= {"dias_sin_respuesta": dias, "seguimientos": len(segs)}
        if len(segs) >= MAX_SEGUIMIENTOS:
            out["frias"].append({**fila, "motivo": f"{len(segs)} seguimientos sin respuesta"})
        elif dias >= DIAS_SEGUIMIENTO:
            out["seguimiento"].append({**fila, "motivo": f"{dias} días sin respuesta"})
        else:
            out["esperar"].append({**fila, "proximo": (ult_env + timedelta(days=DIAS_SEGUIMIENTO)).isoformat()})
    for k in ("seguimiento", "frias"):
        out[k].sort(key=lambda f: -f["dias_sin_respuesta"])
    # Pedir lista completa (Santi, 12/11)
    pedida = {m["tienda"] for m in msgs if m["direccion"] == "enviado" and m["fecha"] >= LISTA_DESDE
              and (m.get("nota") or "").lower().startswith("lista completa")}
    out["lista_pedida"] = len(pedida)
    frias = {f["tienda"] for f in out["frias"]}
    esperar = {f["tienda"] for f in out["esperar"]}
    seguimiento = {f["tienda"] for f in out["seguimiento"]}
    con_precio = {m["tienda"] for m in msgs if m["direccion"] == "recibido" and m.get("con_precio") == "sí"}
    respondio = {m["tienda"] for m in msgs if m["direccion"] == "recibido" and m.get("tipo") != "automatica"}
    for t in tiendas:
        n, est = t.get("tienda", ""), t.get("estado_contacto", "")
        if not n or n in pedida or n in frias or n in esperar or not (t.get("whatsapp") or "").strip() or NUNCA_LISTA.search(est):
            continue
        if n in con_precio:
            orden, por = 0, "ya nos pasó precios"
        elif n in respondio or re.search(r"respondi", est, re.I):
            orden, por = 1, "respondió antes"
        elif re.search(r"sin stock", est, re.I):
            orden, por = 2, "dijo sin stock de algo: puede tener otros"
        elif n in seguimiento:
            orden, por = 3, "le toca seguimiento: va como seguimiento"
        else:
            continue
        out["lista_completa"].append({"tienda": n, "id": t.get("id", ""), "estado": est, "motivo": por, "orden": orden})
    out["lista_completa"].sort(key=lambda f: f["orden"])
    return out


def texto(a):
    L = [f"Agenda de WhatsApp para hoy ({a['hoy']}):"]
    sec = [("responder", "Responder (escribieron y falta contestar)"), ("seguimiento", "Seguimiento hoy (uno corto por tienda)"),
           ("esperar", "Esperar (todavía no toca)"), ("frias", "Frías (no escribir sin que Santi lo pida)")]
    for k, t in sec:
        L.append(f"\n{t}: {len(a[k])}")
        for f in a[k]:
            extra = f.get("motivo") or (f"próximo seguimiento el {f['proximo']}" if f.get("proximo") else "")
            L.append(f"  - {f['tienda']} · {extra}")
    lc = a["lista_completa"]
    L.append(f"\nPedir lista completa (Santi 12/11; hasta {LISTA_POR_RONDA} por ronda, ya pedida a {a['lista_pedida']}): faltan {len(lc)}")
    for f in lc[:LISTA_POR_RONDA]:
        L.append(f"  - {f['tienda']} · {f['motivo']}")
    if len(lc) > LISTA_POR_RONDA:
        L.append(f"  ... y {len(lc) - LISTA_POR_RONDA} más en las próximas rondas")
    return "\n".join(L)


if __name__ == "__main__":
    a = calcular()
    print(json.dumps(a, ensure_ascii=False, indent=2) if "--json" in sys.argv else texto(a))
