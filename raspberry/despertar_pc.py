#!/usr/bin/env python3
"""Prende la PC de la casa por la red (Wake-on-LAN) antes de su ronda de las 16:00.

    python3 raspberry/despertar_pc.py            # manda el paquete mágico y espera a que la PC conteste
    python3 raspberry/despertar_pc.py --probar   # solo muestra a qué MAC y red lo mandaría

Lo corre el cron de la Raspberry de lunes a sábado a las 15:50 (ver raspberry/LEEME.md).
Necesita en ~/.cargo-bot:  PC_MAC=AA:BB:CC:DD:EE:FF  (la "Dirección física" de la tarjeta de red por cable de la PC)
y opcional  PC_IP=192.168.0.x  (para comprobar que prendió; si no está, no se comprueba).
La PC tiene que estar conectada al router por CABLE: la placa TUF B460M-PLUS no se prende por wifi.
Si la PC no contesta en 4 minutos, avisa a Santi por Telegram.
"""
import os
import socket
import subprocess
import sys
import time

DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(DIR))
from notificar import cargar, telegram  # noqa: E402

mac, ip = cargar("~/.cargo-bot", ("PC_MAC", "PC_IP"))


def paquete(mac):
    limpio = mac.replace(":", "").replace("-", "").strip()
    if len(limpio) != 12:
        sys.exit(f"PC_MAC no parece una MAC: {mac!r}")
    return bytes.fromhex("FF" * 6 + limpio * 16)


def mandar(p):
    destinos = ["255.255.255.255"]
    if ip and ip.count(".") == 3:
        destinos.append(ip.rsplit(".", 1)[0] + ".255")   # la red de la casa, por si el router no deja pasar el otro
    # la Raspberry está en la red por cable (eth0) y por wifi (wlan0): se manda por las dos
    for dev in (b"eth0", b"wlan0", None):
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            try:
                if dev:
                    s.setsockopt(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, dev)
                for d in destinos:
                    for puerto in (9, 7):
                        s.sendto(p, (d, puerto))
            except OSError:
                pass
    return destinos


def contesta(ip=None):
    """La PC está prendida si su placa de red responde en la red local (ARP), buscada por su MAC: el router cambia las
    IP tras un corte (27/10: pasó de .6 a .21). No se usa la respuesta del ping: el firewall de Windows no contesta pings."""
    sys.path.insert(0, DIR)
    import red
    return bool(red.pc_prendida())


def main():
    if not mac:
        sys.exit("Falta PC_MAC en ~/.cargo-bot")
    p = paquete(mac)
    if "--probar" in sys.argv:
        print(f"Mandaría el paquete a la MAC {mac} (comprobación en {ip or 'sin PC_IP'})")
        return
    if contesta():
        print("La PC ya estaba prendida.")
        return
    print("Paquete enviado a", ", ".join(mandar(p)), flush=True)
    for _ in range(24):          # hasta 4 minutos
        time.sleep(10)
        if contesta():
            print("La PC prendió.")
            return
        if _ in (5, 11):
            mandar(p)            # reintento
    try:
        telegram("Santi, intenté prender la PC para la ronda de las 16:00 y no respondió. "
                 "Revisa que esté enchufada y con el cable de red; si no, hoy la tarde queda sin ronda.")
    except Exception:
        pass
    print("La PC no contestó.")


if __name__ == "__main__":
    main()
