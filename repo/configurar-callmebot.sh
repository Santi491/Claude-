#!/bin/zsh
# Guarda el número y la clave de CallMeBot en ~/.callmebot (fuera del repo, solo legible por tu usuario).
print -n "Tu número de WhatsApp con código de país (ej. +5917xxxxxxx): "; read tel
print -n "APIKEY que te mandó CallMeBot (no se muestra; pégala una sola vez): "; read -s key; print
umask 077
printf 'CALLMEBOT_PHONE=%s\nCALLMEBOT_APIKEY=%s\n' "${tel// /}" "${key// /}" > ~/.callmebot
print "Listo: guardado en ~/.callmebot"
