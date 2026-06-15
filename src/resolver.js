const { execSync } = require('child_process');
const dns = require('dns');
const dnsPromises = dns.promises;

/**
 * Resolve a domain using `dig` (macOS/Linux) or `nslookup` (Windows).
 * These bypass the VPN tunnel's DNS interception.
 * Falls back to Node.js DNS if neither is available.
 */
function resolveDomain(domain) {
  if (process.platform === 'win32') {
    return resolveDomainWindows(domain);
  }
  return resolveDomainUnix(domain);
}

function resolveDomainUnix(domain) {
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

function resolveDomainWindows(domain) {
  let output;
  try {
    output = execSync(`nslookup "${domain}"`, {
      timeout: 5000,
      encoding: 'utf8',
    });
  } catch (err) {
    // nslookup often exits non-zero for non-authoritative answers;
    // the output is still valid, so parse it if available
    if (err.stdout) {
      output = err.stdout;
    } else {
      return null;
    }
  }
  try {
    const lines = output.split('\n').map((line) => line.trim());
    // Skip past the first "Address:" line (the DNS server itself)
    let pastServer = false;
    const ips = [];
    for (const line of lines) {
      if (!pastServer) {
        if (/^Address[es]*:/i.test(line)) pastServer = true;
        continue;
      }
      const match = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (match) {
        ips.push(match[1]);
      }
    }
    if (ips.length > 0) return ips;
  } catch {
    // parse failed — fall through to Node DNS
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
