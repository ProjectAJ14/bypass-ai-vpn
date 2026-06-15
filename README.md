# bypass-vpn

Route AI and work service traffic (Claude, ChatGPT, Atlassian, Wispr Flow, npm, Firebase, Google Auth) through your Wi-Fi gateway to bypass VPN routing.

Works on **macOS** and **Windows**. Zero dependencies.

## Install

```bash
npm install -g bypass-vpn
```

Or run directly without installing:

```bash
# macOS
sudo npx bypass-vpn

# Windows (run from elevated PowerShell)
npx bypass-vpn
```

## Usage

```bash
# Route all services through Wi-Fi
sudo bypass-vpn

# Route specific services only
sudo bypass-vpn --service claude --service chatgpt

# Remove routes
sudo bypass-vpn --remove

# Preview without executing
sudo bypass-vpn --dry-run

# List available services
bypass-vpn --list
```

### Custom Domains

Save your own domains (e.g., your company's Jira instance) so they're automatically routed on every run:

```bash
# One-time setup
bypass-vpn --add-domain mycompany.atlassian.net

# Now just run normally — saved domains are included automatically
sudo bypass-vpn

# Remove a saved domain
bypass-vpn --remove-domain mycompany.atlassian.net
```

Custom domains are persisted in `~/.bypass-vpn.json`.

## Supported Services

| Service | Domains |
|---------|---------|
| Claude | api.anthropic.com |
| ChatGPT | chatgpt.com, chat.openai.com, api.openai.com, + 5 more |
| Firebase | firestore.googleapis.com, securetoken.googleapis.com, + 3 more |
| Google Auth | accounts.google.com, oauth2.googleapis.com, + 2 more |
| Atlassian | api.atlassian.com, auth.atlassian.com, id.atlassian.com |
| Wispr Flow | wisprflow.ai, api.wisprflow.ai, inference.wisprflow.com, dl.wisprflow.com |
| npm | registry.npmjs.org |

Run `bypass-vpn --list` for the full domain list.

## How It Works

1. Detects your Wi-Fi gateway IP
2. Resolves each service domain to its current IP addresses
3. Adds host-specific routes through the Wi-Fi gateway, bypassing VPN's default route

Routes are ephemeral — they reset on reboot or network change. Re-run as needed.

## Requirements

- Node.js >= 16
- macOS or Windows
- Root/Administrator access (needed to modify routing table)

## Uninstall

```bash
npm uninstall -g bypass-vpn
```

## Credits

Idea by [Sourabh Khot](https://github.com/sourabh-khot65)

## License

MIT
