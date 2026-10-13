#!/usr/bin/env python3
"""Arma el informe del Gerente de Cargo Brothers como HTML listo para subir a Google Docs.

    python3 informe_gerente.py --tipo diario  [--fecha AAAA-MM-DD] [--analisis notas.md]
    python3 informe_gerente.py --tipo semanal [--fecha AAAA-MM-DD] [--analisis notas.md]

Escribe informes/gerente/AAAA-MM-DD-diario.html (o -semanal.html). Antes hay que correr metricas.py.
--analisis: texto del Gerente (párrafos separados por una línea en blanco; líneas que empiezan con "- " son viñetas).
El plan sale de plan.csv (estado "propuesto" o "aprobado" para los días siguientes).
"""
import argparse
import csv
import html
import os
from datetime import date, timedelta

from metricas import DIR, AGENTES, hoy_bolivia, leer, num

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
NOMBRE = {"nube": "Informe diario (nube)", "ebay": "Rastreador eBay", "wa": "WhatsApp", "mkt": "Marketplace y Messenger",
          "ana": "Analista", "pedidos": "Pedidos", "gerente": "Gerente"}
E = html.escape

CSS = ("font-family:Arial;font-size:10.5pt;color:#15212B")
TH = "background:#15212B;color:#FFFFFF"


def fecha_larga(f):
    d = date.fromisoformat(f)
    return f"{DIAS[d.weekday()]} {d.day} de {MESES[d.month - 1]} de {d.year}"


def tabla(cab, filas, num_cols=()):
    out = ['<table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;width:100%"><tr>'
           + "".join(f'<th style="{TH}">{E(c)}</th>' for c in cab) + "</tr>"]
    for f in filas:
        out.append("<tr>" + "".join(f'<td align="right">{c}</td>' if i in num_cols else f"<td>{c}</td>" for i, c in enumerate(f)) + "</tr>")
    out.append("</table>")
    return "".join(out)


def fmt(v, dec=0, pct=False):
    x = num(v)
    if x is None:
        return "—"
    if pct:
        return f"{x * 100:.0f} %"
    s = f"{x:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return s


def flecha(hoy, antes, mejor_si_sube=True):
    a, b = num(hoy), num(antes)
    if a is None or b is None or a == b:
        return "="
    sube = a > b
    bueno = sube == mejor_si_sube
    return f'<span style="color:{"#1F7A4D" if bueno else "#B23A3A"}">{"▲" if sube else "▼"}</span>'


def barra(v, maximo, ancho=20):
    x = num(v) or 0
    n = int(round(ancho * x / maximo)) if maximo else 0
    return f'<span style="font-family:Courier New;color:#C9701C">{"█" * n}</span><span style="font-family:Courier New;color:#D9DFE5">{"█" * (ancho - n)}</span>'


def analisis_html(ruta):
    if not ruta or not os.path.exists(ruta):
        return ""
    bloques = open(ruta, encoding="utf-8").read().strip().split("\n\n")
    out = []
    for b in bloques:
        lineas = b.strip().splitlines()
        if all(l.startswith("- ") for l in lineas):
            out.append("<ul>" + "".join(f"<li>{E(l[2:])}</li>" for l in lineas) + "</ul>")
        else:
            out.append(f"<p>{E(' '.join(lineas))}</p>")
    return "".join(out)


METRICAS_DIA = [  # (columna, etiqueta, decimales, % , sube es bueno)
    ("chats_nuevos", "Chats nuevos (límite 10)", 0, False, True),
    ("seguimientos", "Mensajes de seguimiento", 0, False, True),
    ("respuestas", "Respuestas de tiendas", 0, False, True),
    ("respuestas_con_precio", "Respuestas con precio", 0, False, True),
    ("tiendas_nuevas", "Tiendas nuevas contactadas", 0, False, True),
    ("tasa_respuesta_7d", "Tasa de respuesta (7 días)", 0, True, True),
    ("precios_locales_nuevos", "Precios nuevos de Cochabamba", 0, False, True),
    ("precios_ebay_nuevos", "Precios nuevos de eBay", 0, False, True),
    ("productos_con_precio_local", "Productos con precio local", 0, False, True),
    ("convienen", "Productos que conviene traer", 0, False, True),
    ("dolar_calculos", "Dólar para cálculos (Bs)", 2, False, False),
]


def seccion_metricas(m, ayer, semana):
    prom = lambda c: (sum(num(x[c]) or 0 for x in semana) / len(semana)) if semana else None
    filas = []
    for c, et, dec, pct, sube in METRICAS_DIA:
        filas.append([E(et), fmt(m.get(c), dec, pct), fmt(ayer.get(c) if ayer else None, dec, pct),
                      fmt(prom(c), 1 if not pct and dec == 0 else dec, pct), flecha(m.get(c), ayer.get(c) if ayer else None, sube)])
    return tabla(["Métrica", "Hoy", "Ayer", "Promedio 7 días", "Tendencia"], filas, num_cols=(1, 2, 3))


def seccion_embudo(m):
    total = num(m["tiendas_total"]) or 0
    pasos = [("Tiendas en la lista", m["tiendas_total"]), ("Contactadas en los últimos 7 días", m["tiendas_contactadas_7d"]),
             ("Respondieron (7 días)", m["tiendas_respondieron_7d"]), ("Esperando respuesta", m["tiendas_esperando"]),
             ("Cerradas (no venden, sin stock o sin WhatsApp)", m["tiendas_cerradas"])]
    return tabla(["Paso", "Tiendas", ""], [[E(p), fmt(v), barra(v, total)] for p, v in pasos], num_cols=(1,))


def seccion_mercado(fecha):
    hist = sorted(f for f in os.listdir(os.path.join(DIR, "historial")) if f[0] == "2" and f.endswith(".csv") and f[:10] <= fecha)
    if not hist:
        return "<p>Sin tabla de precios todavía.</p>"
    filas = [f for f in leer(os.path.join("historial", hist[-1])) if f.get("Estado") in ("Conviene", "Justo")]
    filas.sort(key=lambda f: -(num(f.get("Margen")) or 0))
    out = [[E(f["Producto"]), fmt(f["eBay nuevo USD"], 2), fmt(f["Costo puesto Bs"]), fmt(f["Mejor local Bs"]),
            fmt(f.get("Ganancia /u Bs")), fmt(f.get("Margen"), pct=True), E(f["Estado"])] for f in filas[:8]]
    return (tabla(["Producto", "eBay USD", "Costo puesto Bs", "Mejor local Bs", "Ganancia potencial /u", "Margen", "Estado"],
                  out, num_cols=(1, 2, 3, 4, 5))
            + '<p style="font-size:9pt;color:#5B6873">Ganancia potencial: sale de comparar precios, no de ventas reales. '
              "Pedido de 2 unidades con el courier más barato; aduana en 0 %.</p>")


def seccion_agentes(fecha, m):
    act = leer("actividad.csv")
    filas = []
    for a in AGENTES:
        suyas = [x for x in act if x["agente"] == a and x["fecha"] <= fecha]
        ult = suyas[-1] if suyas else None
        hoy = int(num(m.get(f"act_{a}")) or 0)
        estado = "trabajó hoy" if hoy else ("sin actividad hoy" if a not in ("gerente",) else "corre a las 20:00")
        color = "#1F7A4D" if hoy else "#9A6B00"
        filas.append([E(NOMBRE[a]), str(hoy), E(f"{ult['fecha'][8:10]}/{ult['fecha'][5:7]} {ult['hora']} · {ult['texto'][:110]}") if ult else "—",
                      f'<span style="color:{color}">{E(estado)}</span>'])
    return tabla(["Agente", "Acciones hoy", "Última actividad", "Estado"], filas, num_cols=(1,))


def seccion_plan(fecha):
    plan = [p for p in leer("plan.csv") if p["fecha_para"] > fecha and p["estado"] in ("propuesto", "aprobado")]
    if not plan:
        return "<p>Sin tareas propuestas.</p>"
    filas = []
    for p in plan:
        caja = "☑" if p["estado"] == "aprobado" else "☐"
        filas.append([caja, E(p["id"].rsplit("-", 1)[-1]), E(p["fecha_para"][8:10] + "/" + p["fecha_para"][5:7]), E(NOMBRE.get(p["agente"], p["agente"])),
                      E(p["tarea"]), E(p.get("motivo", "")), E(p["estado"])])
    return (tabla(["", "N.º", "Para", "Agente", "Tarea", "Por qué", "Estado"], filas)
            + '<p style="font-size:9.5pt;color:#5B6873">Para confirmar: marca la casilla de cada tarea que apruebas y escribe al lado lo que '
              'quieras cambiar, o dile a cualquier chat de Claude "apruebo 1, 2 y 4" o "cambia la 3 por…". Vale lo más reciente. '
              "Los agentes solo hacen las tareas aprobadas; lo que no se confirme no se hace.</p>")


def seccion_pedidos():
    ped = leer("pedidos.csv")
    if not ped:
        return "<p>Sin pedidos del negocio todavía. Las ganancias reales empiezan a contarse con la primera venta.</p>"
    return tabla(["Producto", "Tienda", "Estado", "Llega aprox."],
                 [[E(p["producto"]), E(p["tienda"]), E(p["estado"]), E(p.get("eta", ""))] for p in ped])


def cabecera(titulo, sub):
    return (f'<div style="{CSS}"><p style="font-size:9pt;letter-spacing:2px;color:#C9701C">CARGO BROTHERS · IMPORTACIÓN DE COMPONENTES</p>'
            f'<h1 style="font-size:20pt;margin:0">{E(titulo)}</h1><p style="color:#5B6873">{E(sub)}</p>')


def diario(fecha, analisis):
    met = {x["fecha"]: x for x in leer("metricas.csv")}
    if fecha not in met:
        raise SystemExit("Falta la fila del día en metricas.csv: corre primero python3 metricas.py")
    m = met[fecha]
    previas = sorted(f for f in met if f < fecha)
    ayer = met[previas[-1]] if previas else None
    semana = [met[f] for f in met if (date.fromisoformat(fecha) - timedelta(days=6)).isoformat() <= f <= fecha]
    alertas = [a for a in m["alertas"].split(" | ") if a]
    out = [cabecera("Informe del gerente", fecha_larga(fecha).capitalize() + " · informe diario"),
           "<h2>Lectura del gerente</h2>", analisis_html(analisis) or "<p>—</p>",
           "<h2>Métricas del día</h2>", seccion_metricas(m, ayer, semana),
           "<h2>Embudo de tiendas</h2>", seccion_embudo(m),
           "<h2>Qué conviene traer hoy</h2>", seccion_mercado(fecha),
           "<h2>Supervisión de los agentes</h2>", seccion_agentes(fecha, m),
           "<h2>Alertas</h2>", ("<ul>" + "".join(f"<li>{E(a)}</li>" for a in alertas) + "</ul>") if alertas else "<p>Ninguna.</p>",
           "<h2>Plan propuesto para mañana</h2>", seccion_plan(fecha),
           "<h2>Pedidos</h2>", seccion_pedidos(), "</div>"]
    return "".join(out)


def semanal(fecha, analisis):
    met = leer("metricas.csv")
    ini = (date.fromisoformat(fecha) - timedelta(days=6)).isoformat()
    semana = [x for x in met if ini <= x["fecha"] <= fecha]
    if not semana:
        raise SystemExit("No hay métricas de la semana en metricas.csv")
    prev = [x for x in met if (date.fromisoformat(ini) - timedelta(days=7)).isoformat() <= x["fecha"] < ini]
    suma = lambda filas, c: sum(num(x[c]) or 0 for x in filas)
    tot = [("chats_nuevos", "Chats nuevos"), ("seguimientos", "Seguimientos"), ("respuestas", "Respuestas"),
           ("respuestas_con_precio", "Respuestas con precio"), ("tiendas_nuevas", "Tiendas nuevas"),
           ("precios_locales_nuevos", "Precios nuevos de Cochabamba"), ("precios_ebay_nuevos", "Precios nuevos de eBay")]
    filas = [[E(et), fmt(suma(semana, c)), fmt(suma(prev, c)) if prev else "—", flecha(suma(semana, c), suma(prev, c) if prev else None)]
             for c, et in tot]
    u = semana[-1]
    filas += [["Productos con precio local", f'{fmt(u["productos_con_precio_local"])} de {fmt(u["productos_total"])}', "—", ""],
              ["Productos que conviene traer (último día)", fmt(u["convienen"]), "—", ""],
              ["Mejor oportunidad", E(f'{u["mejor_producto"]} ({fmt(u["mejor_margen"], pct=True)})'), "—", ""]]
    maxc = max([num(x["chats_nuevos"]) or 0 for x in semana] + [1])
    por_dia = [[E(fecha_larga(x["fecha"]).split(" de 20")[0]), fmt(x["chats_nuevos"]) + " " + barra(x["chats_nuevos"], maxc, 10),
                fmt(x["respuestas"]), fmt(x["precios_locales_nuevos"]), fmt(x["precios_ebay_nuevos"]), fmt(x["convienen"]),
                fmt(x["dolar_calculos"], 2), str(sum(int(num(x[f"act_{a}"]) or 0) for a in AGENTES))] for x in semana]
    alertas = sorted({a for x in semana for a in x["alertas"].split(" | ") if a})
    out = [cabecera("Resumen semanal del gerente", f"Semana del {fecha_larga(ini)} al {fecha_larga(fecha)}"),
           "<h2>Lectura del gerente</h2>", analisis_html(analisis) or "<p>—</p>",
           "<h2>Totales de la semana</h2>", tabla(["Métrica", "Esta semana", "Semana anterior", ""], filas, num_cols=(1, 2)),
           "<h2>Día por día</h2>", tabla(["Día", "Chats nuevos", "Respuestas", "Precios Cbba", "Precios eBay", "Convienen", "Dólar",
                                         "Acciones del equipo"], por_dia, num_cols=(2, 3, 4, 5, 6, 7)),
           "<h2>Embudo de tiendas (cierre de semana)</h2>", seccion_embudo(u),
           "<h2>Qué conviene traer</h2>", seccion_mercado(fecha),
           "<h2>Supervisión de los agentes (último día)</h2>", seccion_agentes(fecha, u),
           "<h2>Alertas de la semana</h2>", ("<ul>" + "".join(f"<li>{E(a)}</li>" for a in alertas) + "</ul>") if alertas else "<p>Ninguna.</p>",
           "<h2>Plan propuesto</h2>", seccion_plan(fecha),
           "<h2>Pedidos</h2>", seccion_pedidos(), "</div>"]
    return "".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tipo", choices=["diario", "semanal"], required=True)
    ap.add_argument("--fecha", default=hoy_bolivia())
    ap.add_argument("--analisis")
    a = ap.parse_args()
    cuerpo = diario(a.fecha, a.analisis) if a.tipo == "diario" else semanal(a.fecha, a.analisis)
    os.makedirs(os.path.join(DIR, "informes", "gerente"), exist_ok=True)
    ruta = os.path.join(DIR, "informes", "gerente", f"{a.fecha}-{a.tipo}.html")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(f"<html><head><meta charset='utf-8'></head><body>{cuerpo}</body></html>")
    print(ruta)


if __name__ == "__main__":
    main()
