#!/usr/bin/env python3
"""Alertas por Telegram: avisa a Santi al momento cuando algo cambia de verdad.

    python3 alertas.py              # revisa y manda las alertas nuevas con notificar.py
    python3 alertas.py --probar     # muestra lo que mandaría, sin mandar ni guardar nada
    python3 alertas.py --inicializar   # guarda el estado actual como ya avisado, sin mandar (para no avisar lo de siempre)

Avisa cuando:
  1. el precio real de eBay de un producto (nuevo o usado, con envío en EE.UU.) bajó 10 % o más respecto del día anterior con dato;
  2. un producto pasa a convenir: margen ≥ 15 % sobre el mejor precio de Cochabamba (pedido de 2 unidades, courier más barato,
     mismos supuestos que comparar.py);
  3. el dólar USDT usado en los cálculos se movió 1 % o más respecto del día anterior.
Cada alerta se manda una sola vez: `alertas-estado.json` guarda lo ya avisado (lo comparten la nube y las rondas locales por git).
Se corre después de comparar.py en la revisión de la nube (7:52) y al final de cada ronda local.
"""
import json
import os
import subprocess
import sys
from datetime import datetime

import comparar as C

DIR = os.path.dirname(os.path.abspath(__file__))
ESTADO = os.path.join(DIR, "alertas-estado.json")
BAJA, DOLAR = 0.10, 0.01


def num(v):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


def revisar():
    vig, eeuu, cbba = C.leer("vigilar.csv"), C.leer("precios-eeuu.csv"), C.leer("precios-cochabamba.csv")
    cbba = [f for f in cbba if (f.get("precio_bs") or "").strip()]   # "agotado" sin precio: no entra en los cálculos
    fx = [f for f in C.leer("tipo-cambio.csv") if num(f.get("usado"))]
    tc = num(fx[-1]["usado"]) if fx else 11.9
    est = json.load(open(ESTADO, encoding="utf-8")) if os.path.exists(ESTADO) else {}
    avisados, conviene_antes = est.get("avisados", {}), est.get("conviene", {})
    nuevas, conviene = [], {}
    for v in vig:
        prod, peso = v["producto"], num(v["peso_g_con_caja"]) or 350
        for cond in ("nuevo", "usado"):
            reales = [f for f in eeuu if f["producto"] == prod and f["condicion"] == cond and f["tipo"] == "real" and num(f["precio_usd"])]
            por_dia = {}
            for f in sorted(reales, key=lambda f: f["fecha"]):
                por_dia[f["fecha"]] = num(f["precio_usd"]) + (num(f["envio_usd"]) or 0)
            dias = sorted(por_dia)
            if len(dias) >= 2:
                a, b = por_dia[dias[-2]], por_dia[dias[-1]]
                clave = f"baja|{prod}|{cond}|{dias[-1]}"
                if a and (a - b) / a >= BAJA and clave not in avisados:
                    nuevas.append((clave, f"⬇ {prod} ({cond}) bajó {(a - b) / a:.0%} en eBay: USD {a:,.2f} → {b:,.2f}"))
            # margen con el mismo cálculo de comparar.py
            of, loc = C.oferta(eeuu, prod, cond), C.locales(cbba, prod)
            if of and loc:
                c2, via = C.costo(of, peso, 2, tc, C.A_TAX_DEF, 0)
                p = min(float(f["precio_bs"]) for f in loc)
                m = (p - c2) / p
                k = f"{prod}|{cond}"
                conviene[k] = m >= C.CONVIENE
                if conviene[k] and not conviene_antes.get(k):
                    nuevas.append((f"conviene|{k}|{datetime.now():%Y-%m-%d}",
                                   f"✅ Ahora conviene {prod} ({cond}): +{m:.0%} · costo puesto Bs {C.bs(c2)} vs Bs {C.bs(p)} en Cochabamba"))
    if len(fx) >= 2:
        a, b = num(fx[-2]["usado"]), num(fx[-1]["usado"])
        clave = f"dolar|{fx[-1]['fecha']}"
        if a and abs(b - a) / a >= DOLAR and clave not in avisados:
            nuevas.append((clave, f"💵 El dólar USDT pasó de {a:.2f} a {b:.2f} Bs ({(b - a) / a:+.1%}): cambia la ganancia de todo"))
    return nuevas, est, conviene


def main():
    probar, inicial = "--probar" in sys.argv, "--inicializar" in sys.argv
    nuevas, est, conviene = revisar()
    if inicial:
        print(f"Estado inicial guardado: {len(nuevas)} avisos marcados como ya conocidos, sin mandar nada.")
    elif not nuevas:
        print("Sin alertas nuevas.")
    else:
        texto = "Cargo Brothers · alertas\n" + "\n".join(t for _, t in nuevas)
        print(texto)
        if not probar and not inicial:
            r = subprocess.run([sys.executable, os.path.join(DIR, "notificar.py"), texto], capture_output=True, text=True)
            print(r.stdout.strip() or r.stderr.strip())
            if r.returncode != 0:   # sin canal o falló: no se marca como avisado, la próxima ronda lo intenta de nuevo
                print("No se pudo avisar: las alertas quedan pendientes para la próxima ronda.")
                return
    if not probar:
        av = est.get("avisados", {})
        for k, t in nuevas:
            av[k] = datetime.now().strftime("%Y-%m-%d %H:%M")
        est |= {"avisados": av, "conviene": conviene, "ultimas": ([] if inicial else [t for _, t in nuevas]) or est.get("ultimas", []),
                "revisado": datetime.now().strftime("%Y-%m-%d %H:%M")}
        with open(ESTADO, "w", encoding="utf-8") as f:
            json.dump(est, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
