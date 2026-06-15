const { execFile } = require('child_process');
const { promisify } = require('util');
const dns = require('dns');

const execFileP = promisify(execFile);
const dnsPromises = dns.promises;

const IP_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * Resolve a single domain to its A records, returning an array of IPs or null.
 *
 * Uses async `execFile` (NOT execSync) so that many domains can be resolved
 * truly concurrently — execSync would block the event loop and serialise every
 * lookup. Prefers `dig`/`nslookup` (which bypass the VPN's DNS interception),
 * then falls back to Node's built-in resolver.
 */
async function resolveOne(domain) {
  if (process.platform === 'win32') {
    const ips = await resolveWindows(domain);
    if (ips) return ips;
  } else {
    const ips = await resolveUnix(domain);
    if (ips) return ips;
  }

  // Fallback: Node.js built-in DNS.
  try {
    const ips = await withTimeout(dnsPromises.resolve4(domain), 4000);
    if (ips && ips.length > 0) return ips;
  } catch {
    // give up below
  }
  return null;
}

async function resolveUnix(domain) {
  try {
    // +time=2 +tries=1 keeps the worst case short; all lookups run in parallel.
    const { stdout } = await execFileP(
      'dig',
      ['+short', '+time=2', '+tries=1', domain],
      { timeout: 4000 },
    );
    const ips = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => IP_RE.test(l));
    if (ips.length > 0) return ips;
  } catch {
    // dig missing or failed — caller falls back to Node DNS
  }
  return null;
}

async function resolveWindows(domain) {
  let stdout;
  try {
    ({ stdout } = await execFileP('nslookup', [domain], { timeout: 4000 }));
  } catch (err) {
    // nslookup often exits non-zero for non-authoritative answers; the stdout
    // it produced is still valid, so parse it when present.
    if (err.stdout) stdout = err.stdout;
    else return null;
  }
  try {
    const lines = stdout.split('\n').map((l) => l.trim());
    let pastServer = false;
    const ips = [];
    for (const line of lines) {
      if (!pastServer) {
        if (/^Address[es]*:/i.test(line)) pastServer = true;
        continue;
      }
      const match = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (match) ips.push(match[1]);
    }
    if (ips.length > 0) return ips;
  } catch {
    // parse failed — caller falls back to Node DNS
  }
  return null;
}

/**
 * Resolve many domains concurrently. Retained for callers that want a single
 * batch result; the live CLI drives resolveOne() per host instead so it can
 * update each line the moment that lookup lands.
 */
async function resolveAll(domains) {
  const resolved = new Map();
  const failed = [];
  const results = await Promise.all(
    domains.map(async (domain) => ({ domain, ips: await resolveOne(domain) })),
  );
  for (const { domain, ips } of results) {
    if (ips && ips.length > 0) resolved.set(domain, ips);
    else failed.push(domain);
  }
  return { resolved, failed };
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DNS timeout')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

module.exports = { resolveOne, resolveAll };
