#!/usr/bin/env node

const { showBanner, showResult, c, Spinner } = require('../src/ui');
const { ensureAdmin } = require('../src/platform');
const { detect } = require('../src/gateway');
const { resolveAll } = require('../src/resolver');
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
  services: [],
  addDomain: null,
  removeDomain: null,
};

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
  showBanner();

  if (!flags.dryRun) {
    ensureAdmin();
  }

  const started = Date.now();

  // Detect gateway
  const spinner = new Spinner();
  spinner.start('Detecting Wi-Fi gateway…');

  const gateway = detect();
  if (!gateway) {
    spinner.stop(c.red('✖'), c.red('No Wi-Fi gateway found — connect to Wi-Fi first.'));
    process.exit(1);
  }
  spinner.stop(c.green('✔'), `Gateway ${c.bold(gateway)}`);

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

  // Process each service
  const allIps = new Set();
  let totalRouted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  const touchedServices = [];
  const actioning = flags.remove ? 'Removing' : 'Routing';

  if (!flags.dryRun) {
    spinner.start(`${actioning} services…`);
  }

  for (const [, svc] of Object.entries(selectedServices)) {
    if (flags.dryRun) {
      console.log('');
      console.log(`  ${c.bold(svc.name)} ${c.dim(`(${svc.domains.length} domain${svc.domains.length > 1 ? 's' : ''})`)}`);
    } else {
      spinner.update(`${c.dim('Resolving')} ${c.bold(svc.name)}…`);
    }

    const { resolved, failed } = await resolveAll(svc.domains);
    let svcRouted = 0;

    for (const domain of failed) {
      if (flags.dryRun) {
        console.log(`    ${c.yellow('--')} ${c.dim(domain)} ${c.dim('— no A records')}`);
      }
      totalSkipped++;
    }

    for (const [domain, ips] of resolved) {
      const newIps = ips.filter((ip) => !allIps.has(ip));

      if (newIps.length === 0) {
        if (flags.dryRun) {
          console.log(`    ${c.yellow('--')} ${c.dim(domain)} ${c.dim('— IPs already routed')}`);
        }
        totalSkipped++;
        continue;
      }

      if (!flags.dryRun) {
        spinner.update(`${actioning} ${c.bold(svc.name)} ${c.dim(`· ${domain}`)}`);
      }

      let hostFailed = false;
      for (const ip of newIps) {
        const result = flags.remove
          ? removeRoute(ip, { dryRun: flags.dryRun })
          : addRoute(ip, gateway, { dryRun: flags.dryRun });
        if (flags.dryRun) {
          console.log(`    ${c.dim('$')} ${c.dim(result.cmd)}`);
        }
        if (!result.success) hostFailed = true;
        allIps.add(ip);
      }

      if (hostFailed) {
        totalFailed++;
      } else {
        totalRouted++;
        svcRouted++;
      }
    }

    if (svcRouted > 0) touchedServices.push(svc.name);
  }

  if (flags.dryRun) {
    const verb = flags.remove ? 'removed' : 'routed';
    console.log('');
    console.log(`  ${c.cyan(c.bold('Dry run complete.'))} No routes were modified.`);
    console.log(`  ${c.dim(`${totalRouted} domain(s) would be ${verb}, ${totalSkipped} skipped.`)}`);
    console.log('');
    return;
  }

  spinner.stop();
  showResult({
    mode: flags.remove ? 'remove' : 'add',
    routed: totalRouted,
    skipped: totalSkipped,
    failed: totalFailed,
    services: touchedServices,
    gateway,
    elapsedMs: Date.now() - started,
  });
  if (!flags.remove && totalRouted > 0) {
    console.log(`  ${c.dim('Undo anytime:')} sudo bypass-vpn --remove`);
    console.log('');
  }
}

main().catch((err) => {
  console.error(c.red(`  Error: ${err.message}`));
  process.exit(1);
});
