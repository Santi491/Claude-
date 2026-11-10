"""La PC de la casa en la red, buscada por su MAC (Santi, 27/10).

El router reparte las IP solo (DHCP): tras un corte de luz o de internet la PC pasó de 192.168.0.6 a 192.168.0.21 y la
Raspberry, que la buscaba por IP fija, la daba por apagada aunque estuviera prendida. La MAC de la placa no cambia nunca,
así que se busca por la MAC en la tabla de vecinos (ARP) y, si no aparece, se hace un barrido rápido de la red.
PC_IP de ~/.cargo-bot queda solo como primer intento.
"""
import os
import subprocess
import time


def _vecinos():
    return subprocess.run(["ip", "neigh"], capture_output=True, text=True).stdout.lower().splitlines()


def _ip_de_mac(mac, solo_vivas=True):
    for l in _vecinos():
        if mac in l and (not solo_vivas or any(e in l for e in ("reachable", "stale", "delay", "probe"))):
            return l.split()[0]
    return None


def ip_pc(barrer=True):
    """La IP actual de la PC (o None si no está en la red)."""
    mac = (os.environ.get("PC_MAC") or "").lower().replace("-", ":")
    if not mac:
        return os.environ.get("PC_IP") or None
    ip = os.environ.get("PC_IP")
    if ip:   # primer intento: la IP de siempre
        subprocess.run(["ping", "-c", "1", "-W", "1", ip], capture_output=True)
    hallada = _ip_de_mac(mac)
    if hallada or not barrer:
        return hallada
    # barrido de la red de la casa (1 ping a cada dirección, en paralelo: ~2 segundos)
    base = (ip or "192.168.0.1").rsplit(".", 1)[0]
    procs = [subprocess.Popen(["ping", "-c", "1", "-W", "1", f"{base}.{i}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
             for i in range(1, 255)]
    for p in procs:
        p.wait()
    return _ip_de_mac(mac)


def _ips_de_mac(mac):
    """Todas las IP que la tabla de vecinos tiene con esa MAC (10/11: tras otro cambio de IP del router puede quedar la
    vieja en STALE junto a la nueva; antes se tomaba solo la primera y, si era la vieja, la PC salía apagada)."""
    return [l.split()[0] for l in _vecinos() if mac in l and "failed" not in l and "incomplete" not in l]


def _responde(ip, espera=9):
    """True si la placa de esa IP confirma por ARP. Si la entrada estaba STALE, Linux recién la vuelve a preguntar
    a los 5 segundos (DELAY -> PROBE): por eso se espera hasta `espera` s. Antes se esperaban ~4,5 s y la PC
    prendida salía apagada (alertas falsas del 29/10, 31/10, 03/11, 06/11 y 07/11)."""
    fin = time.time() + espera
    while time.time() < fin:
        subprocess.run(["ping", "-c", "1", "-W", "1", ip], capture_output=True)
        v = subprocess.run(["ip", "neigh", "show", ip], capture_output=True, text=True).stdout
        if "REACHABLE" in v:   # solo cuenta si contestó (STALE queda un rato aunque se haya apagado)
            return True
        if "FAILED" in v or not v.strip():
            return False
        time.sleep(1)
    return False


def pc_prendida():
    """True si la placa de red de la PC responde en la red (por MAC), False si no, None si no hay PC_MAC ni PC_IP."""
    if not os.environ.get("PC_MAC") and not os.environ.get("PC_IP"):
        return None
    mac = (os.environ.get("PC_MAC") or "").lower().replace("-", ":")
    ip = ip_pc()
    candidatas = ([ip] if ip else []) + ([i for i in _ips_de_mac(mac) if i != ip] if mac else [])
    if not candidatas:
        return False
    return any(_responde(i) for i in candidatas)
