const { version } = require('../package.json');

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const SPIN_FRAMES = ['|', '/', '-', '\\'];

class Spinner {
  constructor() {
    this._interval = null;
    this._frame = 0;
  }

  start(text) {
    this._frame = 0;
    this._interval = setInterval(() => {
      const frame = c.cyan(SPIN_FRAMES[this._frame % SPIN_FRAMES.length]);
      process.stderr.write(`\r  ${frame} ${text}`);
      this._frame++;
    }, 80);
  }

  stop(symbol, text) {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    process.stderr.write(`\r  ${symbol} ${text}\x1b[K\n`);
  }
}

function showBanner() {
  console.log('');
  console.log(c.bold(c.cyan('  ╭─────────────────────────────────────╮')));
  console.log(c.bold(c.cyan(`  │      bypass-vpn  v${version.padEnd(18)}│`)));
  console.log(c.bold(c.cyan('  │  Route AI traffic around your VPN   │')));
  console.log(c.bold(c.cyan('  ╰─────────────────────────────────────╯')));
  console.log('');
}

function showSummary({ routed, skipped, failed }) {
  console.log('');
  console.log(c.bold(c.cyan('  ╭─────────────────────────────────────╮')));
  console.log(c.bold(c.cyan('  │            Results                  │')));
  console.log(c.bold(c.cyan('  ├─────────────────────────────────────┤')));
  console.log(c.bold(c.cyan('  │')) + `  ${c.green('Routed:')}  ${String(routed + ' host(s)').padEnd(26)}` + c.bold(c.cyan('│')));
  console.log(c.bold(c.cyan('  │')) + `  ${c.yellow('Skipped:')} ${String(skipped + ' host(s)').padEnd(26)}` + c.bold(c.cyan('│')));
  console.log(c.bold(c.cyan('  │')) + `  ${c.red('Failed:')}  ${String(failed + ' host(s)').padEnd(26)}` + c.bold(c.cyan('│')));
  console.log(c.bold(c.cyan('  ╰─────────────────────────────────────╯')));
  console.log('');

  if (failed === 0) {
    console.log(`  ${c.green(c.bold('All clear!'))} VPN bypassed for AI services.`);
  } else {
    console.log(`  ${c.yellow(c.bold('Partial success.'))} Some routes failed — see above.`);
  }
  console.log('');
}

module.exports = { c, Spinner, showBanner, showSummary };
