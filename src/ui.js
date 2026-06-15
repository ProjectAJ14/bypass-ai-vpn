const { version } = require('../package.json');

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const SPIN_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

class Spinner {
  constructor() {
    this._interval = null;
    this._frame = 0;
    this._text = '';
  }

  start(text) {
    this._text = text;
    this._frame = 0;
    if (this._interval) return;
    this._render();
    this._interval = setInterval(() => this._render(), 80);
  }

  // Change the message without interrupting the animation.
  update(text) {
    this._text = text;
  }

  _render() {
    const frame = c.cyan(SPIN_FRAMES[this._frame % SPIN_FRAMES.length]);
    process.stderr.write(`\r\x1b[K  ${frame} ${this._text}`);
    this._frame++;
  }

  // stop() with a symbol+text leaves a persistent line; stop() with no args
  // just clears the spinner line.
  stop(symbol, text) {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    if (symbol || text) {
      process.stderr.write(`\r\x1b[K  ${symbol} ${text}\n`);
    } else {
      process.stderr.write('\r\x1b[K');
    }
  }
}

function showBanner() {
  console.log('');
  console.log(`  ${c.bold(c.cyan('bypass-vpn'))} ${c.dim('v' + version)}  ${c.dim('· route traffic around your VPN')}`);
  console.log('');
}

// One concise block summarizing the whole run.
function showResult({ mode, routed, skipped, failed, services, gateway, elapsedMs }) {
  const secs = (elapsedMs / 1000).toFixed(1);
  const verb = mode === 'remove' ? 'removed' : 'routed';
  console.log('');

  if (failed === 0 && routed > 0) {
    const headline = mode === 'remove' ? 'Routes removed' : 'VPN bypassed';
    console.log(`  ${c.green('✔')} ${c.bold(headline)} ${c.dim(`· ${secs}s`)}`);
  } else if (failed === 0 && routed === 0) {
    console.log(`  ${c.yellow('•')} ${c.bold('Nothing to do')} ${c.dim(`· already up to date · ${secs}s`)}`);
  } else {
    console.log(`  ${c.yellow('!')} ${c.bold('Partial success')} ${c.dim(`· ${secs}s`)}`);
  }

  const stats = [`${c.bold(routed)} ${c.dim(verb)}`];
  if (skipped > 0) stats.push(`${c.bold(skipped)} ${c.dim('skipped')}`);
  if (failed > 0) stats.push(`${c.red(c.bold(failed))} ${c.dim('failed')}`);
  console.log(`    ${stats.join(c.dim('  ·  '))}`);

  if (services.length > 0) {
    console.log(`    ${c.dim(services.join(', '))} ${c.dim('via')} ${c.dim(gateway)}`);
  }
  console.log('');
}

module.exports = { c, Spinner, showBanner, showResult };
