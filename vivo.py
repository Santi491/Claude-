#!/usr/bin/env python3
"""Estado en vivo de la ronda para la app de iPhone (Santi, 18/11: "el foquito rojo cuando hay una ronda en curso").

La oficina ya lo lee de su base (colección `vivo`, con ArtifactData). La app lo lee de `vivo.json` en GitHub, que escribe
este script. NO toca la carpeta de trabajo ni el índice: arma el commit directo sobre la rama remota (git plumbing) y lo
sube, así no choca con lo que la ronda tiene sin guardar. Si falla (sin internet, otro push en el medio tres veces),
avisa y sigue: nunca frena la ronda.

    python vivo.py empezar "PC de la casa"            # ronda en curso (foquito rojo en la app)
    python vivo.py agente wa trabajando "Leyendo los chats sin leer"
    python vivo.py agente wa terminó "3 respuestas, 1 precio"
    python vivo.py terminar                           # sin ronda en curso
    python vivo.py ver                                # muestra lo que hay en GitHub
"""
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime
from zoneinfo import ZoneInfo

DIR = os.path.dirname(os.path.abspath(__file__))
RAMA = "claude/agente-independiente-s3uc8z"
ARCH = "vivo.json"
AGENTES = ("gerente", "wa", "mkt", "cat", "ebay", "ana", "pedidos", "fin", "dem", "oficina", "nube")


def git(*a, env=None, entrada=None):
    # git en español escribe acentos en la consola: se lee siempre como UTF-8 sin romperse, y en inglés (LC_ALL=C)
    env = dict(env or os.environ, LC_ALL="C", LANG="C")
    return subprocess.run(["git", *a], cwd=DIR, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env, input=entrada)


def ahora():
    return datetime.now(ZoneInfo("America/La_Paz"))


def leer_remoto():
    r = git("show", f"origin/{RAMA}:{ARCH}")
    try:
        return json.loads(r.stdout) if r.returncode == 0 else {}
    except ValueError:
        return {}


def cambiar(f):
    for _ in range(3):
        if git("fetch", "-q", "origin", RAMA).returncode != 0:
            print("vivo: no pude leer GitHub (sin internet?)")
            return False
        estado = leer_remoto()
        f(estado)
        estado["actualizado"] = ahora().strftime("%Y-%m-%d %H:%M")
        blob = git("hash-object", "-w", "--stdin", entrada=json.dumps(estado, ensure_ascii=False, indent=1) + "\n").stdout.strip()
        with tempfile.TemporaryDirectory() as td:
            env = dict(os.environ, GIT_INDEX_FILE=os.path.join(td, "indice"))
            git("read-tree", f"origin/{RAMA}", env=env)
            git("update-index", "--add", "--cacheinfo", f"100644,{blob},{ARCH}", env=env)
            arbol = git("write-tree", env=env).stdout.strip()
        commit = git("commit-tree", arbol, "-p", f"origin/{RAMA}", "-m", "Vivo: " + texto_corto(estado)).stdout.strip()
        if commit and git("push", "-q", "origin", f"{commit}:refs/heads/{RAMA}").returncode == 0:
            return True
    print("vivo: no se pudo subir (otro push en el medio); sigo sin vivo")
    return False


def texto_corto(e):
    r = e.get("ronda", {})
    return ("ronda en curso" if r.get("activa") else "sin ronda") + (f" ({r.get('quien')})" if r.get("quien") else "")


def main():
    a = sys.argv[1:]
    if not a or a[0] == "ver":
        git("fetch", "-q", "origin", RAMA)
        print(json.dumps(leer_remoto(), ensure_ascii=False, indent=1))
        return
    h = ahora().strftime("%H:%M")
    if a[0] == "empezar":
        quien = a[1] if len(a) > 1 else "PC de la casa"
        ok = cambiar(lambda e: e.update(ronda={"activa": True, "quien": quien, "desde": h, "fecha": ahora().strftime("%Y-%m-%d")}, agentes={}))
    elif a[0] == "terminar":
        def fin(e):
            r = e.get("ronda", {})
            r.update(activa=False, hasta=h)
            e["ronda"] = r
            for v in e.get("agentes", {}).values():
                if v.get("estado") == "trabajando":
                    v["estado"] = "terminó"
        ok = cambiar(fin)
    elif a[0] == "agente" and len(a) >= 3:
        ag, est, txt = a[1], a[2], " ".join(a[3:])[:140]
        if ag not in AGENTES:
            sys.exit(f"agente desconocido: {ag} ({', '.join(AGENTES)})")
        ok = cambiar(lambda e: e.setdefault("agentes", {}).__setitem__(ag, {"estado": est, "texto": txt, "hora": h}))
    else:
        sys.exit(__doc__)
    print("vivo:", "ok" if ok else "sin subir")


if __name__ == "__main__":
    main()
