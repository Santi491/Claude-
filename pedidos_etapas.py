#!/usr/bin/env python3
"""Etapas de los pedidos que no tienen rastreo (Santi, 10/11): lo corre el agente Pedidos al empezar su turno.

    python3 pedidos_etapas.py            # aplica y cuenta qué cambió
    python3 pedidos_etapas.py --probar   # solo muestra qué haría

Del courier de Miami a Bolivia NO hay código de seguimiento (Santi, 10/11): ese tramo solo se sabe por Santi.
Etapas: comprado → enviado → en bodega del courier → en camino a Santa Cruz → en camino a Cochabamba →
en Cochabamba → entregado.
- A los 2 días de llegar a la bodega del courier, el pedido pasa solo a "en camino a Santa Cruz" (estimado; el
  courier suele despacharlo en 2 a 3 días). Desde ahí avanza solo con lo que diga Santi:
  llegó a Santa Cruz → "en camino a Cochabamba"; llegó a Cochabamba (lo va a recoger) → "en Cochabamba";
  lo recogió / ya lo tiene → "entregado".
- Si a los 7 días de salir hacia Santa Cruz Santi no avisó nada, se le pregunta UNA sola vez (una fila en
  necesidades.csv por paquete; nunca se repite, aunque siga abierta: Santi, 10/11, no quiere que le pregunten varias veces).
"""
import csv
import os
import sys
from datetime import datetime, timedelta

RAIZ = os.path.dirname(os.path.abspath(__file__))
PROBAR = "--probar" in sys.argv
DIAS_A_SCZ = 2        # días en la bodega del courier hasta darlo por despachado
DIAS_PREGUNTA = 7     # días "en camino a Santa Cruz" sin noticias hasta preguntarle a Santi (una vez)
NOTA_AUTO = "en camino a Santa Cruz estimado: el courier no da rastreo de Miami a Bolivia; lo confirma Santi"


def leer(nombre):
    ruta = os.path.join(RAIZ, nombre)
    if not os.path.exists(ruta):
        return [], []
    with open(ruta, encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        return r.fieldnames, list(r)


def escribir(nombre, campos, filas):
    if PROBAR:
        return
    ruta = os.path.join(RAIZ, nombre)
    with open(ruta, encoding="utf-8", newline="") as f:
        fin = "\r\n" if "\r\n" in f.read() else "\n"
    with open(ruta, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos, lineterminator=fin)
        w.writeheader()
        w.writerows(filas)


def fecha_de(texto):
    try:
        return datetime.strptime((texto or "")[:10], "%Y-%m-%d")
    except ValueError:
        return None


def main():
    hoy = datetime.now()
    _, seg = leer("seguimiento.csv")
    cn, necesidades = leer("necesidades.csv")
    hechos = []
    for archivo in ("pedidos.csv", "pedidos-prueba.csv"):
        campos, filas = leer(archivo)
        cambio = False
        for p in filas:
            ev = [s for s in seg if s["id"] == p["id"]]
            ultimo = max((fecha_de(s["fecha"]) for s in ev if fecha_de(s["fecha"])), default=None)
            if p["estado"] == "en bodega del courier":
                desde = ultimo or fecha_de(p.get("actualizado"))
                if desde and (hoy - desde).days >= DIAS_A_SCZ:
                    p["estado"] = "en camino a Santa Cruz"
                    p["eta"] = ""
                    if NOTA_AUTO not in p["notas"]:
                        p["notas"] = (p["notas"] + " " if p["notas"] else "") + f"{hoy:%d/%m}: {NOTA_AUTO}."
                    cambio = True
                    hechos.append(f"{p['id']}: en bodega desde el {desde:%d/%m} → en camino a Santa Cruz (estimado)")
            elif p["estado"] == "en camino a Santa Cruz" and ultimo and (hoy - ultimo).days >= DIAS_PREGUNTA:
                clave = f"[{p.get('paquete') or p['id']}]"   # una pregunta por paquete (varias compras viajan juntas)
                if not any(clave in n["necesita"] for n in necesidades):   # una sola vez por pedido
                    necesidades.append({"fecha": f"{hoy:%Y-%m-%d}", "hora": f"{hoy:%H:%M}", "agente": "pedidos",
                                        "necesita": f"¿Ya llegó a Santa Cruz el paquete de {p['producto']} {clave}? Salió de la bodega del courier "
                                                    f"hace unos {(hoy - ultimo).days} días y no hay rastreo de ese tramo",
                                        "para_que": "marcarlo en camino a Cochabamba (o en Cochabamba) en la oficina",
                                        "quien": "Santi", "estado": "abierta", "resuelto": ""})
                    hechos.append(f"{clave}: pregunta única a Santi si llegó a Santa Cruz")
                    escribir("necesidades.csv", cn, necesidades)
        if cambio:
            escribir(archivo, campos, filas)
    print("\n".join(hechos) if hechos else "sin cambios de etapa")


if __name__ == "__main__":
    main()
