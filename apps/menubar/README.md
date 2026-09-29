# BypassVPN menu-bar app (macOS)

A native menu-bar app for the `bypass-vpn` CLI. It re-routes AI traffic through
your Wi-Fi gateway automatically whenever you join a new Wi-Fi network or
connect to a VPN.

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

## Install

```bash
bash apps/menubar/install.sh   # builds, copies to /Applications, launches
```

Then open the panel and switch on **Launch at login**. Requires macOS 13+.

## Use

It runs by itself:

- **Automatic:** re-routes whenever the network changes, meaning a new Wi-Fi
  gateway or a VPN connecting or disconnecting. Changes are debounced by 3s,
  and a run only happens when the `gateway|vpn` state actually changed.
  Auto-runs post a notification. Turn this off in the panel with
  **Auto-run on network change**.
- **Click** the menu-bar icon to open the panel. It shows the Wi-Fi gateway,
  whether a VPN is up, per-service results from the last run, **Apply** /
  **Remove**, the toggles, **Log** and **Quit**.
- Icon states:
  - shield: no VPN
  - ⚡ shield: VPN detected
  - spinner: running
  - ✓ shield: done
  - ! shield: failed (stays until the next good run)
- The last run is written to `~/Library/Logs/bypass-vpn.log`.

VPN detection means a `utun`/`ipsec`/`ppp` interface with an IPv4 address.
macOS keeps several IPv6-only `utun`s for iCloud, and those are ignored.

## Notes

- The app runs the CLI with `--json` and reads the last line of its output.
  Anything that isn't JSON, such as a missing sudoers rule or node not being
  found, is shown as the error.
- Re-run `build.sh` if you move the repo. The CLI path is absolute and baked in.
- To change the app icon, replace `icon.png` (1024px master) and rebuild.
