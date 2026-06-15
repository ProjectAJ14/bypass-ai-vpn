const { execFile } = require('child_process');
const { promisify } = require('util');
const { getPlatform } = require('./platform');

const execFileP = promisify(execFile);

const IP_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

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

async function addRoute(ip, gateway, { dryRun = false } = {}) {
  validateIp(ip);
  validateIp(gateway);

  const platform = getPlatform();

  if (platform === 'darwin') {
    const cmd = `route -n add -host ${ip} ${gateway}`;
    if (dryRun) return { success: true, ip, cmd };
    try { await run('route', ['-n', 'delete', '-host', ip]); } catch {}
    try {
      await run('route', ['-n', 'add', '-host', ip, gateway]);
      return { success: true, ip };
    } catch (err) {
      return { success: false, ip, error: err.message };
    }
  }

  // Windows
  const cmd = `route add ${ip} mask 255.255.255.255 ${gateway}`;
  if (dryRun) return { success: true, ip, cmd };
  try { await run('route', ['delete', ip]); } catch {}
  try {
    await run('route', ['add', ip, 'mask', '255.255.255.255', gateway]);
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
    await run('route', argv);
    return { success: true, ip };
  } catch (err) {
    return { success: false, ip, error: err.message };
  }
}

module.exports = { addRoute, removeRoute };
