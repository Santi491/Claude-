"""PDF de tablas en Python puro, sin librerías (Santi, 18/11: el PDF del día tiene que salir en la nube a las 7:52,
y la nube no logra instalar reportlab). Usa las fuentes que trae todo lector de PDF (Helvetica), A4 apaisada,
título, nota, tabla con encabezado repetido en cada hoja, columnas a medida, texto que se corta en líneas
y color de fondo por celda.

    from pdf_simple import tabla_pdf
    tabla_pdf("salida.pdf", "Título", "nota…", columnas, filas, anchos_mm, alinear="LRR…", fondos={(fila, col): "#DDF1E6"})
"""
import zlib

_REG = {32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191, 40: 333, 41: 333, 42: 389, 43: 584,
        44: 278, 45: 333, 46: 278, 47: 278, 58: 278, 59: 278, 60: 584, 61: 584, 62: 584, 63: 556, 64: 1015,
        65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778, 72: 722, 73: 278, 74: 500, 75: 667, 76: 556,
        77: 833, 78: 722, 79: 778, 80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944, 88: 667,
        89: 667, 90: 611, 91: 278, 92: 278, 93: 278, 94: 469, 95: 556, 96: 333, 97: 556, 98: 556, 99: 500, 100: 556,
        101: 556, 102: 278, 103: 556, 104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556, 111: 556,
        112: 556, 113: 556, 114: 333, 115: 500, 116: 278, 117: 556, 118: 500, 119: 722, 120: 500, 121: 500, 122: 500,
        123: 334, 124: 260, 125: 334, 126: 584}
_BOLD = {32: 278, 33: 333, 34: 474, 35: 556, 36: 556, 37: 889, 38: 722, 39: 238, 40: 333, 41: 333, 42: 389, 43: 584,
         44: 278, 45: 333, 46: 278, 47: 278, 58: 333, 59: 333, 60: 584, 61: 584, 62: 584, 63: 611, 64: 975,
         65: 722, 66: 722, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778, 72: 722, 73: 278, 74: 556, 75: 722, 76: 611,
         77: 833, 78: 722, 79: 778, 80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944, 88: 667,
         89: 667, 90: 611, 91: 333, 92: 278, 93: 333, 94: 584, 95: 556, 96: 333, 97: 556, 98: 611, 99: 556, 100: 611,
         101: 556, 102: 333, 103: 611, 104: 611, 105: 278, 106: 278, 107: 556, 108: 278, 109: 889, 110: 611, 111: 611,
         112: 611, 113: 611, 114: 389, 115: 556, 116: 333, 117: 611, 118: 556, 119: 778, 120: 556, 121: 556, 122: 500,
         123: 389, 124: 280, 125: 389, 126: 584}
for _d in (_REG, _BOLD):
    for _c in range(48, 58):
        _d[_c] = 556
_BASE = str.maketrans("áéíóúÁÉÍÓÚñÑüÜ", "aeiouAEIOUnNuU")
_CAMBIOS = {"≥": ">=", "≤": "<=", "→": "->", "Δ": "Dif.", "−": "-", "—": "-", " ": " ", " ": " "}

MM = 72 / 25.4
ANCHO, ALTO = 841.89, 595.28          # A4 apaisada, en puntos
MARGEN = 10 * MM


def _limpiar(s):
    s = str(s)
    for a, b in _CAMBIOS.items():
        s = s.replace(a, b)
    return s.encode("cp1252", "replace").decode("cp1252")


def ancho(s, tam, negrita=False):
    w = _BOLD if negrita else _REG
    return sum(w.get(ord(c.translate(_BASE)), 556) for c in _limpiar(s)) * tam / 1000


def _esc(s):
    b = _limpiar(s).encode("cp1252")
    return b.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def _rgb(h):
    h = h.lstrip("#")
    return " ".join(f"{int(h[i:i + 2], 16) / 255:.3f}" for i in (0, 2, 4))


def _lineas(texto, max_ancho, tam, negrita=False):
    out, cur = [], ""
    for p in str(texto).split():
        prueba = (cur + " " + p).strip()
        if ancho(prueba, tam, negrita) <= max_ancho or not cur:
            cur = prueba
        else:
            out.append(cur)
            cur = p
    out.append(cur)
    return out or [""]


class _Hoja:
    def __init__(self):
        self.ops = [f"1 1 1 rg 0 0 {ANCHO} {ALTO} re f".encode()]   # fondo blanco (algunos visores lo dejan transparente)

    def texto(self, x, y, s, tam, negrita=False, color="#1F2021"):
        self.ops.append(f"BT /{'F2' if negrita else 'F1'} {tam:.2f} Tf {_rgb(color)} rg {x:.2f} {y:.2f} Td (".encode()
                        + _esc(s) + b") Tj ET")

    def rect(self, x, y, w, h, color):
        self.ops.append(f"{_rgb(color)} rg {x:.2f} {y:.2f} {w:.2f} {h:.2f} re f".encode())

    def linea(self, x1, y1, x2, y2, color="#D9DFE5", grosor=0.3):
        self.ops.append(f"{_rgb(color)} RG {grosor} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S".encode())


def tabla_pdf(ruta, titulo, nota, columnas, filas, anchos_mm, alinear=None, fondos=None, tam=7.0):
    """filas: listas de textos. anchos_mm: ancho de cada columna (None = reparte lo que sobra). alinear: 'L'/'R' por columna."""
    fondos = fondos or {}
    alinear = alinear or "L" * len(columnas)
    util = ANCHO - 2 * MARGEN
    fijos = sum(a * MM for a in anchos_mm if a)
    libres = [a for a in anchos_mm if not a]
    resto = (util - fijos) / len(libres) if libres else 0
    anchos = [a * MM if a else resto for a in anchos_mm]
    pad, alto_l = 2.5, tam * 1.2
    hojas, h = [], _Hoja()

    def encabezado(h, y):
        lin = [_lineas(c, w - 2 * pad, tam - 0.5, True) for c, w in zip(columnas, anchos)]
        alto = max(len(x) for x in lin) * alto_l + 2 * pad
        h.rect(MARGEN, y - alto, util, alto, "#15212B")
        x = MARGEN
        for ls, w, al in zip(lin, anchos, alinear):
            for i, l in enumerate(ls):
                tx = x + w - pad - ancho(l, tam - 0.5, True) if al == "R" else x + pad
                h.texto(tx, y - pad - (i + 0.8) * alto_l, l, tam - 0.5, True, "#FFFFFF")
            x += w
        return y - alto

    y = ALTO - MARGEN
    h.texto(MARGEN, y - 16, titulo, 16, True)
    y -= 26
    for l in _lineas(nota, util, 8.5):
        h.texto(MARGEN, y - 9, l, 8.5, False, "#444A50")
        y -= 11
    y = encabezado(h, y - 8)
    for fi, fila in enumerate(filas):
        lin = [_lineas(c, w - 2 * pad, tam) for c, w in zip(fila, anchos)]
        alto = max(len(x) for x in lin) * alto_l + 2 * pad
        if y - alto < MARGEN:
            hojas.append(h)
            h = _Hoja()
            y = encabezado(h, ALTO - MARGEN)
        x = MARGEN
        for ci, (ls, w, al) in enumerate(zip(lin, anchos, alinear)):
            if (fi, ci) in fondos:
                h.rect(x, y - alto, w, alto, fondos[(fi, ci)])
            for i, l in enumerate(ls):
                tx = x + w - pad - ancho(l, tam) if al == "R" else x + pad
                h.texto(tx, y - pad - (i + 0.8) * alto_l, l, tam)
            x += w
        y -= alto
        h.linea(MARGEN, y, MARGEN + util, y)
    hojas.append(h)
    for n, hj in enumerate(hojas, 1):
        if len(hojas) > 1:
            hj.texto(ANCHO - MARGEN - 40, MARGEN / 2, f"Hoja {n} de {len(hojas)}", 7, False, "#7A8088")

    # ---------- armado del archivo PDF ----------
    objs = []

    def nuevo(contenido):
        objs.append(contenido)
        return len(objs)

    f1 = nuevo(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    f2 = nuevo(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
    raiz_paginas = nuevo(None)
    kids = []
    for hj in hojas:
        datos = zlib.compress(b"\n".join(hj.ops))
        c = nuevo(b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(datos) + datos + b"\nendstream")
        kids.append(nuevo(f"<< /Type /Page /Parent {raiz_paginas} 0 R /MediaBox [0 0 {ANCHO} {ALTO}] "
                          f"/Resources << /Font << /F1 {f1} 0 R /F2 {f2} 0 R >> >> /Contents {c} 0 R >>".encode()))
    objs[raiz_paginas - 1] = f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {len(kids)} >>".encode()
    cat = nuevo(f"<< /Type /Catalog /Pages {raiz_paginas} 0 R >>".encode())
    info = nuevo(b"<< /Title (" + _esc(titulo) + b") /Producer (Cargo Brothers) >>")

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    pos = []
    for i, o in enumerate(objs, 1):
        pos.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % p for p in pos)
    out += b"trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, cat, info, xref)
    with open(ruta, "wb") as f:
        f.write(out)
