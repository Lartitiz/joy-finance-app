#!/bin/sh
# Retire l'agent launchd. Le profil Indy et la clé du trousseau restent en place.
launchctl bootout "gui/$(id -u)/com.nowadays.indy-sync" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.nowadays.indy-sync.plist"
echo "Agent retiré."
