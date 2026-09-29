#!/bin/bash
# Build BypassVPN.app and move it into /Applications.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$HERE/build.sh"

pkill -x BypassVPN 2>/dev/null || true   # otherwise `open` just re-focuses the old copy
while pgrep -x BypassVPN >/dev/null; do sleep 0.2; done
rm -rf "/Applications/BypassVPN.app"
cp -R "$HERE/BypassVPN.app" "/Applications/BypassVPN.app"
echo "Installed to /Applications/BypassVPN.app"
open "/Applications/BypassVPN.app"
