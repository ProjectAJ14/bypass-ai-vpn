# Changelog

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
