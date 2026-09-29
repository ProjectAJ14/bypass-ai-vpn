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
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$HERE/Info.plist" "$APP/Contents/Info.plist"

# App icon: icon.png (1024px master) → AppIcon.icns with built-in sips/iconutil.
ICONSET="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$HERE/icon.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$HERE/icon.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$(dirname "$ICONSET")"

# Bake the absolute CLI path into a build-time copy of the source, then compile.
# Named main.swift: with more than one source file, only main.swift may hold top-level code.
TMPDIR_BUILD="$(mktemp -d)"
TMP="$TMPDIR_BUILD/main.swift"
trap 'rm -rf "$TMPDIR_BUILD"' EXIT
sed "s|__SCRIPT_PATH__|$SCRIPT|" "$HERE/BypassVPN.swift" > "$TMP"
# Pin deployment target to match Info.plist LSMinimumSystemVersion (13 for SMAppService);
# swiftc's default can exceed the host OS.
swiftc -O -target "$(uname -m)-apple-macos13.0" "$TMP" "$HERE/PanelView.swift" -o "$APP/Contents/MacOS/BypassVPN"
# Ad-hoc sign the whole bundle so notifications and launch-at-login see a stable identity.
codesign --force --sign - "$APP" >/dev/null

echo "Built $APP"
echo
echo "Next:"
echo "  1. One-time (if not done): node '$SCRIPT' --install-sudoers"
echo "  2. Open it:                open '$APP'   (first time: right-click → Open to clear Gatekeeper)"
echo "  3. Or install to /Applications: bash '$HERE/install.sh', then turn on \"Launch at login\" in the panel."
