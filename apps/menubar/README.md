# BypassVPN menu-bar app (macOS)

A tiny native menu-bar launcher for the `bypass-vpn` CLI. Click the icon and it
re-routes AI traffic through your Wi-Fi gateway — handy after switching Wi-Fi
while on the VPN.

## Build

```bash
bash apps/menubar/build.sh
```

Produces `BypassVPN.app` next to the script. Requires the Xcode Command Line
Tools (`xcode-select --install`) for `swiftc`. Zero runtime dependencies — the
CLI path is baked in at build time; `node` is resolved via your login shell.

## First-time setup

Run once so routing never asks for a password:

```bash
node bin/bypass-vpn.js --install-sudoers
```

## Use

```bash
open apps/menubar/BypassVPN.app   # first launch: right-click → Open (Gatekeeper)
```

- **Left-click** the menu-bar icon → add routes.
- **Right-click** → menu: Add Routes / Remove Routes / Open Log / Quit.
- While running, the icon shows a braille spinner. When done it flips to a green
  ✓ or red ✗ for a few seconds; hover for the last-run detail.
- Every run appends to `~/Library/Logs/bypass-vpn.log` (timestamp, mode, exit
  code, full output). **Open Log** opens it in Console — check here for errors.

Drag `BypassVPN.app` to `/Applications` and add it to **System Settings → General
→ Login Items** to keep it always available.

## Notes

- Feedback uses the CLI exit code plus an output scan. A hard failure (no Wi-Fi
  gateway, error) shows red reliably; the scan also flags per-host route
  failures, which the CLI does not surface via exit code.
- Re-run `build.sh` if you move the repo — the CLI path is absolute and baked in.
