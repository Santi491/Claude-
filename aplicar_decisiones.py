#!/usr/bin/env python3
"""Pasa a los CSV lo que Santi aprobó, rechazó o dio por resuelto con los botones de la oficina.

La oficina guarda cada decisión en la colección `decisiones` de su base de datos (doc id = <tipo>-<ref>):
    {tipo: "plan" | "idea" | "necesidad", ref: <id de plan.csv | número de fila de ideas.csv o necesidades.csv>,
     decision: "aprobado" | "rechazado" | "resuelta", fecha: "AAAA-MM-DD", hora: "HH:MM", aplicado: false}
Las ventas que Santi anota en la pantalla de Finanzas llegan igual (doc id = venta-<código>):
    {tipo: "venta", producto, cantidad, precio_bs (por unidad), fecha, hora, aplicado: false}  → una fila en ventas.csv

Uso en cada ronda (local o Gerente), con la herramienta ArtifactData sobre la URL de la oficina:
    1. list de `decisiones` → guardar las que tengan aplicado false en un JSON (lista de {id, ...data})
    2. python3 aplicar_decisiones.py decisiones.json      → actualiza plan.csv, ideas.csv y necesidades.csv
    3. update de cada id que el script imprime como aplicado → {aplicado: true}

Nunca borra filas. Una decisión que ya está en el CSV se informa como aplicada igual (para marcarla).
"""
import csv
import json
import os
import sys

DIR = os.path.dirname(os.path.abspath(__file__))


def leer(nombre):
    with open(os.path.join(DIR, nombre), encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        return r.fieldnames, list(r)


def escribir(nombre, campos, filas):
    with open(os.path.join(DIR, nombre), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, campos, lineterminator="\n")
        w.writeheader()
        w.writerows(filas)


def main():
    if len(sys.argv) < 2:
        sys.exit("uso: python3 aplicar_decisiones.py decisiones.json")
    with open(sys.argv[1], encoding="utf-8") as f:
        decs = json.load(f)
    if isinstance(decs, dict):
        decs = decs.get("docs") or decs.get("documents") or list(decs.values())
    archivos = {"plan": "plan.csv", "idea": "ideas.csv", "necesidad": "necesidades.csv", "venta": "ventas.csv"}
    datos = {t: leer(n) for t, n in archivos.items() if t != "venta" and os.path.exists(os.path.join(DIR, n))}
    tocados, aplicados, actividad = set(), [], []
    for d in sorted(decs, key=lambda d: (d.get("fecha", ""), d.get("hora", ""))):
        d = {**(d.get("data") or {}), **{k: v for k, v in d.items() if k != "data"}}
        if d.get("aplicado"):
            continue
        tipo, ref, dec = d.get("tipo"), str(d.get("ref", "")), d.get("decision")
        if tipo == "venta":
            campos_v, filas_v = datos.setdefault("venta", leer("ventas.csv"))
            marca = f"oficina {d.get('id', '')}"
            if not any(r.get("notas") == marca for r in filas_v) and d.get("producto") and d.get("cantidad") and d.get("precio_bs"):
                filas_v.append({c: "" for c in campos_v} | {"fecha": d.get("fecha", ""), "producto": d["producto"], "cantidad": str(d["cantidad"]),
                                                            "precio_bs": str(d["precio_bs"]), "canal": "oficina", "notas": marca})
                tocados.add("venta")
                actividad.append(f"venta anotada desde la oficina: {d['cantidad']} × {d['producto']} a Bs {d['precio_bs']}")
            aplicados.append(d.get("id"))
            continue
        if tipo not in datos:
            continue
        cuando = f"oficina {d.get('fecha', '')[8:10]}/{d.get('fecha', '')[5:7]} {d.get('hora', '')}".strip()
        _, filas = datos[tipo]
        if tipo == "plan":
            fila = next((r for r in filas if r["id"] == ref), None)
            if fila and dec in ("aprobado", "rechazado"):
                if fila["estado"] == "propuesto":
                    fila["estado"], fila["decision"] = dec, cuando
                    tocados.add(tipo)
                    actividad.append(f"tarea {ref} {dec} desde la oficina")
                aplicados.append(d.get("id"))
        else:
            i = int(ref) - 1 if ref.isdigit() else -1
            fila = filas[i] if 0 <= i < len(filas) else None
            if fila is None:
                continue
            if tipo == "idea" and dec in ("aprobado", "rechazado"):
                if fila["estado"] == "propuesta":
                    fila["estado"] = "aprobada" if dec == "aprobado" else "rechazada"
                    fila["decision"] = cuando
                    tocados.add(tipo)
                    actividad.append(f"idea de {fila['agente']} {fila['estado']} desde la oficina")
                aplicados.append(d.get("id"))
            elif tipo == "necesidad" and dec == "resuelta":
                if fila.get("estado") != "resuelta":
                    fila["estado"], fila["resuelto"] = "resuelta", d.get("fecha", "")
                    tocados.add(tipo)
                    actividad.append(f"necesidad de {fila['agente']} resuelta por Santi en la oficina")
                aplicados.append(d.get("id"))
    for t in tocados:
        escribir(archivos[t], *datos[t])
    if actividad:
        from datetime import datetime
        from zoneinfo import ZoneInfo
        ahora = datetime.now(ZoneInfo("America/La_Paz"))
        with open(os.path.join(DIR, "actividad.csv"), "a", encoding="utf-8", newline="") as f:
            csv.writer(f, lineterminator="\n").writerow([ahora.strftime("%Y-%m-%d"), ahora.strftime("%H:%M"), "gerente",
                                                         "Decisiones de Santi en la oficina: " + "; ".join(actividad)])
    print(json.dumps({"aplicados": [a for a in aplicados if a], "cambios": actividad}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
