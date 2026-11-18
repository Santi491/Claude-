import http.server, os, sys
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")
SALIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "salida")

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=RAIZ, **k)
    def log_message(self, *a): pass
    def do_POST(self):
        if not self.path.startswith("/guardar/"):
            self.send_response(404); self.end_headers(); return
        ruta = os.path.join(SALIDA, self.path[len("/guardar/"):])
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        n = int(self.headers.get("Content-Length", 0))
        open(ruta, "wb").write(self.rfile.read(n))
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")

http.server.ThreadingHTTPServer(("127.0.0.1", 8766), H).serve_forever()
