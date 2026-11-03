#!/usr/bin/env python3
"""Objetivos de cada agente y etapa del negocio (Santi, 03/11). Lee objetivos.csv y mide el avance con los CSV del equipo.

    python3 objetivos.py                     # la etapa y todos los objetivos con su avance
    python3 objetivos.py wa                  # solo los de un agente (catálogos firma como mkt)
    python3 objetivos.py --json
    python3 objetivos.py --etapa 2           # ver los objetivos de otra etapa
    python3 objetivos.py hecho mkt-3 "nota"  # marca un entregable o un objetivo sin medida automática

Etapa: 1 producto en camino · 2 producto en mano (un pedido real en Cochabamba o entregado) · 3 vendiendo (primera venta).
La semana va de lunes a domingo. Mínimos y fechas los decide Santi: cambiarlos es editar objetivos.csv con su visto bueno.
"""
import csv
import json
import os
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

DIR = os.path.dirname(os.path.abspath(__file__))
ARCH = os.path.join(DIR, "objetivos.csv")
BASE_TIENDAS = 80   # T080 era la última tienda cuando empezaron los objetivos (03/11)
ETAPAS = {1: "producto en camino", 2: "producto en mano", 3: "vendiendo"}


def leer(n):
    ruta = os.path.join(DIR, n)
    return list(csv.DictReader(open(ruta, encoding="utf-8"))) if os.path.exists(ruta) else []


def es_si(v):
    return (v or "").strip().lower().startswith("s")


def medidas(hoy):
    lunes = (datetime.fromisoformat(hoy) - timedelta(days=datetime.fromisoformat(hoy).weekday())).date().isoformat()
    h14 = (datetime.fromisoformat(hoy) - timedelta(days=14)).date().isoformat()
    msj = [m for m in leer("mensajes.csv") if m["canal"] == "whatsapp"]
    tiendas, loc, ee = leer("tiendas-cochabamba.csv"), leer("precios-cochabamba.csv"), leer("precios-eeuu.csv")
    vig = [v["producto"] for v in leer("vigilar.csv")]

    def fuentes(p):
        return {x["fuente"] for x in loc if x["producto"] == p and x["fecha"] >= h14 and "no cuenta" not in x.get("estado", "")}
    ult = max((x["fecha"] for x in ee if x.get("tipo") == "real"), default="")
    act = [p for p in leer("pedidos.csv") + leer("pedidos-prueba.csv") if p.get("guia") and p.get("estado") not in ("entregado",)]
    dia = (datetime.fromisoformat(hoy) - timedelta(days=1)).date().isoformat()
    return {
        "wa_contactadas": len({m["tienda"] for m in msj if m["direccion"] == "enviado"}),
        "wa_con_precio_semana": len({m["tienda"] for m in msj if m["fecha"] >= lunes and es_si(m["con_precio"])}),
        "mkt_tiendas_nuevas": sum(1 for t in tiendas if t.get("id", "T0")[1:].isdigit() and int(t["id"][1:]) > BASE_TIENDAS and t.get("whatsapp")),
        "mkt_filas_7700x_semana": sum(1 for x in loc if x["producto"] == "Ryzen 7 7700X" and x["fecha"] >= lunes and "Marketplace" in x["fuente"]),
        "cat_precios_semana": sum(int(c.get("precios_anotados") or 0) for c in leer("catalogos.csv") if c["fecha"] >= lunes),
        "dem_dias_semana": len({d["fecha"] for d in leer("demanda.csv") if d["fecha"] >= lunes}),
        "ebay_productos_ultimo_dia": len({x["producto"] for x in ee if x["fecha"] == ult and x.get("tipo") == "real"}),
        "ebay_vendidos_semana": len({x["producto"] for x in ee if x["fecha"] >= lunes and x.get("tipo") == "vendido"}),
        "ana_firmes": sum(1 for p in vig if len(fuentes(p)) >= 2),
        "ped_al_dia_pct": round(100 * sum(1 for p in act if (p.get("actualizado") or "")[:10] >= dia) / len(act)) if act else 100,
    }


def etapa():
    if any(v.get("estado", "vendida") in ("vendida", "") for v in leer("ventas.csv")):
        return 3
    if any(p.get("estado") in ("en Cochabamba", "entregado") for p in leer("pedidos.csv")):
        return 2
    return 1


def main():
    argv = sys.argv[1:]
    ver = None
    if "--etapa" in argv:
        i = argv.index("--etapa")
        ver = argv[i + 1]
        del argv[i:i + 2]
    args = [a for a in argv if a != "--json"]
    if args[:1] == ["hecho"] and len(args) >= 2:
        filas = leer("objetivos.csv")
        if not any(f["id"] == args[1] for f in filas):
            sys.exit(f"No existe el objetivo {args[1]}")
        for f in filas:
            if f["id"] == args[1]:
                f["estado"], f["nota"] = "hecho", " ".join(args[2:])
        with open(ARCH, "w", encoding="utf-8", newline="") as a:
            w = csv.DictWriter(a, fieldnames=list(filas[0]), lineterminator="\n")
            w.writeheader()
            w.writerows(filas)
        print(f"{args[1]}: hecho")
        return
    hoy = datetime.now(ZoneInfo("America/La_Paz")).date().isoformat()
    med, salida = medidas(hoy), []
    e = etapa()
    for f in leer("objetivos.csv"):
        if (args and f["agente"] != args[0]) or (ver or str(e)) not in f["etapa"]:
            continue
        av = med.get(f["medida"]) if f["medida"] else None
        meta = int(f["meta"])
        cumplido = f["estado"] == "hecho" or (av is not None and av >= meta)
        salida.append({**f, "avance": av, "cumplido": cumplido, "vencido": not cumplido and f["tipo"] in ("acumulado", "entregable") and f["hasta"] and f["hasta"] < hoy})
    if "--json" in sys.argv:
        print(json.dumps({"etapa": e, "nombre": ETAPAS[e], "objetivos": salida}, ensure_ascii=False, indent=1))
        return
    print(f"Etapa {e}: {ETAPAS[e]}")
    if not args or args[0] in ("wa", "mkt"):
        print(f"Tiendas con número por contactar: {sum(1 for t in leer('tiendas-cochabamba.csv') if t.get('whatsapp') and t.get('estado_contacto', '').startswith('sin contactar'))}")
    for s in salida:
        marca = "OK " if s["cumplido"] else "VENCIDO" if s["vencido"] else "..."
        cifra = f"{s['avance']}/{s['meta']}" if s["avance"] is not None else (s["estado"] or "pendiente")
        plazo = f" (hasta {s['hasta'][8:]}/{s['hasta'][5:7]})" if s["hasta"] else ""
        print(f"  {marca} [{s['id']}] {s['agente']} · {cifra} · {s['objetivo']}{plazo}")


if __name__ == "__main__":
    main()
