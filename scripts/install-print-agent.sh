#!/bin/sh
# Installs the label printer helper as a launch agent on this Mac so it runs
# at login and restarts if it dies. Run from the project root:
#   sh scripts/install-print-agent.sh                       (ZYWELL, PDF route)
#   PRINTER_NAME="Station 1" PRINT_QUEUE=Zebra_1 PRINT_MODE=zpl PRINT_PAPER=label225x15 sh scripts/install-print-agent.sh
# One agent per printer; run it once per printer with a different name and queue.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
NAME="${PRINTER_NAME:-${PRINT_QUEUE:-EML_400L_LABEL}}"
SAFE="$(printf "%s" "$NAME" | tr -c "A-Za-z0-9" "_")"
PLIST="$HOME/Library/LaunchAgents/com.khazanay.print-agent.$SAFE.plist"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.khazanay.print-agent.$SAFE</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>--import</string><string>tsx</string><string>scripts/print-agent.mts</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>PRINT_QUEUE</key><string>${PRINT_QUEUE:-EML_400L_LABEL}</string>
    <key>PRINT_MODE</key><string>${PRINT_MODE:-pdf}</string>
    <key>PRINT_RIBBON</key><string>${PRINT_RIBBON:-yes}</string>
    <key>PRINT_POLL_MS</key><string>${PRINT_POLL_MS:-400}</string>
    <key>PRINTER_NAME</key><string>$NAME</string>
    <key>PRINT_PAPER</key><string>${PRINT_PAPER:-}</string>
  </dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/khazanay-print-agent.$SAFE.log</string><key>StandardErrorPath</key><string>/tmp/khazanay-print-agent.$SAFE.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/com.khazanay.print-agent.$SAFE" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.khazanay.print-agent" 2>/dev/null || true  # the old single-printer agent
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed: $PLIST  printer=\"$NAME\" queue=${PRINT_QUEUE:-EML_400L_LABEL} mode=${PRINT_MODE:-pdf}  (log: /tmp/khazanay-print-agent.$SAFE.log)"
