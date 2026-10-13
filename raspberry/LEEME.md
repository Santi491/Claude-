# Raspberry Pi: bot de Telegram del Gerente

La Raspberry Pi 3 B+ queda prendida y contesta a Santi por Telegram al momento.

- **Sin IA y sin gastar el plan Pro:** `apruebo 1 3`, `rechazo 2`, `sí a todo`, `no a todo`, `plan`, `tarea: ...` (o `tarea wa:` / `tarea mkt:`), `modelo haiku|sonnet|opus`, `uso`, `ayuda`. Las decisiones van a `plan.csv` y `actividad.csv` y se suben a GitHub.
- **Con Claude (plan Pro), solo cuando Santi pregunta algo:** usa Claude Code en modo solo lectura (no cambia archivos, no escribe a tiendas, no compra). Modelo por defecto: **haiku**, el que menos gasta. Límite de 15 preguntas por día (`MAX_PREGUNTAS_DIA` en `~/.cargo-bot`).

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
