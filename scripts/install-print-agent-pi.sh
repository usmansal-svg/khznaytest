#!/bin/bash
# Raspberry Pi label printer helper — one Pi per Zebra, plugged in by USB.
# Run once on a fresh Raspberry Pi OS (Lite is fine) as the "pi" user:
#   curl -fsSL https://raw.githubusercontent.com/usmansal-svg/khznaytest/pricing-engine/scripts/install-print-agent-pi.sh | bash -s -- "Station 1"
# Then copy .env.local into /home/pi/khazanay (it holds the database key) and reboot.
set -e
NAME="${1:-Station 1}"
REPO="https://github.com/usmansal-svg/khznaytest.git"
DIR="$HOME/khazanay"

echo "== Node.js 20"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs git
fi

echo "== the app (helper code lives in it)"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone --branch pricing-engine --depth 1 "$REPO" "$DIR"; fi
cd "$DIR" && npm install --omit=optional --no-audit --no-fund

echo "== USB printer access without root"
sudo usermod -aG lp "$USER"
echo 'SUBSYSTEM=="usb", ATTRS{idVendor}=="0a5f", MODE="0666"' | sudo tee /etc/udev/rules.d/99-zebra.rules >/dev/null   # 0a5f = Zebra
echo 'KERNEL=="lp[0-9]*", SUBSYSTEM=="usbmisc", MODE="0666"' | sudo tee -a /etc/udev/rules.d/99-zebra.rules >/dev/null
sudo udevadm control --reload-rules

echo "== service: starts at boot, restarts if it dies"
sudo tee /etc/systemd/system/khazanay-print.service >/dev/null <<UNIT
[Unit]
Description=Khazanay label printer helper ($NAME)
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$DIR
Environment=PRINTER_NAME=$NAME
Environment=PRINT_MODE=zpl
Environment=PRINT_PAPER=label15x225
Environment=PRINT_DEVICE=/dev/usb/lp0
Environment=PRINT_RIBBON=yes
Environment=PRINT_QUEUE=zebra
ExecStart=$(command -v node) --import tsx scripts/print-agent.mts
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable khazanay-print.service

cat <<MSG

Installed. Two things left:
  1. Copy .env.local from the Mac into $DIR/.env.local   (scp or a USB stick)
  2. Plug in the Zebra and reboot:  sudo reboot
Check it:  journalctl -u khazanay-print -f      (it prints "printer \"$NAME\"" when up)
Change the printer name or paper later in /etc/systemd/system/khazanay-print.service, then: sudo systemctl daemon-reload && sudo systemctl restart khazanay-print
MSG
