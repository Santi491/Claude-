#!/usr/bin/env python3
"""Memoria de WhatsApp (Santi, 17/11): la ficha de cada tienda antes de escribirle, para no volver a preguntar lo mismo.

    python memoria_wa.py "<tienda>"            # la ficha: qué sabemos, qué ya preguntamos, qué NO volver a preguntar
    python memoria_wa.py anotar "<tienda>" [--tono "..."] [--sabe "..."] [--proxima "..."]
    python memoria_wa.py pendientes            # links, fotos o catálogos que quedaron sin revisar

La ficha junta lo que ya está en el repo (tiendas-cochabamba.csv, clientes-potenciales.csv, mensajes.csv,
precios-cochabamba.csv, mercado.csv) con la libreta propia de WhatsApp, `memoria-wa.csv` (una fila por tienda):
  tono      cómo habla la tienda y cómo le conviene hablar André ("formal, responde corto a la tarde")
  sabe      lo que la tienda contó de sí misma ("arma PCs a pedido; le llega mercadería los jueves")
  proxima   qué conviene preguntar o hacer la próxima vez ("preguntar si le llegó el 7600 el lunes")
El repo y la oficina son públicos: nunca teléfonos, nombres de personas, direcciones ni capturas; solo el dato de negocio.
"""
import csv
import os
import re
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

DIR = os.path.dirname(os.path.abspath(__file__))
RUTA = os.path.join(DIR, "memoria-wa.csv")
CAMPOS = ["id", "tienda", "actualizado", "tono", "sabe", "proxima"]
HOY = datetime.now(ZoneInfo("America/La_Paz")).date()
PRIVADO = re.compile(r"\b\d{8}\b|\+591|carnet|\bnit\b", re.I)
PENDIENTE = re.compile(r"por revisar|no se abri|sin leer(?! revisad)|pendiente que cat|sin abrir|link sin", re.I)


def revisado(m, cats):
    """Un link o catálogo cuenta como revisado si Catálogos anotó esa tienda en catalogos.csv desde 30 días antes."""
    d = fecha(m["fecha"])
    t = norm(m["tienda"])
    return any(norm(c["tienda"].split(" /")[0]) in t and (fecha(c["fecha"]) or HOY) >= d - timedelta(days=30) for c in cats)


def leer(nombre):
    ruta = os.path.join(DIR, nombre)
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def fecha(s):
    try:
        return datetime.strptime((s or "")[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def buscar_tienda(nombre):
    tiendas = leer("tiendas-cochabamba.csv")
    n = norm(nombre)
    exacta = [t for t in tiendas if norm(t["tienda"]) == n or t.get("id", "").lower() == nombre.lower()]
    if exacta:
        return exacta[0]
    parecidas = [t for t in tiendas if n and n in norm(t["tienda"])]
    if len(parecidas) == 1:
        return parecidas[0]
    if parecidas:
        sys.exit("Hay varias tiendas parecidas: " + ", ".join(t["tienda"] for t in parecidas[:8]) + ". Escribe el nombre exacto.")
    sys.exit(f"No encontré '{nombre}' en tiendas-cochabamba.csv.")


def de_la_tienda(filas, t, col):
    n = norm(t["tienda"])
    return [r for r in filas if norm(re.sub(r"\s*\((whatsapp|messenger|web)\)\s*$", "", r.get(col, ""), flags=re.I)) == n]


def ficha(nombre):
    t = buscar_tienda(nombre)
    mem = {r["tienda"]: r for r in leer("memoria-wa.csv")}.get(t["tienda"], {})
    cli = {r["tienda"]: r for r in leer("clientes-potenciales.csv")}.get(t["tienda"], {})
    msgs = [m for m in leer("mensajes.csv") if m.get("canal") == "whatsapp" and m["tienda"] == t["tienda"]]
    precios = de_la_tienda(leer("precios-cochabamba.csv"), t, "fuente")
    mercado = de_la_tienda(leer("mercado.csv"), t, "tienda")

    print(f"== {t['tienda']} ({t.get('id') or 'sin id'}) · {t.get('ciudad', '')} · estado: {t.get('estado_contacto') or '-'}"
          f" · última consulta: {t.get('ultima_consulta') or '-'}")
    if t.get("vende_componentes"):
        print(f"   vende componentes: {t['vende_componentes']}")
    if cli:
        print(f"   cliente potencial: grupo {cli.get('grupo')} ({cli.get('por_que', '')})")
    if t.get("notas"):
        print(f"   notas: {t['notas'][:300]}")
    print("\n-- Lo que André sabe de esta tienda (memoria-wa.csv)")
    if mem:
        for c in ("tono", "sabe", "proxima"):
            if mem.get(c):
                print(f"   {c}: {mem[c]}")
        print(f"   (actualizado {mem.get('actualizado')})")
    else:
        print("   todavía nada: al terminar la charla, anota tono, lo que contó y qué preguntar la próxima vez.")

    print(f"\n-- Últimos mensajes ({len(msgs)} en total)")
    for m in msgs[-10:]:
        txt = m.get("texto") or ""
        print(f"   {m['fecha']} {m.get('hora', '')} {'→' if m['direccion'] == 'enviado' else '←'} {m['tipo']}: "
              f"{(m.get('nota') or '')[:160]}" + (f"\n        dijo André: \"{txt[:200]}\"" if txt else ""))

    ya, no_tiene = {}, {}
    for p in precios:
        d = fecha(p["fecha"])
        if not d:
            continue
        if p.get("precio_bs"):
            ya[p["producto"]] = max(ya.get(p["producto"], d), d)
        elif "agotado" in (p.get("estado") or "") or "sin stock" in (p.get("estado") or ""):
            no_tiene[p["producto"]] = max(no_tiene.get(p["producto"], d), d)
    print("\n-- Precios que ya nos dio")
    for p in precios[-12:]:
        if p.get("precio_bs"):
            print(f"   {p['fecha']} {p['producto']}: Bs {p['precio_bs']} ({p.get('estado', '')}{', ' + p['condiciones'] if p.get('condiciones') else ''})")
    if mercado:
        print("   fuera de la lista: " + "; ".join(f"{r['producto']} {r.get('precio_bs') or 'sin precio'}" for r in mercado[-6:]))

    print("\n-- NO volver a preguntar (ya lo respondió hace poco)")
    lineas = [f"   {k}: precio del {v:%d/%m}" for k, v in sorted(ya.items()) if (HOY - v).days <= 30]
    lineas += [f"   {k}: dijo que no tiene el {v:%d/%m} (preguntar solo si le llega mercadería)" for k, v in sorted(no_tiene.items())
               if (HOY - v).days <= 14 and k not in ya]
    lc = [m for m in msgs if (m.get("nota") or "").lower().startswith("lista completa")]
    if lc:
        lineas.append(f"   la lista completa: ya se le pidió el {lc[-1]['fecha'][8:10]}/{lc[-1]['fecha'][5:7]}")
    print("\n".join(lineas) if lineas else "   nada reciente: se le puede preguntar.")
    cats = leer("catalogos.csv")
    pend = [m for m in msgs if m["direccion"] == "recibido" and PENDIENTE.search(m.get("nota") or "") and not revisado(m, cats)]
    if pend:
        print("\n-- OJO: mandó algo que quedó sin revisar")
        for m in pend[-3:]:
            print(f"   {m['fecha']}: {(m.get('nota') or '')[:160]}")


def anotar(nombre, cambios):
    t = buscar_tienda(nombre)
    for v in cambios.values():
        if PRIVADO.search(v):
            sys.exit("No: eso parece tener un teléfono o un dato personal. El repo es público.")
    filas = leer("memoria-wa.csv")
    existe = os.path.exists(RUTA)
    crlf = existe and b"\r\n" in open(RUTA, "rb").read()
    fila = next((r for r in filas if r["tienda"] == t["tienda"]), None)
    if not fila:
        fila = {"id": t.get("id", ""), "tienda": t["tienda"]}
        filas.append(fila)
    fila.update({k: v for k, v in cambios.items() if v})
    fila["actualizado"] = HOY.isoformat()
    with open(RUTA, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS, lineterminator="\r\n" if crlf else "\n")
        w.writeheader()
        w.writerows({c: r.get(c, "") for c in CAMPOS} for r in filas)
    print(f"Anotado en la memoria de {t['tienda']}.")


def pendientes():
    cats = leer("catalogos.csv")
    hubo = False
    for m in leer("mensajes.csv"):
        if m.get("direccion") != "recibido" or not PENDIENTE.search(m.get("nota") or ""):
            continue
        d = fecha(m["fecha"])
        if d and not revisado(m, cats) and (HOY - d).days <= 21:
            hubo = True
            print(f"{m['fecha']} {m['tienda']}: {(m.get('nota') or '')[:150]}")
    if not hubo:
        print("Nada pendiente: todos los links, fotos y catálogos están revisados.")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == "pendientes":
        pendientes()
    elif a[0] == "anotar" and len(a) >= 2:
        opts, k = {}, 2
        while k < len(a) - 1:
            if a[k] in ("--tono", "--sabe", "--proxima"):
                opts[a[k][2:]] = a[k + 1]
            k += 2
        anotar(a[1], opts)
    else:
        ficha(" ".join(a))
