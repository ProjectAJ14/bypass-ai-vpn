const { execSync } = require('child_process');
const { c } = require('./theme');

function getPlatform() {
  const p = process.platform;
  if (p === 'darwin' || p === 'win32') return p;
  return 'unsupported';
}

function ensureAdmin() {
  const platform = getPlatform();

  if (platform === 'unsupported') {
    console.error(c.red('  Unsupported platform. Only macOS and Windows are supported.'));
    process.exit(1);
  }

  if (platform === 'darwin') {
    if (process.getuid() !== 0) {
      console.error(c.yellow('  This tool needs root privileges to modify routes.'));
      console.error(c.dim('  Run: sudo bypass-vpn'));
      process.exit(1);
    }
  }

  if (platform === 'win32') {
    try {
      execSync('net session', { stdio: 'ignore' });
    } catch {
      console.error(c.yellow('  This tool needs Administrator privileges to modify routes.'));
      console.error(c.dim('  Run from an elevated Command Prompt or PowerShell.'));
      process.exit(1);
    }
  }
}

module.exports = { getPlatform, ensureAdmin };
