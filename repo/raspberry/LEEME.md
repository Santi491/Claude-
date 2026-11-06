# Raspberry Pi: bot de Telegram del Gerente

La Raspberry Pi 3 B+ queda prendida y contesta a Santi por Telegram al momento.

- **Sin IA y sin gastar el plan Pro:** `apruebo 1 3`, `rechazo 2`, `sí a todo`, `no a todo`, `plan`, `tarea: ...` (o `tarea wa:` / `tarea mkt:`), `modelo haiku|sonnet|opus`, `uso`, `ayuda`. Las decisiones van a `plan.csv` y `actividad.csv` y se suben a GitHub.
- **El Gerente como persona (Claude Code con el plan Pro):** Santi le escribe como a su gerente ("hola, ¿cómo vamos?", "dile a WhatsApp que...") y le contesta en tono de chat, con lo que hizo cada agente y su opinión. Recuerda la charla del día (cada mañana empieza una nueva; `nueva charla` la reinicia). Lee el repo en modo solo lectura; cuando Santi acepta algo, el bot lo anota en `plan.csv` (líneas `ACCION:` del Gerente). Nunca escribe a tiendas ni compra.
- **Está atento a lo que le falta al equipo:** `necesidades` lista lo que piden los agentes y los huecos en los datos; `resuelta 2` marca algo como resuelto. Cuando un agente anota un pedido nuevo en `necesidades.csv`, el bot te avisa al momento (revisa cada 15 min, sin IA).
- **Escribe solo** a las 08:20 y 13:30 con cómo va el equipo (`AVISOS` en `~/.cargo-bot`; vacío = nunca). El informe de las 20:00 sigue llegando desde la nube.
- **Gasto:** modelo **sonnet** por defecto desde el 15/10 (habla más natural; pedido de Santi); `modelo haiku` gasta menos y `modelo opus` es para algo difícil. Tope de 20 mensajes con Claude por día (`MAX_PREGUNTAS_DIA`), contando los avisos.

## Instalación (una vez)
1. Graba la tarjeta con **Raspberry Pi OS Lite (64-bit)** usando Raspberry Pi Imager. En la configuración del Imager activa SSH, pon el WiFi y un usuario.
2. Entra a la Pi por SSH y clona el repo:
   ```
   git clone https://github.com/Santi491/Claude- cargo && cd cargo
   git checkout claude/agente-independiente-s3uc8z
   ```
3. Corre `bash raspberry/instalar.sh` y sigue lo que pide: token y chat ID del bot de Telegram (los mismos de la Mac), inicio de sesión de Claude (link para abrir en el celular) y de GitHub.
4. Escríbele `ayuda` al bot.

## Mantenimiento
- Ver qué está haciendo: `journalctl -u cargo-bot -f`
- Reiniciar después de un `git pull`: `sudo systemctl restart cargo-bot`
- Las claves están en `~/.telegram` y `~/.cargo-bot` (fuera del repo). Nunca subirlas.

## Convivencia con las otras sesiones
Mientras la Pi está prendida, ella lee Telegram. Si la nube, la PC o la Mac corren `telegram_leer.py` al mismo tiempo, Telegram puede rechazar a uno de los dos ("conflict"); la Pi reintenta sola a los 15 s. Si la Pi está apagada, todo sigue como antes.

## Prender la PC para la ronda de las 16:00 (Wake-on-LAN, 17/10)
La Raspberry prende la PC de la casa de lunes a sábado a las 15:50 con `despertar_pc.py`, y la ronda de la PC la apaga al terminar (`apagar_pc.ps1`, paso 8c de `PROCESO-LOCAL.md`) solo si nadie la estaba usando. Si la PC no responde en 4 minutos, avisa a Santi por Telegram.
1. En `~/.cargo-bot` agregar `PC_MAC=AA:BB:CC:DD:EE:FF` (la "Dirección física" del adaptador **Ethernet** en `ipconfig /all` de la PC) y `PC_IP=192.168.0.x` (su IPv4).
2. Probar: `python3 ~/cargo/raspberry/despertar_pc.py --probar`, y con la PC apagada, `python3 ~/cargo/raspberry/despertar_pc.py`.
3. Cron: `crontab -e` y agregar `50 15 * * 1-6 cd ~/cargo && python3 raspberry/despertar_pc.py >> ~/despertar.log 2>&1` (la Raspberry tiene que estar en hora de Bolivia: `timedatectl` debe decir America/La_Paz).
En la PC (lo hace Santi): cable de red al router; en la BIOS de la ASUS TUF B460M-PLUS (tecla Supr al prender) → Advanced → APM: **ErP Ready = Disabled** y **Power On By PCI-E = Enabled**; en Windows, Inicio rápido apagado (Panel de control → Opciones de energía → Elegir el comportamiento de los botones), en el Administrador de dispositivos → adaptador Ethernet Intel → Administración de energía y Opciones avanzadas: "Wake on Magic Packet" activado; inicio de sesión automático. Claude **no** va en las aplicaciones de inicio de Windows: la tarea de Windows **CargoBloqueo** corre `bloquear_si_no_es_ronda.ps1` al iniciar sesión y, si la PC arrancó de lunes a sábado entre las 15:40 y las 16:10, abre Claude para la ronda; a cualquier otra hora bloquea la pantalla al instante (Windows pide el PIN o la contraseña) y no abre Claude.
