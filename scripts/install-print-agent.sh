#!/bin/sh
# Installs the label printer helper as a launch agent on this Mac so it runs
# at login and restarts if it dies. Run from the project root:  sh scripts/install-print-agent.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/com.khazanay.print-agent.plist"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.khazanay.print-agent</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>--import</string><string>tsx</string><string>scripts/print-agent.mts</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/khazanay-print-agent.log</string><key>StandardErrorPath</key><string>/tmp/khazanay-print-agent.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/com.khazanay.print-agent" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed: $PLIST  (log: /tmp/khazanay-print-agent.log)"
