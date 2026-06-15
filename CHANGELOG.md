# Changelog

## [1.4.0] - 2026-06-16

### Changed
- DNS resolution and route commands now run concurrently. `resolver.js` and `router.js` switched from blocking `execSync('dig')` to async `execFile` driven by `Promise.all`, so all lookups and routes happen in parallel instead of serially blocking the event loop. A full run (~33 domains across 9 services) dropped from 20+ seconds to roughly 0.9 seconds
- Animation runtime is now capped to a total time budget (~1.3s) so output never drags on slower terminals

### Added
- Live render engine — the UI now animates the actual work as it happens. Each host shows a spinner while it really resolves and routes, then flips to its result, with a live N/total progress counter, replacing the previous post-hoc fake animation
- Retro-CRT animated output and a modern CLI presentation with a concise summary

### Fixed
- `--dry-run` is now honored on `--remove`, and removed routes are labeled accurately
- `platform.js` now imports colors from the theme, fixing the color references used in its output

## [1.3.2] - 2026-06-15

### Added
- npm service support — routes `registry.npmjs.org` through the Wi-Fi gateway so `npm install` works while connected to a VPN that intercepts the tunnel. Both package metadata and tarballs are served from this host

## [1.3.1] - 2026-06-15

First successful npm publish of the 1.3.x line. Carries the same functionality as 1.3.0 (Wispr Flow service support and the Windows `nslookup` DNS fix), which never reached npm because its release build authenticated with a dead `NPM_TOKEN`.

### Fixed
- CI publishing now uses npm OIDC trusted publishing instead of a long-lived `NPM_TOKEN`, so releases authenticate correctly and publish to npm. The 1.3.0 release event ran the pre-fix workflow from its tagged commit; this 1.3.1 tag includes the OIDC workflow, making it the first 1.3.x version actually published to npm

## [1.3.0] - 2026-06-15

### Added
- Wispr Flow service support — routes `wisprflow.ai`, `api.wisprflow.ai`, `inference.wisprflow.com`, and `dl.wisprflow.com` through the Wi-Fi gateway. The `inference.wisprflow.com` transcription path is the one most slowed down by the VPN

### Fixed
- DNS resolution on Windows now uses `nslookup` to bypass the VPN's DNS interception, since `dig` is unavailable on Windows — with automatic fallback to Node.js built-in DNS

## [1.2.0] - 2026-04-01

### Added
- Atlassian service support (Jira, Confluence, Bitbucket, Trello) for routing through Wi-Fi gateway
- Persistent custom domains via `--save` flag — user-defined domains are stored and reloaded automatically

### Chores
- Add Claude Code release-manager agent configuration

## [1.1.0] - 2026-03-30

### Fixed
- DNS resolution now works when VPN is active — uses `dig` as the primary resolver instead of Node.js built-in DNS which gets intercepted by VPN tunnels

### Changed
- `resolver.js` now uses `dig +short +time=3` for DNS resolution with automatic fallback to Node.js `dns.resolve4()` if `dig` is unavailable

## [1.0.1] - 2026-03-29

### Changed
- Version bump

## [1.0.0] - 2026-03-29

### Added
- Initial release
- Route AI service traffic (Claude, ChatGPT, Firebase, Google Auth) through Wi-Fi gateway to bypass VPN
- Cross-platform support (macOS and Windows)
- `--dry-run`, `--remove`, `--service`, `--list` flags
- Parallel DNS resolution with timeout protection
- Deduplication of already-routed IPs
