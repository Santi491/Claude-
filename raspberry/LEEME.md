# Raspberry Pi: bot de Telegram del Gerente

La Raspberry Pi 3 B+ de Santi queda prendida (instalada desde el 14/10/2026; usuario `santi`; en la red de la casa se llama `cargobrothers.local`, entrar con `ssh santi@cargobrothers.local` porque la IP cambia; arranca sola al enchufarla). Contesta a Santi por Telegram al momento, vigila que las rondas corran, prende la PC y busca ofertas en eBay. La personalidad del Gerente y lo que puede hacer están en el skill `gerente`; acá está cómo funciona por dentro.

- **Sin IA y sin gastar el plan Pro:** `apruebo 1 3`, `rechazo 2`, `sí a todo`, `no a todo`, `plan`, `tarea: ...` (o `tarea wa:` / `tarea mkt:`), `modelo haiku|sonnet|opus`, `uso`, `ayuda`. Las decisiones van a `plan.csv` y `actividad.csv` y se suben a GitHub.
- **El Gerente como persona (Claude Code con el plan Pro):** Santi le escribe como a su gerente ("hola, ¿cómo vamos?", "dile a WhatsApp que...") y le contesta en tono de chat, con lo que hizo cada agente y su opinión. Recuerda la charla del día (cada mañana empieza una nueva; `nueva charla` la reinicia). Lee el repo en modo solo lectura; cuando Santi acepta algo, el bot lo anota en `plan.csv` (líneas `ACCION:` del Gerente). Nunca escribe a tiendas ni compra.
- **Está atento a lo que le falta al equipo:** `necesidades` lista lo que piden los agentes y los huecos en los datos; `resuelta 2` marca algo como resuelto. Cuando un agente anota un pedido nuevo en `necesidades.csv`, el bot te avisa al momento (revisa cada 15 min, sin IA).
- **Escribe solo** a las 08:20 con cómo va el equipo y lo que vence hoy (`AVISOS` en `~/.cargo-bot`, por defecto `08:20`; vacío = nunca). Después de cada ronda escribe el Gerente de la PC y a las 20:00 el de la nube.
- **Solo ella lee Telegram:** mientras exista `raspberry/ACTIVA`, `telegram_leer.py` no lee nada en la nube ni en la PC (si leyeran, le quitarían los mensajes al bot). Todas las sesiones siguen **mandando** avisos con `notificar.py` (en la PC con `~/.telegram`: dos líneas `TELEGRAM_BOT_TOKEN=...` y `TELEGRAM_CHAT_ID=...`). Si la Pi se apaga por días, borrar `raspberry/ACTIVA`.
- **Se actualiza sola:** cada 15 minutos hace `git pull`; si cambió `raspberry/bot.py`, se reinicia sola (desde el 15/10).
- **Gasto:** modelo **sonnet** por defecto desde el 15/10 (habla más natural; pedido de Santi); `modelo haiku` gasta menos y `modelo opus` es para algo difícil. Tope de 20 mensajes con Claude por día (`MAX_PREGUNTAS_DIA`), contando los avisos.

## Instalación (una vez)
1. Graba la tarjeta con **Raspberry Pi OS Lite (64-bit)** usando Raspberry Pi Imager. En la configuración del Imager activa SSH, pon el WiFi y un usuario.
2. Entra a la Pi por SSH y clona el repo:
   ```
   git clone https://github.com/Santi491/Claude- cargo && cd cargo
   git checkout claude/agente-independiente-s3uc8z
   ```
3. Corre `bash raspberry/instalar.sh` y sigue lo que pide: token y chat ID del bot de Telegram (los de `~/.telegram`), inicio de sesión de Claude (link para abrir en el celular) y de GitHub.
4. Escríbele `ayuda` al bot.

## Mantenimiento
- Ver qué está haciendo: `journalctl -u cargo-bot -f`
- Reiniciar después de un `git pull`: `sudo systemctl restart cargo-bot`
- Las claves están en `~/.telegram` y `~/.cargo-bot` (fuera del repo). Nunca subirlas.
- **Git que no se traba (10/11):** el vigilante y el bot hacen `git pull` con `git_seguro.py`. Si quedó un merge a medias o un `index.lock` viejo, lo limpian; si dos computadoras cambiaron lo mismo, se quedan con la versión de GitHub en las líneas que chocan; si igual no se puede tres veces seguidas, guardan lo que la Pi tenía distinto en `~/cargo-respaldos/AAAA-MM-DD-HHMM.patch` y dejan la carpeta igual a GitHub. En todos los casos le avisan a Santi por Telegram. `actividad.csv` y `sesiones.csv` se juntan solos (`.gitattributes`).
- **Si el vigilante se rompe** (error de Python), avisa una vez por día por Telegram con el error. Para verlo: `cd ~/cargo && python3 raspberry/vigilante.py --probar`.

## Convivencia con las otras sesiones
Mientras la Pi está prendida, ella lee Telegram. Si otra sesión corriera `telegram_leer.py` al mismo tiempo, Telegram puede rechazar a uno de los dos ("conflict"); la Pi reintenta sola a los 15 s. Si la Pi está apagada (y se borró `raspberry/ACTIVA`), `telegram_leer.py` vuelve a leer.

**Rondas en curso:** cada ronda empieza con `python salud.py empezar pc ronda` (paso 00 de `PROCESO-LOCAL.md`); `salud.py` la da como "en curso" y el vigilante no la cubre.

**Las IP cambian** (27/10: tras un corte de internet el router dio otras IP): la Raspberry busca la PC por su MAC (`raspberry/red.py`, `PC_MAC` en `~/.cargo-bot`; `PC_IP` es solo el primer intento). Desde el 10/11 `red.py` prueba todas las IP que la tabla ARP tenga con la MAC de la PC y espera hasta ~9 s la confirmación (una entrada STALE tarda 5 s en volver a confirmarse; antes daba la PC por apagada estando prendida). Conviene reservar las IP en el router (DHCP).

## Prender la PC para la ronda de las 16:00 (Wake-on-LAN, 17/10)
La Raspberry prende la PC de la casa de lunes a sábado a las 15:50 con `despertar_pc.py` (y desde el 11/11 también de lunes a viernes a las 10:00 para la ronda de la mañana: eso lo hace `vigilante.py`, no hace falta otra línea de cron), y la ronda de la PC la apaga al terminar (`apagar_pc.ps1`, paso 8c de `PROCESO-LOCAL.md`) solo si nadie la estaba usando. Si la PC no responde en 4 minutos, avisa a Santi por Telegram.
1. En `~/.cargo-bot` agregar `PC_MAC=AA:BB:CC:DD:EE:FF` (la "Dirección física" del adaptador **Ethernet** en `ipconfig /all` de la PC) y `PC_IP=192.168.0.x` (su IPv4).
2. Probar: `python3 ~/cargo/raspberry/despertar_pc.py --probar`, y con la PC apagada, `python3 ~/cargo/raspberry/despertar_pc.py`.
3. Cron: `crontab -e` y agregar `50 15 * * 1-6 cd ~/cargo && python3 raspberry/despertar_pc.py >> ~/despertar.log 2>&1` (la Raspberry tiene que estar en hora de Bolivia: `timedatectl` debe decir America/La_Paz).
En la PC (lo hace Santi): cable de red al router; en la BIOS de la ASUS TUF B460M-PLUS (tecla Supr al prender) → Advanced → APM: **ErP Ready = Disabled** y **Power On By PCI-E = Enabled**; en Windows, Inicio rápido apagado (Panel de control → Opciones de energía → Elegir el comportamiento de los botones), en el Administrador de dispositivos → adaptador Ethernet Intel → Administración de energía y Opciones avanzadas: "Wake on Magic Packet" activado; inicio de sesión automático. Claude **no** va en las aplicaciones de inicio de Windows: la tarea de Windows **CargoBloqueo** corre `bloquear_si_no_es_ronda.ps1` al iniciar sesión y, si la PC arrancó de lunes a sábado entre las 15:40 y las 16:45 (hasta 16:10 antes del 28/10; el reintento de las 16:15 quedaba afuera), abre Claude para la ronda; a cualquier otra hora bloquea la pantalla al instante (Windows pide el PIN o la contraseña) y no abre Claude.

**Tarea CargoAbrir (28/10; cada 15 minutos y sin ventana desde el 10/11, Santi: usa la PC para lo suyo y no quiere nada que moleste).** Si la PC ya estaba prendida (y bloqueada) cuando llega un pedido del Gerente, CargoBloqueo no vuelve a correr y nadie abría Claude: el pedido esperaba hasta el aviso de los 90 minutos. CargoAbrir corre cada 15 minutos con la sesión iniciada solo de lunes a sábado de 8:00 a 21:00 (Santi juega de noche: a la noche y el domingo no corre, y el script también termina al instante fuera de ese horario) (cada pasada tarda ~1,3 s, 0,4 s de CPU y ~76 MB que se liberan al terminar; medido el 10/11; `conhost --headless` evita que aparezca una ventana) `bloquear_si_no_es_ronda.ps1 -SoloAbrir`: si hay pedido (o es la hora de la ronda) y Claude está cerrado, lo abre una sola vez por pedido; nunca bloquea. Se crea una vez en PowerShell (sin administrador), en la PC:

```powershell
$a = New-ScheduledTaskAction -Execute "conhost.exe" -Argument '--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\WinterOS\Documents\agente-importacion\bloquear_si_no_es_ronda.ps1" -SoloAbrir'
$t = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday,Saturday -At 8:00
$t.Repetition = (New-ScheduledTaskTrigger -Once -At 8:00 -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Hours 13)).Repetition
Register-ScheduledTask -TaskName "CargoAbrir" -Action $a -Trigger $t -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew)
```

**Si la PC deja de prender por la red** (pasó desde el corte de luz del 27/10): después de un corte, la BIOS puede volver a los valores de fábrica (pila de la placa gastada) y dejar **Power On By PCI-E** apagado, y la placa de red no queda lista para despertar si la PC se apagó por el corte y no desde Windows. Revisar: 1) entrar a la BIOS (Supr) → Advanced → APM: ErP Ready = Disabled, Power On By PCI-E = Enabled (si la fecha y hora de la BIOS estaban mal, es la pila: CR2032); 2) en Windows, Inicio rápido sigue apagado y el adaptador Ethernet con "Wake on Magic Packet" (una actualización de Windows o del driver puede reactivar el Inicio rápido o apagar esto); 3) apagar desde Inicio → Apagar (no con el botón) y probar desde la Raspberry: `cd ~/cargo && python3 raspberry/despertar_pc.py` (si contesta "La PC prendió", quedó bien). Las luces del puerto de red de la PC tienen que quedar prendidas con la PC apagada; si se apagan, la placa no escucha.

## Vigilante (cron cada 30 min, sin IA)
`raspberry/vigilante.py` revisa `sesiones.csv` con `salud.py` y arregla solo lo que puede. Cada arreglo le llega a Santi por Telegram con la voz del Gerente.
- **Mañana (lunes a viernes):** prende la PC a las 10:00 para la ronda de las 10:30; si a las 10:30 sigue apagada la vuelve a prender, a las 11:00 avisa y si a las 13:00 no hizo la ronda la relanza una vez.
- **Tarde (lunes a sábado):** la PC se prende a las 15:50 (cron de `despertar_pc.py`, abajo); si no prendió a las 16:15 la vuelve a prender y a las 16:30 avisa; si a las 18:00 no hizo la ronda la relanza una vez.
- Avisa si la nube (9:30) o el Gerente (20:45) no corrieron.
- **Pedidos que caducan (10/11):** a las 2 h y media sin hacerse avisa y a las 4 h, si la PC no está trabajando en él, lo borra y avisa (no relanza nada mientras haya un pedido).
- Si una ronda terminó en `alerta` (a medias), le manda a Santi la nota y no la repite sola (Santi puede pedir `ronda ahora`). Una ronda `alerta` cuenta como corrida para `salud.py` salvo que la nota empiece con "No hecha".
- Si el propio vigilante se rompe, avisa una vez por día. Sube su latido cada 3 horas a `salud-raspberry.json`.

## Pedidos a la PC
- **Por Telegram** (sin IA): `estado pc`, `prender pc`, `ronda ahora` (ronda completa ya), `pc: <encargo>` (solo ese encargo con Chrome; queda como tarea `local` aprobada y urgente en `plan.csv`) y `apagar pc`. El Gerente usa lo mismo con `ACCION: pc ...` cuando Santi se lo pide conversando.
- **Prender y hacer:** la Raspberry escribe `pedido-pc.json` y prende la PC (`despertar_pc.py`). Al iniciar sesión, `bloquear_si_no_es_ronda.ps1` ve el pedido y abre Claude y Chrome; si la PC ya estaba prendida, lo abre la tarea **CargoAbrir** (abajo). La tarea de la PC **"Pedidos del Gerente"** (`tareas/pedidos-pc.md`, cada 2 horas de 8:15 a 20:15, lunes a sábado, desde el 10/11 para ahorrar plan; si no hay pedido termina al instante) lo hace, avisa a Santi y apaga la PC si nadie la usa (`apagar_pc.ps1`).
- **Apagar:** el bot escribe `orden-pc.json`; en la PC la tarea de Windows **CargoOrdenes** (SYSTEM, cada 5 min, sin IA) corre `orden_pc.ps1`, lee la orden desde GitHub y apaga con 2 minutos de aviso (se cancela con `shutdown /a`); cada orden se cumple una sola vez y solo si tiene menos de 30 minutos.
- **Nada de trabajo de noche ni el domingo (Santi, 10/11):** si una tarea de la PC arranca a las 21:00 o después, antes de las 8:00 o en domingo (pasa cuando Claude se abre tarde y la app ejecuta la corrida atrasada), termina sin hacer nada. Lo que quedó sin hacer lo toma la ronda siguiente.

## Cazador de ofertas (12/11)
Cron: `0 8-22/2 * * * cd ~/cargo && python3 cazador.py >> ~/cazador.log 2>&1` (cada 2 horas de 8 a 22, sin IA). Necesita las claves de eBay en `~/.ebay-claves` (permisos 600) y `~/.telegram` para avisar. Prueba sin mandar: `python3 cazador.py --probar`.
