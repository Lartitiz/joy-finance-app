#!/bin/sh
# Installe (ou réinstalle) l'agent launchd du lundi 8 h.
set -e
DOSSIER="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(dirname "$(command -v node)")"
CIBLE="$HOME/Library/LaunchAgents/com.nowadays.indy-sync.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
sed -e "s#__DOSSIER__#$DOSSIER#g" -e "s#__NODE_BIN__#$NODE_BIN#g" -e "s#__HOME__#$HOME#g" \
  "$DOSSIER/launchd/com.nowadays.indy-sync.plist" > "$CIBLE"
launchctl bootout "gui/$(id -u)/com.nowadays.indy-sync" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$CIBLE"
echo "Agent installé : $CIBLE (lundi 8 h, journal ~/Library/Logs/nowadays-indy-sync.log)"
