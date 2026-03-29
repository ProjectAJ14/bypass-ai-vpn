const dns = require('dns');
const dnsPromises = dns.promises;

async function resolveAll(domains) {
  const resolved = new Map();
  const failed = [];

  const results = await Promise.allSettled(
    domains.map(async (domain) => {
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
      // Extract domain from the original array by index
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
