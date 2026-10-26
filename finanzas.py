#!/usr/bin/env python3
"""Finanzas e inventario de Cargo Brothers: cuánto se invirtió, qué está en camino, qué hay en stock, qué se vendió y la ganancia real.

    python3 finanzas.py            # resumen en texto
    python3 finanzas.py --json     # para la oficina y el Gerente

Fuentes: pedidos.csv (compras reales; los de prueba no cuentan), ventas.csv (fecha, producto, cantidad, precio_bs, canal,
pedido_id, notas, estado reservada|vendida|devuelta, cobrado_bs = lo cobrado de esa fila, comision_bs = comisiones o gastos de
la venta) y tipo-cambio.csv (dólar del día de la compra). El costo de cada unidad es precio_usd + envio_usd
(el envío del courier, cuando ya se conoce) pasado a Bs con el dólar de la fecha de compra. Nunca inventa cifras:
si no hay compras ni ventas, lo dice.
"""
import argparse
import csv
import json
import os

DIR = os.path.dirname(os.path.abspath(__file__))
EN_STOCK = ("entregado",)
# Compras conjuntas con socios: total del pedido grande (todas las unidades, no solo las nuestras), en USD.
# Dato de Santi (20/10, notas de pedidos.csv: 14 u por USD 2.747,15). Se compara con nuestro costo por unidad
# en el paquete de pedidos.csv (columna paquete). Sin nombres de socios.
COMPRAS_CONJUNTAS = {
    "conjunto-7700x": {"producto": "Ryzen 7 7700X", "unidades": 14, "total_usd": 2747.15,
                       "fuente": "compra conjunta del 20/10 (dato de Santi)"},
}


def leer(nombre):
    ruta = os.path.join(DIR, nombre)
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


def dolar(fecha, fx):
    previos = [f for f in fx if f["fecha"] <= (fecha or "9999") and num(f.get("usado"))]
    f = previos[-1] if previos else (fx[-1] if fx else None)
    return num(f["usado"]) if f else None


def calcular():
    fx = sorted(leer("tipo-cambio.csv"), key=lambda f: f["fecha"])
    prod = {}
    sin_costo = []
    conj = {}   # paquete -> {"unidades", "costo_bs", "tc"} de nuestras unidades en compras conjuntas
    for p in leer("pedidos.csv"):
        n = int(num(p.get("cantidad")) or 1)
        usd, env = num(p.get("precio_usd")), num(p.get("envio_usd"))
        tc = num(p.get("tc")) or dolar(p.get("fecha_compra"), fx)   # tc = dólar real de la compra (20/10); si no, el del día
        x = prod.setdefault(p["producto"], {"producto": p["producto"], "comprado": 0, "en_camino": 0, "en_stock_bruto": 0,
                                             "vendido": 0, "costo_bs": 0.0, "unidades_con_costo": 0, "ventas_bs": 0.0,
                                             "reservado": 0, "devuelto": 0, "cobrado_bs": 0.0, "comisiones_bs": 0.0})
        x["comprado"] += n
        if (p.get("estado") or "").lower() in EN_STOCK:
            x["en_stock_bruto"] += n
        else:
            x["en_camino"] += n
        if usd is not None and tc:
            x["costo_bs"] += (usd + (env or 0)) * tc * n   # usd y envío por unidad
            x["unidades_con_costo"] += n
            if p.get("paquete") in COMPRAS_CONJUNTAS:
                c = conj.setdefault(p["paquete"], {"unidades": 0, "costo_bs": 0.0, "tc": tc})
                c["unidades"] += n
                c["costo_bs"] += (usd + (env or 0)) * tc * n
            if env is None:
                sin_costo.append(p["producto"])
    for v in leer("ventas.csv"):
        n = int(num(v.get("cantidad")) or 1)
        x = prod.setdefault(v["producto"], {"producto": v["producto"], "comprado": 0, "en_camino": 0, "en_stock_bruto": 0,
                                             "vendido": 0, "costo_bs": 0.0, "unidades_con_costo": 0, "ventas_bs": 0.0,
                                             "reservado": 0, "devuelto": 0, "cobrado_bs": 0.0, "comisiones_bs": 0.0})
        est = (v.get("estado") or "vendida").lower()
        if est.startswith("reserv"):
            x["reservado"] += n          # apartado por un cliente: sigue en stock pero no está disponible
            continue
        if est.startswith("devuel"):
            x["devuelto"] += n           # vuelve al stock; no suma venta
            continue
        x["vendido"] += n
        x["ventas_bs"] += (num(v.get("precio_bs")) or 0) * n
        cob = num(v.get("cobrado_bs"))
        x["cobrado_bs"] += cob if cob is not None else (num(v.get("precio_bs")) or 0) * n   # sin dato: se asume cobrada
        x["comisiones_bs"] += num(v.get("comision_bs")) or 0
    filas = []
    for x in prod.values():
        cu = x["costo_bs"] / x["unidades_con_costo"] if x["unidades_con_costo"] else None
        x["costo_unitario_bs"] = round(cu, 2) if cu else None
        x["en_stock"] = max(0, x["en_stock_bruto"] - x["vendido"])
        x["disponible"] = max(0, x["en_stock"] - x["reservado"])
        x["costo_vendido_bs"] = round(cu * x["vendido"], 2) if cu else None
        x["ganancia_bs"] = round(x["ventas_bs"] - x["costo_vendido_bs"] - x["comisiones_bs"], 2) if cu and x["vendido"] else None
        x["por_cobrar_bs"] = round(x["ventas_bs"] - x["cobrado_bs"], 2)
        x["cobrado_bs"], x["comisiones_bs"] = round(x["cobrado_bs"], 2), round(x["comisiones_bs"], 2)
        x["valor_stock_bs"] = round(cu * x["en_stock"], 2) if cu else None
        x["costo_bs"] = round(x["costo_bs"], 2)
        x["ventas_bs"] = round(x["ventas_bs"], 2)
        del x["en_stock_bruto"]
        filas.append(x)
    filas.sort(key=lambda x: x["producto"])
    comparativa = []
    for clave, ref in COMPRAS_CONJUNTAS.items():
        c = conj.get(clave)
        if not c or not c["unidades"]:
            continue
        nuestro = c["costo_bs"] / c["unidades"]
        promedio = ref["total_usd"] / ref["unidades"] * c["tc"]
        comparativa.append({
            "paquete": clave, "producto": ref["producto"],
            "nuestras_unidades": c["unidades"], "nuestro_costo_unitario_bs": round(nuestro, 2),
            "unidades_pedido_conjunto": ref["unidades"], "promedio_conjunto_usd": round(ref["total_usd"] / ref["unidades"], 2),
            "promedio_conjunto_bs": round(promedio, 2), "tc": c["tc"],
            "diferencia_bs": round(nuestro - promedio, 2),
            "diferencia_pct": round((nuestro - promedio) / promedio * 100, 1) if promedio else None,
            "fuente": ref["fuente"],
        })
    s = lambda k: round(sum(x[k] or 0 for x in filas), 2)
    ganancias = [x["ganancia_bs"] for x in filas if x["ganancia_bs"] is not None]
    return {
        "productos": filas,
        "invertido_bs": s("costo_bs"),
        "unidades_compradas": int(s("comprado")),
        "unidades_en_camino": int(s("en_camino")),
        "unidades_en_stock": int(s("en_stock")),
        "unidades_vendidas": int(s("vendido")),
        "unidades_reservadas": int(s("reservado")),
        "unidades_disponibles": int(s("disponible")),
        "unidades_devueltas": int(s("devuelto")),
        "cobrado_bs": s("cobrado_bs"),
        "por_cobrar_bs": s("por_cobrar_bs"),
        "comisiones_bs": s("comisiones_bs"),
        "dolar": (lambda f: {"fecha": f["fecha"], "usado": num(f.get("usado")), "fuente": f.get("fuente", "")} if f else None)(fx[-1] if fx else None),
        "ventas_bs": s("ventas_bs"),
        "ganancia_bs": round(sum(ganancias), 2) if ganancias else None,
        "valor_stock_bs": s("valor_stock_bs"),
        "sin_costo_envio": sorted(set(sin_costo)),
        "compras_conjuntas": comparativa,
        "hay_datos": bool(filas),
    }


def texto(f):
    if not f["hay_datos"]:
        return "Sin compras ni ventas del negocio todavía (los pedidos de prueba no cuentan)."
    bs = lambda v: "—" if v is None else f"Bs {v:,.0f}".replace(",", ".")
    l = [f"Invertido: {bs(f['invertido_bs'])} en {f['unidades_compradas']} unidades",
         f"En camino: {f['unidades_en_camino']} · en stock: {f['unidades_en_stock']} ({bs(f['valor_stock_bs'])}) · vendidas: {f['unidades_vendidas']}",
         f"Reservadas: {f['unidades_reservadas']} · disponibles: {f['unidades_disponibles']} · devueltas: {f['unidades_devueltas']}",
         f"Ventas: {bs(f['ventas_bs'])} · cobrado: {bs(f['cobrado_bs'])} · por cobrar: {bs(f['por_cobrar_bs'])} · comisiones: {bs(f['comisiones_bs'])}",
         f"Ganancia real (ventas − costo − comisiones): {bs(f['ganancia_bs'])}"]
    if f.get("dolar"):
        l.append(f"Dólar usado: {f['dolar']['usado']} Bs ({f['dolar']['fecha']}, {f['dolar']['fuente']})")
    for cc in f.get("compras_conjuntas", []):
        l.append(f"Compra conjunta ({cc['producto']}, {cc['nuestras_unidades']} u nuestras): costo por unidad nuestro "
                 f"{bs(cc['nuestro_costo_unitario_bs'])} vs promedio del pedido conjunto {bs(cc['promedio_conjunto_bs'])} "
                 f"({'+' if cc['diferencia_bs'] >= 0 else '−'}{bs(abs(cc['diferencia_bs']))}, "
                 f"{cc['diferencia_pct']:+.1f} %".replace(".", ",") + f"; dólar {cc['tc']} Bs, {cc['fuente']})")
    if f["sin_costo_envio"]:
        l.append("Sin costo de envío cargado (la ganancia sale sin el courier): " + ", ".join(f["sin_costo_envio"]))
    for x in f["productos"]:
        l.append(f"- {x['producto']}: {x['comprado']} comprados, {x['en_camino']} en camino, {x['en_stock']} en stock, "
                 f"{x['vendido']} vendidos · costo {bs(x['costo_unitario_bs'])}/u · ganancia {bs(x['ganancia_bs'])}")
    return "\n".join(l)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    f = calcular()
    print(json.dumps(f, ensure_ascii=False, indent=2) if a.json else texto(f))


if __name__ == "__main__":
    main()
