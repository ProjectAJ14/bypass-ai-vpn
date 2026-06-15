# Changelog

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
