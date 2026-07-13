const { execFile } = require('child_process');
const { promisify } = require('util');
const { getPlatform } = require('./platform');

const execFileP = promisify(execFile);

const IP_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

// Absolute path so it matches the NOPASSWD sudoers rule exactly (see platform.js).
const ROUTE_BIN_DARWIN = '/sbin/route';

function validateIp(ip) {
  if (!IP_REGEX.test(ip)) {
    throw new Error(`Invalid IP address: ${ip}`);
  }
}

// execFile with an argument array (never a shell string) — combined with the
// IP validation above this keeps user/DNS-derived values away from a shell.
async function run(file, argv) {
  await execFileP(file, argv, { timeout: 8000 });
}

// Run the `route` command with the privileges it needs.
//   macOS: elevate ONLY this command via passwordless sudo. `sudo -n` never
//          prompts — if the NOPASSWD rule isn't installed it fails fast rather
//          than hanging, and platform.js catches that at preflight.
//   Windows: the whole process is already elevated (Administrator).
async function runRoute(argv) {
  if (getPlatform() === 'darwin') {
    await run('sudo', ['-n', ROUTE_BIN_DARWIN, ...argv]);
    return;
  }
  await run('route', argv);
}

async function addRoute(ip, gateway, { dryRun = false } = {}) {
  validateIp(ip);
  validateIp(gateway);

  const platform = getPlatform();

  if (platform === 'darwin') {
    const cmd = `route -n add -host ${ip} ${gateway}`;
    if (dryRun) return { success: true, ip, cmd };
    try { await runRoute(['-n', 'delete', '-host', ip]); } catch {}
    try {
      await runRoute(['-n', 'add', '-host', ip, gateway]);
      return { success: true, ip };
    } catch (err) {
      return { success: false, ip, error: err.message };
    }
  }

  // Windows
  const cmd = `route add ${ip} mask 255.255.255.255 ${gateway}`;
  if (dryRun) return { success: true, ip, cmd };
  try { await runRoute(['delete', ip]); } catch {}
  try {
    await runRoute(['add', ip, 'mask', '255.255.255.255', gateway]);
    return { success: true, ip };
  } catch (err) {
    return { success: false, ip, error: err.message };
  }
}

async function removeRoute(ip, { dryRun = false } = {}) {
  validateIp(ip);

  const platform = getPlatform();
  const argv = platform === 'darwin'
    ? ['-n', 'delete', '-host', ip]
    : ['delete', ip];
  const cmd = platform === 'darwin'
    ? `route -n delete -host ${ip}`
    : `route delete ${ip}`;

  if (dryRun) return { success: true, ip, cmd };

  try {
    await runRoute(argv);
    return { success: true, ip };
  } catch (err) {
    return { success: false, ip, error: err.message };
  }
}

module.exports = { addRoute, removeRoute };
