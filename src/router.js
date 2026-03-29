const { execSync } = require('child_process');
const { getPlatform } = require('./platform');

const IP_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function validateIp(ip) {
  if (!IP_REGEX.test(ip)) {
    throw new Error(`Invalid IP address: ${ip}`);
  }
}

function addRoute(ip, gateway, { dryRun = false } = {}) {
  validateIp(ip);
  validateIp(gateway);

  const platform = getPlatform();
  let cmd;

  if (platform === 'darwin') {
    // Remove existing route first (ignore errors)
    const delCmd = `route -n delete -host ${ip} 2>/dev/null || true`;
    cmd = `route -n add -host ${ip} ${gateway}`;
    if (dryRun) {
      return { success: true, ip, cmd };
    }
    try { execSync(delCmd, { stdio: 'ignore' }); } catch {}
  } else {
    // Windows: remove existing then add
    const delCmd = `route delete ${ip}`;
    cmd = `route add ${ip} mask 255.255.255.255 ${gateway}`;
    if (dryRun) {
      return { success: true, ip, cmd };
    }
    try { execSync(delCmd, { stdio: 'ignore' }); } catch {}
  }

  try {
    execSync(cmd, { stdio: 'ignore' });
    return { success: true, ip };
  } catch (err) {
    return { success: false, ip, error: err.message };
  }
}

function removeRoute(ip) {
  validateIp(ip);

  const platform = getPlatform();
  let cmd;

  if (platform === 'darwin') {
    cmd = `route -n delete -host ${ip}`;
  } else {
    cmd = `route delete ${ip}`;
  }

  try {
    execSync(cmd, { stdio: 'ignore' });
    return { success: true, ip };
  } catch (err) {
    return { success: false, ip, error: err.message };
  }
}

module.exports = { addRoute, removeRoute };
