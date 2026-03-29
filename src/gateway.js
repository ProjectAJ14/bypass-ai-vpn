const { execSync } = require('child_process');
const { getPlatform } = require('./platform');

function detect() {
  const platform = getPlatform();

  if (platform === 'darwin') {
    return detectMac();
  }
  if (platform === 'win32') {
    return detectWindows();
  }
  return null;
}

function detectMac() {
  try {
    const output = execSync('netstat -nr', { encoding: 'utf8', timeout: 5000 });
    for (const line of output.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === 'default' && parts[parts.length - 1] === 'en0') {
        return parts[1];
      }
    }
  } catch {}

  // Fallback: networksetup
  try {
    const output = execSync('networksetup -getinfo Wi-Fi', { encoding: 'utf8', timeout: 5000 });
    const match = output.match(/^Router:\s+(.+)$/m);
    if (match) return match[1].trim();
  } catch {}

  return null;
}

function detectWindows() {
  // Try PowerShell Get-NetRoute
  try {
    const cmd = `powershell -NoProfile -Command "Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Where-Object { $_.InterfaceAlias -like '*Wi-Fi*' -or $_.InterfaceAlias -like '*Wireless*' } | Select-Object -First 1 -ExpandProperty NextHop"`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim();
    if (output && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(output)) {
      return output;
    }
  } catch {}

  // Fallback: parse ipconfig
  try {
    const output = execSync('ipconfig', { encoding: 'utf8', timeout: 5000 });
    const sections = output.split(/\r?\n\r?\n/);
    for (const section of sections) {
      if (/Wi-Fi|Wireless/i.test(section)) {
        const match = section.match(/Default Gateway[.\s]*:\s*([\d.]+)/);
        if (match) return match[1];
      }
    }
  } catch {}

  return null;
}

module.exports = { detect };
