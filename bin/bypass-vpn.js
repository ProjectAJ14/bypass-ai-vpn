#!/usr/bin/env node

const { renderLive } = require('../src/ui');
const { c, ansi } = require('../src/theme');
const { ensureAdmin } = require('../src/platform');
const { detect } = require('../src/gateway');
const { resolveOne } = require('../src/resolver');
const { addRoute, removeRoute } = require('../src/router');
const services = require('../src/services');
const { loadConfig, addDomain, removeDomain } = require('../src/config');
const { version } = require('../package.json');

// ── Arg parsing ────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {
  help: args.includes('--help') || args.includes('-h'),
  version: args.includes('--version') || args.includes('-v'),
  remove: args.includes('--remove') || args.includes('-r'),
  dryRun: args.includes('--dry-run'),
  list: args.includes('--list'),
  fast: args.includes('--fast'),
  slow: args.includes('--slow'),
  noAnim: args.includes('--no-anim'),
  noBanner: args.includes('--no-banner'),
  services: [],
  addDomain: null,
  removeDomain: null,
};

// budgetMs bounds only the fixed intro+summary "chrome" beats — the live host
// section is real-timed and lasts exactly as long as the real parallel work.
const speed = flags.noAnim ? 0 : 1;
const budgetMs = flags.fast ? 500 : flags.slow ? 1600 : 850;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--service' && args[i + 1]) {
    flags.services.push(args[i + 1].toLowerCase());
    i++;
  } else if (args[i] === '--add-domain' && args[i + 1]) {
    flags.addDomain = args[i + 1];
    i++;
  } else if (args[i] === '--remove-domain' && args[i + 1]) {
    flags.removeDomain = args[i + 1];
    i++;
  }
}

// ── Help ───────────────────────────────────────────────────────

if (flags.help) {
  console.log(`
  ${c.bold('bypass-vpn')} v${version}
  Route AI service traffic through Wi-Fi gateway to bypass VPN.

  ${c.bold('Usage:')}
    ${c.cyan('sudo')} bypass-vpn              Add routes (macOS)
    bypass-vpn                    Add routes (Windows, elevated)
    bypass-vpn ${c.dim('--remove')}          Remove previously added routes
    bypass-vpn ${c.dim('--dry-run')}         Show commands without executing
    bypass-vpn ${c.dim('--service claude')}  Route specific service(s) only
    bypass-vpn ${c.dim('--list')}            List available services
    bypass-vpn ${c.dim('--add-domain')} h    Save a custom domain for routing
    bypass-vpn ${c.dim('--remove-domain')} h Remove a saved custom domain

  ${c.bold('Flags:')}
    -h, --help              Show this help
    -v, --version           Show version
    -r, --remove            Remove routes instead of adding
        --dry-run           Print route commands without executing
        --service <name>    Route only specified service (repeatable)
        --list              List services and their domains
        --add-domain <host> Save a custom domain (persisted in ~/.bypass-vpn.json)
        --remove-domain <h> Remove a saved custom domain
        --fast              Faster animation
        --slow              Slower, more cinematic animation
        --no-anim           Skip animation, print final frames instantly
        --no-banner         Skip the ASCII banner

  ${c.bold('Services:')} claude, chatgpt, firebase, googleauth, atlassian

  ${c.bold('Examples:')}
    sudo npx bypass-vpn
    sudo bypass-vpn --service claude --service chatgpt
    bypass-vpn --add-domain mycompany.atlassian.net
    sudo bypass-vpn
    sudo bypass-vpn --remove
`);
  process.exit(0);
}

// ── Version ────────────────────────────────────────────────────

if (flags.version) {
  console.log(version);
  process.exit(0);
}

// ── Add / Remove domain ───────────────────────────────────────

const DOMAIN_RE = /^[a-zA-Z0-9.-]+$/;

if (flags.addDomain) {
  if (!DOMAIN_RE.test(flags.addDomain)) {
    console.error(c.red(`  Invalid domain: ${flags.addDomain}`));
    process.exit(1);
  }
  addDomain(flags.addDomain);
  console.log(`  ${c.green('Saved:')} ${flags.addDomain}`);
  console.log(`  ${c.dim('This domain will be routed on every run.')}`);
  process.exit(0);
}

if (flags.removeDomain) {
  removeDomain(flags.removeDomain);
  console.log(`  ${c.green('Removed:')} ${flags.removeDomain}`);
  process.exit(0);
}

// ── List ───────────────────────────────────────────────────────

if (flags.list) {
  console.log('');
  for (const [key, svc] of Object.entries(services)) {
    console.log(`  ${c.bold(svc.name)} ${c.dim(`(--service ${key})`)}`);
    for (const d of svc.domains) {
      console.log(`    ${c.dim('-')} ${d}`);
    }
    console.log('');
  }
  const config = loadConfig();
  if (config.domains.length > 0) {
    console.log(`  ${c.bold('Custom Domains')} ${c.dim('(saved via --add-domain)')}`);
    for (const d of config.domains) {
      console.log(`    ${c.dim('-')} ${d}`);
    }
    console.log('');
  }
  process.exit(0);
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  if (!flags.dryRun) {
    ensureAdmin();
  }

  // Detect gateway (real work — bail early with a plain message if missing)
  const gateway = detect();
  if (!gateway) {
    process.stdout.write('\n  ' + c.red('✖ No Wi-Fi gateway found — connect to Wi-Fi first.') + '\n\n');
    process.exit(1);
  }

  // Select services
  let selectedServices;
  if (flags.services.length > 0) {
    selectedServices = {};
    for (const key of flags.services) {
      if (!services[key]) {
        console.error(c.red(`  Unknown service: ${key}`));
        console.error(c.dim(`  Available: ${Object.keys(services).join(', ')}`));
        process.exit(1);
      }
      selectedServices[key] = services[key];
    }
  } else {
    selectedServices = { ...services };
  }

  // Inject saved custom domains
  const config = loadConfig();
  if (config.domains.length > 0) {
    selectedServices.custom = {
      name: 'Custom Domains',
      domains: config.domains,
    };
  }

  // Build a mutable data model — every host starts 'pending'. The live renderer
  // reflects each host's status as the real (parallel) work flips it.
  const dataServices = Object.values(selectedServices).map((svc) => ({
    name: svc.name,
    hosts: svc.domains.map((domain) => ({ host: domain, status: 'pending' })),
  }));

  // Shared across all concurrent hosts. JS is single-threaded, so the
  // synchronous filter+add block below is race-free — no two hosts can claim
  // the same IP, and "already routed" stays correct.
  const claimedIps = new Set();

  // The actual routing work, run for every host CONCURRENTLY. resolveOne and
  // addRoute/removeRoute are async (execFile), so all DNS lookups and route
  // commands overlap instead of running one-at-a-time.
  const work = async () => {
    const tasks = [];
    for (const svc of dataServices) {
      for (const h of svc.hosts) {
        tasks.push((async () => {
          h.status = 'resolving';
          const ips = await resolveOne(h.host);
          if (!ips || ips.length === 0) {
            h.status = 'skip';
            h.note = 'no A records';
            return;
          }

          const newIps = ips.filter((ip) => !claimedIps.has(ip));
          newIps.forEach((ip) => claimedIps.add(ip));

          if (newIps.length === 0) {
            h.status = 'skip';
            h.ips = ips;
            h.note = 'already routed';
            return;
          }

          h.ips = newIps;
          h.status = 'routing';

          let hostFailed = false;
          for (const ip of newIps) {
            const result = flags.remove
              ? await removeRoute(ip, { dryRun: flags.dryRun })
              : await addRoute(ip, gateway, { dryRun: flags.dryRun });
            if (!result.success) hostFailed = true;
          }

          h.status = hostFailed ? 'fail' : 'ok';
          h.note = hostFailed ? 'route command failed' : undefined;
        })());
      }
    }
    await Promise.all(tasks);
  };

  await renderLive(
    { version, gateway, services: dataServices },
    {
      speed,
      budgetMs,
      dryRun: flags.dryRun,
      mode: flags.remove ? 'remove' : 'add',
      banner: !flags.noBanner,
    },
    work,
  );
}

main().catch((err) => {
  process.stdout.write(ansi.showCursor); // never leave the cursor hidden
  console.error('\n  ' + c.red(`Error: ${err.message}`) + '\n');
  process.exit(1);
});
