const { execSync, execFile } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const { c } = require('./theme');

const execFileP = promisify(execFile);

const ROUTE_BIN = '/sbin/route';
const SUDOERS_PATH = '/etc/sudoers.d/bypass-vpn';

function getPlatform() {
  const p = process.platform;
  if (p === 'darwin' || p === 'win32') return p;
  return 'unsupported';
}

// The exact NOPASSWD rule installed on macOS. Scoped to the `route` binary only:
// it lets the current user run `sudo route …` without a password, and nothing
// else. Any args are allowed (route add/delete take dynamic IPs).
function sudoersRule() {
  return `${os.userInfo().username} ALL=(root) NOPASSWD: ${ROUTE_BIN}\n`;
}

// True if the current user can run `sudo route` without a password prompt.
// `sudo -n -l <cmd>` lists the rule non-interactively and never executes route;
// it errors if a password would be required or the command isn't permitted.
async function hasPasswordlessRoute() {
  try {
    await execFileP('sudo', ['-n', '-l', ROUTE_BIN], { timeout: 4000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function printDarwinSetup() {
  console.error('');
  console.error(c.yellow('  bypass-vpn needs one-time setup to run without a password.'));
  console.error('');
  console.error('  Run once (asks for your password this one time):');
  console.error(`    ${c.cyan('bypass-vpn --install-sudoers')}`);
  console.error('');
  console.error(c.dim('  This adds a passwordless rule for the `route` command only:'));
  console.error(c.dim(`    ${sudoersRule().trim()}`));
  console.error(c.dim(`  Undo any time with: bypass-vpn --uninstall-sudoers`));
  console.error('');
}

// Preflight: make sure we can actually modify routes before the animation runs.
// macOS uses per-command passwordless sudo; Windows needs an elevated process.
async function ensurePrivileges() {
  const platform = getPlatform();

  if (platform === 'unsupported') {
    console.error(c.red('  Unsupported platform. Only macOS and Windows are supported.'));
    process.exit(1);
  }

  if (platform === 'darwin') {
    if (process.getuid() === 0) return; // running under sudo still works
    if (await hasPasswordlessRoute()) return;
    printDarwinSetup();
    process.exit(1);
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

// Install the NOPASSWD sudoers rule. Writes to a temp file, validates it with
// `visudo -c` (a bad sudoers file can lock you out of sudo), then installs it
// root:wheel mode 440 as sudoers.d requires. The user's own `sudo` performs the
// privileged write — they enter their password once here, never again.
async function installSudoers() {
  if (getPlatform() !== 'darwin') {
    console.error(c.yellow('  --install-sudoers is macOS-only. On Windows, run from an elevated prompt.'));
    process.exit(1);
  }

  const fs = require('fs');
  const path = require('path');
  const tmp = path.join(os.tmpdir(), 'bypass-vpn.sudoers');
  fs.writeFileSync(tmp, sudoersRule(), { mode: 0o600 });

  try {
    console.log(c.dim('  Validating sudoers rule (visudo -c)…'));
    await execFileP('sudo', ['visudo', '-cf', tmp], { timeout: 15000 });

    console.log(c.dim(`  Installing ${SUDOERS_PATH}…`));
    await execFileP('sudo', ['install', '-m', '440', '-o', 'root', '-g', 'wheel', tmp, SUDOERS_PATH], { timeout: 15000 });

    console.log('');
    console.log(`  ${c.green('Done.')} bypass-vpn now runs without a password.`);
    console.log(c.dim('  Try it:  bypass-vpn'));
    console.log('');
  } catch (err) {
    console.error('');
    console.error(c.red(`  Setup failed: ${err.message.trim()}`));
    console.error(c.dim('  Nothing was changed.'));
    console.error('');
    process.exit(1);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

async function uninstallSudoers() {
  if (getPlatform() !== 'darwin') {
    console.error(c.yellow('  --uninstall-sudoers is macOS-only.'));
    process.exit(1);
  }
  try {
    await execFileP('sudo', ['rm', '-f', SUDOERS_PATH], { timeout: 15000 });
    console.log(`  ${c.green('Removed.')} bypass-vpn will ask for a password again.`);
  } catch (err) {
    console.error(c.red(`  Failed to remove rule: ${err.message.trim()}`));
    process.exit(1);
  }
}

module.exports = {
  getPlatform,
  ensurePrivileges,
  installSudoers,
  uninstallSudoers,
};
