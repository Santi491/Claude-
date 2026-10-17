#!/usr/bin/env python3
"""Verificación de los agentes, sin IA: revisa que lo que dejó cada agente en los archivos esté bien.

    python3 verificar.py comun           # datos privados que no deben salir a la oficina
    python3 verificar.py pedidos         # pedidos.csv, pedidos-prueba.csv, seguimiento.csv y el mapa
    python3 verificar.py pedidos --ronda # además: que hoy se revisaron todas las guías activas y hay fila `pedidos`
    python3 verificar.py gerente | wa | mkt | catalogos | ebay | ana | fin | oficina   # cada puesto (17/10)
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
    integridad(R)
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



# ---------- Chequeos del resto de los puestos (17/10) ----------
CSVS = ["actividad.csv", "plan.csv", "mensajes.csv", "tiendas-cochabamba.csv", "precios-cochabamba.csv", "precios-eeuu.csv",
        "tipo-cambio.csv", "vigilar.csv", "demanda.csv", "catalogos.csv", "clientes-potenciales.csv", "necesidades.csv",
        "ideas.csv", "ventas.csv", "pedidos.csv", "pedidos-prueba.csv", "seguimiento.csv", "chat.csv", "sesiones.csv"]
AGENTES = ("nube", "ebay", "wa", "mkt", "ana", "pedidos", "fin", "dem", "gerente", "local", "santi")


def integridad(R):
    """Filas con más o menos columnas que el encabezado (una coma sin comillas rompe todo lo que lee ese archivo)."""
    malas = []
    for n in CSVS:
        ruta = os.path.join(DIR, n)
        if not os.path.exists(ruta):
            continue
        with open(ruta, encoding="utf-8-sig", newline="") as f:
            filas = list(csv.reader(f))
        if not filas:
            continue
        mal = [i for i, r in enumerate(filas[1:], 2) if r and len(r) != len(filas[0])]
        if mal:
            malas.append(f"{n} (líneas {', '.join(map(str, mal[:5]))})")
    (R.error if malas else R.ok)(f"CSV con columnas de más o de menos: {'; '.join(malas) if malas else 'ninguno'}"
                                 + (" — encerrar el texto entre comillas" if malas else ""))


def de_hoy(filas, col="fecha"):
    return [f for f in filas if (f.get(col) or "")[:10] == HOY.isoformat()]


def fila_actividad(R, agente, ronda):
    _, act = leer("actividad.csv")
    hoy = [a for a in de_hoy(act) if a.get("agente") == agente]
    if ronda:
        (R.ok if hoy else R.error)(f"fila '{agente}' de hoy en actividad.csv: {'sí' if hoy else 'falta'}")


def gerente(R, ronda=False):
    cols, plan = leer("plan.csv")
    falta = [c for c in ("id", "fecha_para", "agente", "tarea", "motivo", "estado", "propuesto_por", "fecha_propuesta",
                         "decision", "prioridad", "plazo", "meta", "obligatoria") if c not in (cols or [])]
    (R.error if falta else R.ok)(f"plan.csv: columnas {'faltan ' + ', '.join(falta) if falta else 'completas'}")
    ids = [p["id"] for p in plan]
    rep = sorted({i for i in ids if ids.count(i) > 1})
    (R.error if rep else R.ok)(f"ids repetidos en plan.csv: {', '.join(rep) if rep else 'ninguno'}")
    for p in plan:
        if p.get("estado") not in ("propuesto", "aprobado", "rechazado", "hecho"):
            R.error(f"tarea {p['id']}: estado '{p.get('estado')}' no válido")
        if p.get("agente") and p["agente"] not in AGENTES:
            R.aviso(f"tarea {p['id']}: agente '{p['agente']}' desconocido")
    # duplicadas: misma tarea para el mismo agente, abiertas
    abiertas = [p for p in plan if p.get("estado") in ("propuesto", "aprobado")]
    vistas = {}
    for p in abiertas:
        k = (p.get("agente"), re.sub(r"\W+", " ", (p.get("tarea") or "").lower()).strip()[:60])
        if k in vistas:
            R.aviso(f"tareas duplicadas: {vistas[k]} y {p['id']}")
        vistas[k] = p["id"]
    atrasadas = [p["id"] for p in plan if p.get("estado") == "aprobado"
                 and (fecha(p.get("plazo")) or fecha(p.get("fecha_para")) or HOY) < HOY]
    (R.aviso if atrasadas else R.ok)(f"tareas aprobadas atrasadas: {', '.join(atrasadas[-10:]) if atrasadas else 'ninguna'}")
    oblig = [p["id"] for p in plan if (p.get("obligatoria") or "").lower().startswith("s") and p.get("estado") == "aprobado"
             and (fecha(p.get("plazo")) or fecha(p.get("fecha_para")) or HOY) <= HOY]
    (R.aviso if oblig else R.ok)(f"metas obligatorias sin cumplir (hoy o antes): {', '.join(oblig) if oblig else 'ninguna'}")
    _, nec = leer("necesidades.csv")
    vistas_n, dup = {}, []
    for i, n in enumerate(nec, 1):
        if n.get("estado", "abierta") == "resuelta":
            continue
        k = (n.get("agente"), re.sub(r"\W+", " ", (n.get("necesita") or "").lower())[:40])
        if k in vistas_n:
            dup.append(f"{vistas_n[k]} y {i}")
        vistas_n[k] = i
    (R.aviso if dup else R.ok)(f"necesidades abiertas repetidas (fila del CSV): {', '.join(dup) if dup else 'ninguna'}")
    venc_p = [p["id"] for p in plan if p.get("estado") == "propuesto" and (fecha(p.get("plazo")) or fecha(p.get("fecha_para")) or HOY) < HOY]
    (R.aviso if venc_p else R.ok)(f"tareas propuestas vencidas (cerrar o reprogramar): {', '.join(venc_p[-10:]) if venc_p else 'ninguna'}")
    sin_pp = [p["id"] for p in plan if (fecha(p.get("fecha_propuesta")) or date(2000, 1, 1)) >= date(2026, 10, 18) and (not p.get("prioridad") or not p.get("plazo"))]
    (R.aviso if sin_pp else R.ok)(f"tareas nuevas sin prioridad o plazo: {', '.join(sin_pp) if sin_pp else 'ninguna'}")
    _, chat = leer("chat.csv")
    sin_resp = [c for c in chat if c.get("para") in ("gerente", "santi") and c.get("estado") != "respondido"
                and fecha(c.get("fecha")) and (HOY - fecha(c["fecha"])).days >= 1]
    (R.aviso if sin_resp else R.ok)(f"mensajes del chat sin respuesta hace 1 día o más: {len(sin_resp)}")


def wa(R, ronda=False):
    cols, msgs = leer("mensajes.csv")
    falta = [c for c in ("fecha", "hora", "canal", "tienda", "direccion", "tipo", "con_precio", "nota") if c not in (cols or [])]
    (R.error if falta else R.ok)(f"mensajes.csv: columnas {'faltan ' + ', '.join(falta) if falta else 'completas'}")
    _, tiendas = leer("tiendas-cochabamba.csv")
    nombres = {t.get("tienda") for t in tiendas}
    ids = [t.get("id") for t in tiendas]
    sin_id = sum(1 for i in ids if not i)
    rep = sorted({i for i in ids if i and ids.count(i) > 1})
    (R.error if rep else R.ok)(f"ids de tienda repetidos: {', '.join(rep) if rep else 'ninguno'}")
    (R.aviso if sin_id else R.ok)(f"tiendas sin id: {sin_id}")
    nom = [t.get("tienda", "").strip().lower() for t in tiendas]
    dn = sorted({n for n in nom if n and nom.count(n) > 1})
    (R.aviso if dn else R.ok)(f"tiendas con el mismo nombre dos veces: {', '.join(dn) if dn else 'ninguna'}")
    for i, m in enumerate(msgs, 2):
        if m.get("direccion") not in ("enviado", "recibido"):
            R.error(f"mensajes.csv línea {i}: direccion '{m.get('direccion')}'")
        if m.get("tipo") not in ("nuevo", "seguimiento", "respuesta", "automatica"):
            R.error(f"mensajes.csv línea {i}: tipo '{m.get('tipo')}'")
        if m.get("canal") == "whatsapp" and m.get("tienda") not in nombres:
            R.aviso(f"mensajes.csv línea {i}: la tienda '{m.get('tienda')}' no está en tiendas-cochabamba.csv con ese nombre")
        if re.search(r"\b\d{8}\b|\+591|carnet|\bnit\b", m.get("nota", ""), re.I):
            R.error(f"mensajes.csv línea {i}: la nota parece tener un teléfono o un dato personal")
    hoy = [m for m in de_hoy(msgs) if m.get("canal") == "whatsapp" and m.get("direccion") == "enviado"]
    nuevos = sum(1 for m in hoy if m.get("tipo") == "nuevo")
    _, plan = leer("plan.csv")
    tope = 10
    for p in plan:
        if p.get("estado") in ("aprobado", "hecho") and p.get("fecha_para") == HOY.isoformat() and p.get("agente") == "wa" \
                and re.search(r"tope|chats? nuevos|tiendas", p.get("tarea", ""), re.I) and p.get("meta", "").isdigit():
            tope = max(tope, min(20, int(p["meta"])))
    (R.error if nuevos > tope else R.ok)(f"chats nuevos de WhatsApp hoy: {nuevos} de {tope}")
    # seguimientos: no más de uno cada 2 días por tienda sin respuesta
    for t in sorted({m["tienda"] for m in hoy if m.get("tipo") == "seguimiento"}):
        prev = [fecha(m["fecha"]) for m in msgs if m["tienda"] == t and m.get("tipo") == "seguimiento" and m.get("direccion") == "enviado"
                and fecha(m["fecha"]) and fecha(m["fecha"]) < HOY]
        if prev and (HOY - max(prev)).days < 2:
            R.error(f"seguimiento a '{t}' antes de los 2 días del anterior")
    try:
        import agenda
        a = agenda.calcular()
        # fría = ya tenía 2 seguimientos sin respuesta ANTES de hoy (agenda.py, reglas de mensajes)
        mal = []
        for t in sorted({m["tienda"] for m in hoy if m.get("tipo") != "respuesta"}):
            ant = [m for m in msgs if m["tienda"] == t and fecha(m.get("fecha")) and fecha(m["fecha"]) < HOY]
            ult_rec = max([fecha(m["fecha"]) for m in ant if m.get("direccion") == "recibido"], default=None)
            segs = [m for m in ant if m.get("direccion") == "enviado" and m.get("tipo") == "seguimiento"
                    and (not ult_rec or fecha(m["fecha"]) > ult_rec)]
            if len(segs) >= 2:
                mal.append(t)
        (R.error if mal else R.ok)(f"mensajes a tiendas frías hoy: {', '.join(mal) if mal else 'ninguno'}")
        (R.aviso if a["responder"] else R.ok)(f"tiendas que escribieron y esperan respuesta: {len(a['responder'])}"
                                              + (f" ({', '.join(f['tienda'] for f in a['responder'][:5])})" if a["responder"] else ""))
    except Exception as e:
        R.aviso(f"agenda.py no corrió: {e}")
    fila_actividad(R, "wa", ronda)


def mkt(R, ronda=False):
    cols, pcb = leer("precios-cochabamba.csv")
    falta = [c for c in ("fecha", "producto", "precio_bs", "estado", "fuente", "link", "tipo", "condiciones", "vigencia") if c not in (cols or [])]
    (R.error if falta else R.ok)(f"precios-cochabamba.csv: columnas {'faltan ' + ', '.join(falta) if falta else 'completas'}")
    _, vig = leer("vigilar.csv")
    prods = {v["producto"] for v in vig}
    for i, p in enumerate(pcb, 2):
        if p.get("tipo") not in ("publicado", "cotizado", "vendido", ""):
            R.error(f"precios-cochabamba.csv línea {i}: tipo '{p.get('tipo')}' (publicado | cotizado | vendido)")
        if fecha(p.get("fecha")) and fecha(p["fecha"]) >= date(2026, 10, 18) and not p.get("tipo"):
            R.error(f"precios-cochabamba.csv línea {i}: falta el tipo")
        if p.get("producto") not in prods:
            R.aviso(f"precios-cochabamba.csv línea {i}: '{p.get('producto')}' no está en vigilar.csv")
        try:
            v = float(str(p.get("precio_bs")).replace(",", "."))
            if not 50 <= v <= 60000:
                R.aviso(f"precios-cochabamba.csv línea {i}: precio raro (Bs {v:g})")
        except ValueError:
            R.error(f"precios-cochabamba.csv línea {i}: precio no numérico")
        if not p.get("fuente"):
            R.error(f"precios-cochabamba.csv línea {i}: sin fuente")
    claves = [(p.get("fecha"), p.get("producto"), p.get("precio_bs"), p.get("fuente"), p.get("link")) for p in pcb]
    dup = len(claves) - len(set(claves))
    (R.aviso if dup else R.ok)(f"precios locales duplicados: {dup}")
    cols, dem = leer("demanda.csv")
    for i, d in enumerate(dem, 2):
        for c in ("anuncios", "nuevos", "desaparecidos"):
            if d.get(c) and not d[c].isdigit():
                R.error(f"demanda.csv línea {i}: {c} no es un número")
    if ronda:
        hoy = [d for d in de_hoy(dem)]
        (R.ok if hoy else R.aviso)(f"conteo de demanda de hoy: {len(hoy)} productos")
    fila_actividad(R, "mkt", ronda)


def catalogos(R, ronda=False):
    _, cats = leer("catalogos.csv")
    for i, c in enumerate(cats, 2):
        arch = c.get("archivo", "")
        if arch and not os.path.exists(os.path.join(DIR, "oficina", arch)):
            R.error(f"catalogos.csv línea {i}: el archivo {arch} no está en oficina/")
        if arch and re.search(r"\.(exe|apk|dmg|zip|rar|bat|js|docm|xlsm)$", arch, re.I):
            R.error(f"catalogos.csv línea {i}: tipo de archivo prohibido")
        if c.get("productos") and not str(c["productos"]).isdigit():
            R.aviso(f"catalogos.csv línea {i}: productos tiene que ser un número entero ('{c['productos']}')")
        if c.get("formato") not in ("PDF", "JPG", "PNG", "WEBP", "XLSX", "CSV", "WEB"):
            R.aviso(f"catalogos.csv línea {i}: formato '{c.get('formato')}'")
        try:
            anot = int(c.get("precios_anotados") or 0)
        except ValueError:
            anot = -1
            R.error(f"catalogos.csv línea {i}: precios_anotados no es un número")
        if anot > 0:
            _, pcb = leer("precios-cochabamba.csv")
            hay = sum(1 for p in pcb if p.get("fecha") == c.get("fecha") and c.get("tienda", "").lower() in p.get("fuente", "").lower())
            if hay < anot:
                R.aviso(f"catalogos.csv línea {i}: dice {anot} precios anotados y en precios-cochabamba.csv hay {hay}")
    carpeta = os.path.join(DIR, "oficina", "catalogos")
    if os.path.isdir(carpeta):
        registrados = {os.path.basename(c.get("archivo", "")) for c in cats}
        sueltos = [f for f in os.listdir(carpeta) if f not in registrados and not f.startswith(".")]
        (R.aviso if sueltos else R.ok)(f"archivos de catálogo sin fila en catalogos.csv: {len(sueltos)}" + (f" ({', '.join(sueltos[:3])})" if sueltos else ""))
    R.ok(f"catálogos registrados: {len(cats)}")


def ebay(R, ronda=False):
    _, ee = leer("precios-eeuu.csv")
    _, vig = leer("vigilar.csv")
    prods = {v["producto"]: v for v in vig}
    for i, p in enumerate(ee, 2):
        if p.get("tipo") not in ("real", "estimado", "vendido"):
            R.error(f"precios-eeuu.csv línea {i}: tipo '{p.get('tipo')}' (real | estimado | vendido)")
        if p.get("condicion") not in ("nuevo", "usado", "openbox"):
            R.error(f"precios-eeuu.csv línea {i}: condición '{p.get('condicion')}'")
        if re.search(r"for parts|parts only|as is|untested|not working|broken|defective", p.get("fuente", ""), re.I):
            R.error(f"precios-eeuu.csv línea {i}: parece un anuncio para repuestos")
        if p.get("producto") not in prods:
            R.aviso(f"precios-eeuu.csv línea {i}: '{p.get('producto')}' no está en vigilar.csv")
    reales = [p for p in ee if p.get("tipo") == "real"]
    ult = max([fecha(p["fecha"]) for p in reales if fecha(p.get("fecha"))], default=None)
    (R.ok if ult and (HOY - ult).days <= 1 else R.aviso)(f"último precio real de eBay: {ult or 'nunca'}")
    sin = [n for n in prods if not any(p["producto"] == n and p.get("tipo") == "real" and fecha(p.get("fecha")) and (HOY - fecha(p["fecha"])).days <= 2 for p in ee)]
    (R.aviso if sin else R.ok)(f"productos sin precio real de eBay en 2 días: {len(sin)}" + (f" ({', '.join(sin[:4])}…)" if sin else ""))
    for n, v in prods.items():
        mx = v.get("precio_max_usd")
        hoy = [p for p in de_hoy(ee) if p["producto"] == n and p.get("tipo") == "real"]
        if mx and hoy and float(hoy[-1]["precio_usd"]) > float(mx) * 1.5:
            R.aviso(f"{n}: precio de hoy USD {hoy[-1]['precio_usd']} muy por encima del máximo ({mx}): ¿variante equivocada?")
    fila_actividad(R, "ebay", ronda)


def ana(R, ronda=False):
    ruta = os.path.join(DIR, "comparacion.md")
    if not os.path.exists(ruta):
        R.error("falta comparacion.md")
        return
    gen = datetime.fromtimestamp(os.path.getmtime(ruta))
    _, ee = leer("precios-eeuu.csv")
    _, pcb = leer("precios-cochabamba.csv")
    ult = max([fecha(p["fecha"]) for p in ee + pcb if fecha(p.get("fecha"))], default=None)
    (R.aviso if ult and gen.date() < ult else R.ok)(f"comparacion.md del {gen:%Y-%m-%d %H:%M} (último precio {ult})")
    _, fx = leer("tipo-cambio.csv")
    uf = fecha(fx[-1]["fecha"]) if fx else None
    (R.ok if uf and (HOY - uf).days <= 1 else R.aviso)(f"dólar del {uf or 'nunca'}")
    _, vig = leer("vigilar.csv")
    sin_local = [v["producto"] for v in vig if not any(p["producto"] == v["producto"] and "no cuenta" not in p.get("estado", "") for p in pcb)]
    (R.aviso if sin_local else R.ok)(f"productos sin precio local: {len(sin_local)}")
    fila_actividad(R, "ana", ronda)


def fin(R, ronda=False):
    cols, ven = leer("ventas.csv")
    falta = [c for c in ("fecha", "producto", "cantidad", "precio_bs", "canal", "estado", "cobrado_bs", "comision_bs") if c not in (cols or [])]
    (R.error if falta else R.ok)(f"ventas.csv: columnas {'faltan ' + ', '.join(falta) if falta else 'completas'}")
    for i, v in enumerate(ven, 2):
        if v.get("estado") not in ("reservada", "vendida", "devuelta", ""):
            R.error(f"ventas.csv línea {i}: estado '{v.get('estado')}' (reservada | vendida | devuelta)")
        for c in ("cantidad", "precio_bs"):
            try:
                float(str(v.get(c)).replace(",", "."))
            except ValueError:
                R.error(f"ventas.csv línea {i}: {c} no es un número")
        if re.search(r"\b\d{8}\b|\+591", v.get("notas", "")):
            R.error(f"ventas.csv línea {i}: la nota parece tener un teléfono")
    try:
        import finanzas
        f = finanzas.calcular()
        R.ok("finanzas.py corre: " + ("sin compras ni ventas todavía" if not f["hay_datos"] else
                                     f"{f['unidades_en_stock']} en stock, {f['unidades_vendidas']} vendidas"))
        if f.get("sin_costo_envio"):
            R.aviso("compras sin costo real del courier (ganancia estimada): " + ", ".join(f["sin_costo_envio"]))
        vend = {}
        for p in f["productos"]:
            if p["vendido"] > p["comprado"]:
                R.error(f"{p['producto']}: hay más vendidas ({p['vendido']}) que compradas ({p['comprado']})")
    except Exception as e:
        R.error(f"finanzas.py falla: {e}")
    fila_actividad(R, "fin", ronda)


def oficina(R, ronda=False):
    ruta = os.path.join(DIR, "oficina", "datos.js")
    if not os.path.exists(ruta):
        R.error("falta oficina/datos.js")
        return
    try:
        s = open(ruta, encoding="utf-8").read()
        d = json.loads(s[s.index("{"):s.rindex("}") + 1])
    except Exception as e:
        R.error(f"oficina/datos.js no se puede leer: {e}")
        return
    gen = datetime.strptime(d.get("generado", "2000-01-01 00:00"), "%Y-%m-%d %H:%M")
    ult = max(datetime.fromtimestamp(os.path.getmtime(os.path.join(DIR, n))) for n in CSVS if os.path.exists(os.path.join(DIR, n)))
    (R.aviso if gen < ult - timedelta(minutes=1) else R.ok)(f"datos.js generado {gen:%d/%m %H:%M}" +
                                                            (" (hay CSV más nuevos: correr oficina/generar.py)" if gen < ult - timedelta(minutes=1) else ""))
    prohibidos = [k for p in d.get("pedidos", []) for k in ("guia", "notas", "precio_usd") if k in p]
    (R.error if prohibidos else R.ok)(f"campos privados en los pedidos de la oficina: {len(prohibidos)}")
    if any("whatsapp" in t or "direccion" in t for t in d.get("tiendas", [])):
        R.error("la oficina tiene WhatsApp o dirección de tiendas")
    if any("notas" in v or "cliente" in v for v in d.get("ventas", [])):
        R.error("la oficina tiene notas o clientes de ventas")
    vencidos = [k for k, v in (d.get("frescura") or {}).items() if v and fecha(v) and (HOY - fecha(v)).days >= 3 and k not in ("catalogos", "pedidos")]
    (R.aviso if vencidos else R.ok)(f"datos de 3 días o más: {', '.join(vencidos) if vencidos else 'ninguno'}")
    for js in ("index.html", "oficina3d.js", "mapa.js", "gerente.js", "equipo.js", "pantallas.js", "archivo.js"):
        if not os.path.exists(os.path.join(DIR, "oficina", js)):
            R.error(f"falta oficina/{js}")


CHEQUEOS = {"comun": comun, "gerente": gerente, "wa": wa, "mkt": mkt, "catalogos": catalogos, "ebay": ebay,
            "ana": ana, "pedidos": pedidos, "fin": fin, "oficina": oficina}


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
