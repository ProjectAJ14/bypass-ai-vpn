# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A zero-dependency Node.js CLI tool that routes AI service traffic through the Wi-Fi gateway to bypass VPN. Published on npm as `bypass-vpn`. Works on macOS and Windows.

## Running Locally

```bash
node bin/bypass-vpn.js --help              # test help output
node bin/bypass-vpn.js --list              # test service listing
node bin/bypass-vpn.js --dry-run           # test full flow without modifying routes
node bin/bypass-vpn.js --install-sudoers   # one-time: enable passwordless route (macOS)
node bin/bypass-vpn.js                      # actual route modification (no sudo, after setup)
```

**Privileges (macOS):** the tool runs as a normal user and elevates **only** the
`route` command via `sudo -n /sbin/route …`. A one-time `--install-sudoers` writes
a `NOPASSWD: /sbin/route` rule to `/etc/sudoers.d/bypass-vpn`, so no password is
asked on subsequent runs. `--uninstall-sudoers` removes it. On Windows the whole
process must be launched from an elevated prompt (no per-command elevation).

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
  ├─ platform.js   → getPlatform(), ensurePrivileges(), installSudoers(), uninstallSudoers()
  ├─ gateway.js    → detect() — macOS: netstat/networksetup, Windows: PowerShell/ipconfig
  ├─ resolver.js   → resolveOne()/resolveAll() — async execFile(dig/nslookup) + Node DNS fallback, ~4s timeout
  ├─ router.js     → addRoute(), removeRoute() — async execFile w/ IP validation; macOS elevates route via `sudo -n /sbin/route`
  ├─ services.js   → static domain registry (Claude, ChatGPT, Firebase, Google Auth, Atlassian)
  ├─ config.js     → loadConfig(), addDomain(), removeDomain() — persists custom domains in ~/.bypass-vpn.json
  ├─ theme.js      → look-and-feel: palette, glyphs, spinner frames, box chars, gradient, bundled ANSI Shadow font, ANSI/width helpers
  └─ ui.js         → live retro-CRT render engine: renderLive(data, options, work) (or static frames when piped/--no-anim)
```

All cross-platform logic lives in `gateway.js` (detection) and `router.js` (route commands). Platform is checked via `process.platform` in `platform.js`.

The orchestrator (`bin/bypass-vpn.js`) builds a **mutable** data object (`{ version, gateway, services: [{ name, hosts: [{ host, status, ips?, note? }] }] }`) with every host `'pending'`, then calls `renderLive(data, options, work)`. `renderLive` plays the intro, starts a timer that redraws the host block, and `await`s `work()` — the `work` callback resolves + routes **all hosts concurrently** (`Promise.all` over async `execFile`), flipping each host's `status` (`pending → resolving → routing → ok|skip|fail`) as the real work lands. The live block reflects those mutations in real time, so the animation *is* the work, not a replay. Re-skin the CLI by editing `theme.js` alone.

**Performance:** DNS and route commands MUST stay async (`execFile`, not `execSync`) — `execSync` blocks the event loop and serialises every lookup, which is what made startup take 20+s. All per-host work runs in parallel.

## Key Constraints

- **Zero dependencies** — only Node.js built-ins (`dns`, `child_process`). Do not add npm packages.
- **IP validation** — all IPs must match `/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/` before use; route commands use `execFile` with an argv array (no shell string) as defense in depth.
- **Node >= 16** — uses `dns.promises` and modern JS features.
- Service domains are defined in `src/services.js` — this is the single source of truth for what gets routed.
