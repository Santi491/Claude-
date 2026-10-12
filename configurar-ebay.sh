#!/bin/zsh
# Guarda las claves de eBay (Production) en ~/.ebay-claves, fuera del repo y solo legible por tu usuario.
print -n "EBAY_CLIENT_ID (App ID): "; read cid
print -n "EBAY_CLIENT_SECRET (Cert ID, no se muestra): "; read -s secret; print
umask 077
printf 'EBAY_CLIENT_ID=%s\nEBAY_CLIENT_SECRET=%s\n' "$cid" "$secret" > ~/.ebay-claves
print "Listo: claves guardadas en ~/.ebay-claves"
