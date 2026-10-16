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
