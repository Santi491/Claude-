#!/bin/zsh
# Guarda el token del bot de Telegram y tu chat_id en ~/.telegram (fuera del repo, solo legible por tu usuario).
# Antes: crea el bot con @BotFather (/newbot), ábrelo en Telegram, toca Iniciar y escríbele "hola".
cd "$(dirname "$0")"
print -n "Token que te dio @BotFather (no se muestra; pégalo una sola vez): "; read -s token; print
token="${token// /}"
chat=$(TELEGRAM_BOT_TOKEN="$token" python3 notificar.py --buscar-chat | head -1 | cut -f1)
if [[ -z "$chat" ]]; then
  print "No encontré tu chat: abre tu bot en Telegram, toca Iniciar, escríbele \"hola\" y vuelve a correr este script."
  exit 1
fi
umask 077
printf 'TELEGRAM_BOT_TOKEN=%s\nTELEGRAM_CHAT_ID=%s\n' "$token" "$chat" > ~/.telegram
print "Listo: guardado en ~/.telegram (chat_id $chat). Para la nube, agrega TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID=$chat al entorno."
python3 notificar.py "Cargo Brothers: los avisos del Gerente llegarán por aquí."
