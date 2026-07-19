#!/bin/bash
# Build BypassVPN.app — a menu-bar launcher for the bypass-vpn CLI.
# Usage: bash apps/menubar/build.sh   (from anywhere)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SCRIPT="$REPO/bin/bypass-vpn.js"
APP="$HERE/BypassVPN.app"

[ -f "$SCRIPT" ] || { echo "error: CLI not found at $SCRIPT"; exit 1; }
command -v swiftc >/dev/null || { echo "error: swiftc not found — install Xcode Command Line Tools (xcode-select --install)"; exit 1; }

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$HERE/Info.plist" "$APP/Contents/Info.plist"

# Bake the absolute CLI path into a build-time copy of the source, then compile.
TMP="$(mktemp -t BypassVPN).swift"
trap 'rm -f "$TMP"' EXIT
sed "s|__SCRIPT_PATH__|$SCRIPT|" "$HERE/BypassVPN.swift" > "$TMP"
swiftc -O "$TMP" -o "$APP/Contents/MacOS/BypassVPN"

echo "Built $APP"
echo
echo "Next:"
echo "  1. One-time (if not done): node '$SCRIPT' --install-sudoers"
echo "  2. Open it:                open '$APP'   (first time: right-click → Open to clear Gatekeeper)"
echo "  3. Optional: drag BypassVPN.app to /Applications and add to Login Items."
