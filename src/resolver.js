const { execSync } = require('child_process');
const dns = require('dns');
const dnsPromises = dns.promises;

/**
 * Resolve a domain using `dig` — works outside VPN tunnel.
 * Falls back to Node.js DNS if `dig` is unavailable.
 */
function resolveDomain(domain) {
  try {
    const output = execSync(`dig +short +time=3 "${domain}"`, {
      timeout: 5000,
      encoding: 'utf8',
    });
    const ips = output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^\d+\.\d+\.\d+\.\d+$/.test(line));
    if (ips.length > 0) return ips;
  } catch {
    // dig not available or failed — fall through to Node DNS
  }
  return null;
}

async function resolveAll(domains) {
  const resolved = new Map();
  const failed = [];

  const results = await Promise.allSettled(
    domains.map(async (domain) => {
      // Try dig first (bypasses VPN DNS interception)
      const digIps = resolveDomain(domain);
      if (digIps) return { domain, ips: digIps };

      // Fallback to Node.js built-in DNS
      const ips = await withTimeout(dnsPromises.resolve4(domain), 5000);
      return { domain, ips };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { domain, ips } = result.value;
      if (ips && ips.length > 0) {
        resolved.set(domain, ips);
      } else {
        failed.push(domain);
      }
    } else {
      const idx = results.indexOf(result);
      failed.push(domains[idx]);
    }
  }

  return { resolved, failed };
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DNS timeout')), ms);
    promise
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

module.exports = { resolveAll };
