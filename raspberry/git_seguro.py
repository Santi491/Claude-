#!/usr/bin/env python3
"""git pull que no se traba (Raspberry; lo usan vigilante.py y bot.py).

Santi, 10/11: "que la Raspberry detecte un conflicto de git, se recupere sola y te avise". Antes, si dos computadoras
escribían a la vez y git no podía juntar los cambios, la Pi quedaba a mitad de un merge: dejaba de ver los pedidos y de
subir su latido, y se notaba recién a las 7 horas ("Raspberry sin señal").

    import git_seguro
    problema = git_seguro.pull(REPO)   # "" si salió bien; si tuvo que arreglar algo, el texto para avisar a Santi

Pasos, del más suave al más fuerte:
1. Si quedó un merge o rebase a medias, o un index.lock viejo (de un git que se cortó), lo limpia.
2. git pull normal.
3. Si choca: lo deshace y vuelve a probar quedándose con la versión de GitHub solo en las líneas que chocan
   (lo demás que la Pi tenía se conserva).
4. Si igual no se puede tres veces seguidas (~1 hora y media de vigilante; así no se pisa un cambio que el bot esté
   haciendo en ese momento): guarda lo que la Pi tenía distinto en ~/cargo-respaldos/ (nada se pierde) y deja la carpeta
   igual a GitHub.
actividad.csv y sesiones.csv se juntan solos (.gitattributes, merge=union): son listas a las que todos agregan filas.
"""
import os
import subprocess
import time

FALLOS = os.path.expanduser("~/.cargo-git-fallos")   # pulls seguidos que no se pudieron arreglar


def _fallos(n=None):
    if n is None:
        try:
            return int(open(FALLOS).read().strip() or 0)
        except (OSError, ValueError):
            return 0
    open(FALLOS, "w").write(str(n))


def _git(repo, *a):
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, timeout=180)


def limpiar(repo):
    """Deja el repo sin operaciones a medias. Devuelve qué limpió ("" si nada)."""
    hecho = []
    gd = os.path.join(repo, ".git")
    lock = os.path.join(gd, "index.lock")
    if os.path.exists(lock) and time.time() - os.path.getmtime(lock) > 600:   # más de 10 min: el git que lo dejó murió
        os.remove(lock)
        hecho.append("index.lock viejo")
    if os.path.exists(os.path.join(gd, "MERGE_HEAD")):
        _git(repo, "merge", "--abort")
        hecho.append("merge a medias")
    if os.path.isdir(os.path.join(gd, "rebase-merge")) or os.path.isdir(os.path.join(gd, "rebase-apply")):
        _git(repo, "rebase", "--abort")
        hecho.append("rebase a medias")
    if any(l[:2] in ("UU", "AA", "DU", "UD", "AU", "UA", "DD")
           for l in _git(repo, "status", "--porcelain").stdout.splitlines()):
        _git(repo, "reset", "-q", "--merge")
        hecho.append("archivos en conflicto")
    return ", ".join(hecho)


def pull(repo):
    """git pull que siempre deja el repo usable. "" si salió bien; si no, qué pasó y qué hizo."""
    limpio = limpiar(repo)
    r = _git(repo, "pull", "--no-rebase", "--no-edit", "-q")
    if r.returncode == 0:
        _fallos(0)
        return f"había quedado {limpio} en la Raspberry; lo limpié y GitHub quedó al día" if limpio else ""
    if "Could not resolve host" in r.stderr or "unable to access" in r.stderr:
        return ""   # sin internet: no es un problema de git, el próximo turno lo vuelve a intentar
    limpiar(repo)
    r2 = _git(repo, "pull", "--no-rebase", "--no-edit", "-q", "-X", "theirs")
    if r2.returncode == 0:
        _fallos(0)
        return ("dos computadoras cambiaron lo mismo en GitHub y chocaron; me quedé con la versión de GitHub en las "
                "líneas que chocaban y seguí trabajando")
    # último recurso, recién al tercer intento seguido: respaldo de lo que la Pi tenía distinto y carpeta igual a GitHub
    limpiar(repo)
    if _fallos() < 2:
        _fallos(_fallos() + 1)
        return ""
    _fallos(0)
    if _git(repo, "fetch", "-q").returncode != 0:
        return ""
    dest = os.path.expanduser("~/cargo-respaldos")
    os.makedirs(dest, exist_ok=True)
    ruta = os.path.join(dest, time.strftime("%Y-%m-%d-%H%M") + ".patch")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(_git(repo, "diff", "@{u}").stdout)
    _git(repo, "reset", "-q", "--hard", "@{u}")
    return (f"git no pudo juntar los cambios de la Raspberry con los de GitHub ({(r2.stderr or r.stderr).strip()[:120]}). "
            f"Guardé lo que la Pi tenía distinto en {ruta} y dejé su carpeta igual a GitHub para que siga trabajando")


def subir(repo, msg, archivos):
    """add + commit + push con pull seguro entre intentos. Devuelve (subió, problema)."""
    _git(repo, "add", "-A", "--", *archivos)
    if _git(repo, "diff", "--cached", "--quiet").returncode == 0:
        return True, ""
    _git(repo, "commit", "-q", "-m", msg)
    problema = ""
    for _ in range(3):
        if _git(repo, "push", "-q").returncode == 0:
            return True, problema
        problema = pull(repo) or problema
    return False, problema
