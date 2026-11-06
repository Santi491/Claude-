"""Servidor local para convertir los FBX de Mixamo a GLB livianos con three.js en el navegador.
GET  /mixamo/...     -> archivos de C:\\Users\\WinterOS\\Documents\\mixamo (solo lectura)
GET  /...            -> esta carpeta (la página del conversor)
POST /guardar?n=x    -> guarda el cuerpo en C:\\Users\\WinterOS\\Documents\\mixamo\\web\\x  (solo nombres simples)
"""
import http.server, os, re, sys, urllib.parse

AQUI = os.path.dirname(os.path.abspath(__file__))
MIX = r"C:\Users\WinterOS\Documents\mixamo"
OUT = os.path.join(MIX, "web")
os.makedirs(OUT, exist_ok=True)


class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = urllib.parse.unquote(urllib.parse.urlparse(path).path)
        if p.startswith("/mixamo/"):
            rel = p[len("/mixamo/"):]
            full = os.path.normpath(os.path.join(MIX, rel))
            if not full.startswith(MIX):
                return os.path.join(AQUI, "404")
            return full
        return os.path.normpath(os.path.join(AQUI, p.lstrip("/")))

    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        n = (q.get("n") or [""])[0]
        if not re.fullmatch(r"[a-z0-9_\-]+\.(glb|json|jpg)", n):
            self.send_error(400, "nombre no permitido"); return
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        with open(os.path.join(OUT, n), "wb") as f:
            f.write(data)
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
        print("guardado", n, len(data), flush=True)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8767
    http.server.ThreadingHTTPServer(("127.0.0.1", puerto), H).serve_forever()
