"""Versión 2 de los 7 sonidos elegidos por Santi: cada nota suena hasta apagarse sola y la cola se desvanece (sin cortes)."""
import math
import os
import wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "v2")
os.makedirs(OUT, exist_ok=True)


def t_(dur):
    return np.arange(int(SR * dur)) / SR


def campana(f, dur=2.6, brillo=1.0, decay=1.0, vol=0.5):
    t = t_(dur)
    s = np.zeros_like(t)
    for r, amp, dk in ((1, 1, 1), (2.0, .45 * brillo, 1.5), (2.76, .3 * brillo, 2.0), (5.4, .14 * brillo, 3.2), (8.9, .06 * brillo, 4.5)):
        s += amp * np.sin(2 * math.pi * f * r * t) * np.exp(-t * 2.6 * dk / decay)
    return vol * s * np.minimum(1, t / 0.003)


def suave(f, dur=2.8, vol=0.35, ataque=0.03, caida=1.8):
    t = t_(dur)
    s = np.sin(2 * math.pi * f * t) + .22 * np.sin(2 * math.pi * f * 2 * t) + .06 * np.sin(2 * math.pi * f * 3 * t)
    return vol * s * np.minimum(1, t / ataque) * np.exp(-t * caida)


def pop(f0=280, f1=950, dur=1.4, vol=0.7):
    """burbuja: el barrido dura 0.1 s y después la nota queda resonando y se apaga sola"""
    t = t_(dur)
    barr = 0.1
    f = np.where(t < barr, f0 + (f1 - f0) * (t / barr) ** 0.6, f1)
    ph = 2 * math.pi * np.cumsum(f) / SR
    e = np.minimum(1, t / 0.004) * np.where(t < barr, 1.0, np.exp(-(t - barr) * 7.5))
    return vol * (np.sin(ph) + .15 * np.sin(2 * ph)) * e


def golpe(f=65, dur=1.2, vol=0.9):
    t = t_(dur)
    f_t = f * (1 + 1.5 * np.exp(-t * 30))
    ph = 2 * math.pi * np.cumsum(f_t) / SR
    ruido = np.random.default_rng(3).normal(0, 1, len(t)) * np.exp(-t * 55) * 0.22
    return vol * (np.sin(ph) * np.exp(-t * 6.5) + ruido) * np.minimum(1, t / 0.002)


def tic(f=1900, dur=1.0, vol=0.45):
    """tic de madera con resonancia: arranca seco y la nota se queda sonando un poco"""
    t = t_(dur)
    s = np.sin(2 * math.pi * f * t) * np.exp(-t * 9) * .6 + np.sin(2 * math.pi * f * 2.7 * t) * np.exp(-t * 40) * .4
    return vol * s * np.minimum(1, t / 0.001)


def moneda(f, dur=1.6, vol=0.3, semilla=0):
    t = t_(dur)
    rng = np.random.default_rng(semilla)
    s = np.zeros_like(t)
    for r in (1, 1.53, 2.31, 3.17, 4.08):
        s += np.sin(2 * math.pi * f * r * (1 + rng.uniform(-.004, .004)) * t) * np.exp(-t * (3.5 + 3 * r))
    return vol * s * np.minimum(1, t / 0.001)


def mezclar(partes, cola=1.0):
    fin = max(int(SR * o) + len(x) for o, x in partes) + int(SR * cola)
    out = np.zeros(fin)
    for o, x in partes:
        i = int(SR * o)
        out[i:i + len(x)] += x
    return out


def sala(x, tiempo=1.1, mezcla=0.22):
    """eco de sala (combs + allpass de Schroeder): deja una cola que se apaga sola"""
    def comb(s, d, g):
        k = int(SR * d)
        y = s.copy()
        for i in range(k, len(y), k):
            y[i:i + k] += g * y[i - k:i][:len(y[i:i + k])]
        return y
    def allpass(s, d, g):
        k = int(SR * d)
        y = np.zeros_like(s)
        y[:k] = -g * s[:k]
        for i in range(k, len(s), k):
            seg = s[i:i + k]
            y[i:i + len(seg)] = -g * seg + s[i - k:i - k + len(seg)] + g * y[i - k:i - k + len(seg)]
        return y
    w = sum(comb(x, d, 10 ** (-3 * d / tiempo)) for d in (0.0297, 0.0371, 0.0411, 0.0437)) / 4
    w = allpass(allpass(w, 0.005, 0.7), 0.0017, 0.7)
    return (1 - mezcla) * x + mezcla * w


def guardar(nombre, x):
    x = sala(x)
    # el último 35 % se apaga suave (curva de coseno), así nunca termina de golpe
    n = len(x)
    k = int(n * 0.35)
    x[-k:] *= 0.5 * (1 + np.cos(np.linspace(0, math.pi, k)))
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.85
    with wave.open(os.path.join(OUT, nombre + ".wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype(np.int16).tobytes())


N = {"E6": 1318.5, "A6": 1760.0, "A5": 880.0, "G4": 392.0, "D5": 587.33, "F4": 349.23, "A4": 440.0, "C5": 523.25, "E5": 659.25}

def tic_seco(f, dur, vol):
    t = t_(dur)
    return vol * np.sin(2 * math.pi * f * t) * np.exp(-t * 120)

guardar("oferta", mezclar([(0, tic_seco(3500, .05, .45)), (0.03, golpe(140, .4, .25)), (0.09, campana(N["A6"], 2.4, 1.2, 1.1, .5)),
                           (0.17, campana(N["E6"] * 2, 2.0, .8, .9, .28))], cola=0.8))
guardar("pedido", mezclar([(0, golpe(65, 1.3, .9)), (0.05, suave(N["G4"], 2.6, .35, .012, 1.6)), (0.05, suave(N["D5"], 2.6, .2, .012, 1.8))], cola=0.6))
guardar("decision", mezclar([(0, campana(N["A5"], 3.0, .6, 1.6, .5))], cola=0.4))
guardar("mensaje", mezclar([(0, pop(280, 950, 1.3, .7))], cola=0.5))
guardar("gerente", mezclar([(0, suave(N["F4"], 3.0, .3, .25, 1.2)), (0, suave(N["A4"], 3.0, .25, .25, 1.25)),
                            (0, suave(N["C5"], 3.0, .25, .25, 1.3)), (0.05, suave(N["E5"], 3.0, .2, .3, 1.35))], cola=0.5))
guardar("venta", mezclar([(0.00, moneda(2200, 1.5, .35, 1)), (0.06, moneda(2650, 1.5, .3, 2)), (0.11, moneda(1950, 1.6, .3, 3)),
                          (0.17, moneda(2900, 1.6, .25, 4))], cola=0.6))
guardar("ronda", mezclar([(0, tic(1900, 1.0, .5))], cola=0.4))
print("listo")
