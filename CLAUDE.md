# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A zero-dependency Node.js CLI tool that routes AI service traffic through the Wi-Fi gateway to bypass VPN. Published on npm as `bypass-vpn`. Works on macOS and Windows.

## Running Locally

```bash
node bin/bypass-vpn.js --help      # test help output
node bin/bypass-vpn.js --list      # test service listing
node bin/bypass-vpn.js --dry-run   # test full flow without modifying routes
sudo node bin/bypass-vpn.js        # actual route modification (macOS)
```

No build step, no test framework, no linter configured. There are no `npm scripts`.

## Publishing

```bash
npm publish    # requires 2FA (security key) — must run interactively
```

After publishing, bump version in `package.json` before the next publish.

## Architecture

The CLI entry point (`bin/bypass-vpn.js`) orchestrates five modules:

```
bin/bypass-vpn.js  (arg parsing → orchestration → summary)
  ├─ platform.js   → getPlatform(), ensureAdmin()
  ├─ gateway.js    → detect() — macOS: netstat/networksetup, Windows: PowerShell/ipconfig
  ├─ resolver.js   → resolveAll() — dns.promises.resolve4() with 5s timeout
  ├─ router.js     → addRoute(), removeRoute() — execSync with IP validation
  ├─ services.js   → static domain registry (Claude, ChatGPT, Firebase, Google Auth, Atlassian)
  ├─ config.js     → loadConfig(), addDomain(), removeDomain() — persists custom domains in ~/.bypass-vpn.json
  └─ ui.js         → colors (raw ANSI), Spinner class, showBanner(), showSummary()
```

All cross-platform logic lives in `gateway.js` (detection) and `router.js` (route commands). Platform is checked via `process.platform` in `platform.js`.

## Key Constraints

- **Zero dependencies** — only Node.js built-ins (`dns`, `child_process`). Do not add npm packages.
- **IP validation** — all IPs passed to `execSync` must match `/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/` to prevent command injection.
- **Node >= 16** — uses `dns.promises` and modern JS features.
- Service domains are defined in `src/services.js` — this is the single source of truth for what gets routed.
