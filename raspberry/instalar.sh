#!/usr/bin/env bash
# Instala el bot de Telegram de Cargo Brothers en la Raspberry Pi (Raspberry Pi OS Lite de 64 bits).
# Uso, dentro del repo clonado:  bash raspberry/instalar.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$(uname -m)" != "aarch64" ]; then
  echo "Este sistema es de 32 bits ($(uname -m)). Claude Code necesita Raspberry Pi OS de 64 bits: vuelve a grabar la tarjeta con esa versión."
  exit 1
fi

echo "== Paquetes del sistema"
sudo apt-get update -qq
sudo apt-get install -y -qq git python3 curl gh

echo "== Memoria de intercambio de 1 GB (la Pi 3 B+ solo tiene 1 GB de RAM)"
if [ -f /etc/dphys-swapfile ] && ! grep -q '^CONF_SWAPSIZE=1024' /etc/dphys-swapfile; then
  sudo sed -i 's/^#\?CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
  sudo systemctl restart dphys-swapfile
fi

echo "== Claude Code"
if ! command -v claude >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/claude" ]; then
  curl -fsSL https://claude.ai/install.sh | bash
fi
CLAUDE_BIN="$(command -v claude || echo "$HOME/.local/bin/claude")"

echo "== Claves del bot"
if [ ! -f "$HOME/.telegram" ]; then
  read -r -p "Token del bot de Telegram (el mismo de la Mac): " tok
  read -r -p "Chat ID de Santi (el mismo de la Mac): " chat
  printf 'TELEGRAM_BOT_TOKEN=%s\nTELEGRAM_CHAT_ID=%s\n' "$tok" "$chat" > "$HOME/.telegram"
  chmod 600 "$HOME/.telegram"
fi
if [ ! -f "$HOME/.cargo-bot" ]; then
  echo "Ahora se abre el inicio de sesión de Claude: abre el link que aparece en tu celular, entra con tu cuenta Pro y pega el código."
  "$CLAUDE_BIN" setup-token
  read -r -p "Pega aquí el token que te mostró (empieza con sk-ant-oat): " oat
  printf 'CLAUDE_CODE_OAUTH_TOKEN=%s\nCLAUDE_MODELO=haiku\nMAX_PREGUNTAS_DIA=15\n' "$oat" > "$HOME/.cargo-bot"
  chmod 600 "$HOME/.cargo-bot"
fi

echo "== GitHub (para subir las decisiones a plan.csv)"
gh auth status >/dev/null 2>&1 || gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
git -C "$REPO" config user.name "Cargo Brothers · Raspberry"
git -C "$REPO" config user.email "raspberry@cargo-brothers.local"

echo "== Servicio que arranca solo al prender la Pi"
sudo tee /etc/systemd/system/cargo-bot.service >/dev/null <<EOF
[Unit]
Description=Bot de Telegram de Cargo Brothers
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$REPO
Environment=PATH=$(dirname "$CLAUDE_BIN"):/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/python3 $REPO/raspberry/bot.py
Restart=always
RestartSec=20

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now cargo-bot
sleep 3
systemctl --no-pager --lines=5 status cargo-bot || true
echo "Listo. Escríbele 'ayuda' al bot en Telegram."
