// ui.js — retro-CRT animated render engine.
//
// Presentation only. The orchestrator does the real routing work, builds a
// plain data object, and calls render(data, options). Nothing here touches
// gateways, DNS, or the routing table.
//
//   await render({
//     version, gateway,
//     services: [{ name, hosts: [{ host, status, ips?, note? }] }],
//   }, { speed, dryRun, mode, banner });
//
// status ∈ 'ok' | 'skip' | 'fail'. Returns { routed, skipped, failed }.

const t = require('./theme');

const out = (s) => process.stdout.write(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

// ── Shared formatting (used by both animated and static paths) ──

function tally(services) {
  let routed = 0;
  let skipped = 0;
  let failed = 0;
  for (const svc of services) {
    for (const h of svc.hosts) {
      if (h.status === 'ok') routed++;
      else if (h.status === 'fail') failed++;
      else skipped++;
    }
  }
  return { routed, skipped, failed };
}

function computeHostCol(services, cols) {
  let max = 0;
  for (const svc of services) {
    for (const h of svc.hosts) max = Math.max(max, t.visibleWidth(h.host));
  }
  return Math.min(max, Math.max(12, cols - 24));
}

// A resolved host line: aligned name + status glyph + ip/note.
function formatHost(h, hostCol) {
  const name = t.padEndVisible(h.host, hostCol);
  if (h.status === 'skip') {
    return `${t.paint.amber(t.glyph.skip)} ${t.paint.amber(name)}   ${t.dim(h.note || 'skipped')}`;
  }
  if (h.status === 'fail') {
    return `${t.paint.red(t.glyph.fail)} ${t.paint.red(name)}   ${t.dim(h.note || 'failed')}`;
  }
  const ips = h.ips || [];
  const first = ips[0] || '—';
  const extra = ips.length > 1 ? t.dim(` +${ips.length - 1}`) : '';
  return `${t.paint.green(t.glyph.routed)} ${t.paint.green(name)}   ${t.dim(t.glyph.arrow)} ${t.paint.agedGreen(first)}${extra}`;
}

function groupHeaderStr(svc, cols) {
  const n = svc.hosts.length;
  const left = `${t.glyph.groupMark} ${svc.name.toUpperCase()} `;
  const right = ` ${n} host${n === 1 ? '' : 's'}`;
  const width = Math.min(cols - 2, 56);
  const fill = Math.max(2, width - t.visibleWidth(left) - t.visibleWidth(right));
  return t.paint.agedGreen(left) + t.paint.faint(t.glyph.rule.repeat(fill)) + t.dim(right);
}

function gatewayLine(gateway) {
  return `${t.paint.green(t.glyph.gateway)} ${t.bold('Gateway ')}${t.paint.green(gateway)}  ${t.paint.agedGreen('[LINK ACQUIRED]')}`;
}

function countersContent(r, s, f, inner) {
  const parts =
    `${t.paint.green(`${t.glyph.routed} ${r} routed`)}   ` +
    `${t.paint.amber(`${t.glyph.skip} ${s} skipped`)}   ` +
    `${t.paint.red(`${t.glyph.fail} ${f} failed`)}`;
  return t.centerVisible(parts, inner);
}

function verdictLine(totals, mode, dryRun) {
  if (totals.failed === 0) {
    const head =
      mode === 'remove'
        ? 'ROUTES CLEARED · VPN routing restored'
        : 'ALL CLEAR · VPN bypassed for AI services';
    return `${t.paint.green(t.glyph.routed)} ${t.bold(t.paint.green(head))}${dryRun ? t.dim('  (dry run)') : ''}`;
  }
  return `${t.paint.amber(t.glyph.fail)} ${t.bold(t.paint.amber(`${totals.failed} route(s) failed — review above`))}`;
}

function bannerArtWidthFits(cols) {
  const art = t.figText('bypass-vpn');
  return { art, width: t.visibleWidth(art[0]), fits: t.visibleWidth(art[0]) <= cols - 4 };
}

// ── Animated path ──────────────────────────────────────────────

async function powerOn(speed, cols) {
  const width = Math.min(cols - 2, 60);
  const mid = Math.floor(width / 2);
  out('\n');
  // Hot scan-line snaps open from the centre.
  const step = Math.max(1, Math.floor(mid / 8));
  for (let half = 1; half <= mid; half += step) {
    const len = Math.min(width, half * 2);
    const line = t.centerVisible(t.paint.green(t.glyph.rule.repeat(len)), width);
    out(t.ansi.cr + t.ansi.clearLine + '  ' + line);
    await sleep(18 * speed);
  }
  // Bloom flash.
  out(t.ansi.cr + t.ansi.clearLine + '  ' + t.bold(t.paint.green(t.glyph.rule.repeat(width))));
  await sleep(90 * speed);
  // Unstable warm-up flickers.
  const dots = Array.from({ length: width }, (_, x) => (x % 2 ? ' ' : '·')).join('');
  for (let i = 0; i < 3; i++) {
    out(t.ansi.cr + t.ansi.clearLine + '  ' + t.paint.faint(dots));
    await sleep(50 * speed);
    out(t.ansi.cr + t.ansi.clearLine);
    await sleep(40 * speed);
  }
  out(t.ansi.cr + t.ansi.clearLine);
}

async function banner(version, speed, cols, dryRun) {
  const { art, width, fits } = bannerArtWidthFits(cols);
  if (!fits) {
    out('  ' + t.bold(t.gradientByColumn('bypass-vpn', 10, t.bannerStops)) + '\n');
  } else {
    out('  ' + t.paint.agedGreen(t.glyph.scanTop.repeat(width)) + '\n');
    for (const line of art) {
      out('  ' + t.paint.faint(line) + '\n'); // faint first…
      await sleep(45 * speed);
      out(t.ansi.up(1) + t.ansi.cr + t.ansi.clearLine + '  ' + t.gradientByColumn(line, width, t.bannerStops) + '\n'); // …then bright
      await sleep(35 * speed);
    }
    out('  ' + t.paint.agedGreen(t.glyph.scanBottom.repeat(width)) + '\n');
  }
  // Typewriter subtitle.
  const sub = `v${version}  ·  ${t.glyph.bullet} route AI traffic around your VPN`;
  out('  ');
  for (const ch of sub) {
    out(t.dim(ch));
    await sleep(8 * speed);
  }
  out((dryRun ? t.dim('  [dry run]') : '') + '\n\n');
}

async function gatewayProbe(gateway, speed) {
  const frames = t.spinners.signal;
  for (let i = 0; i < 6; i++) {
    out(t.ansi.cr + t.ansi.clearLine + '  ' + t.paint.amber(frames[i % frames.length]) + ' ' + t.dim('locating default gateway') + '   ');
    await sleep(90 * speed);
  }
  out(t.ansi.cr + t.ansi.clearLine + '  ' + gatewayLine(gateway) + '\n\n');
}

async function hostLine(h, speed, hostCol) {
  const frames = t.spinners.host;
  for (let i = 0; i < 5; i++) {
    out(t.ansi.cr + t.ansi.clearLine + '    ' + t.paint.green(frames[i % frames.length]) + ' ' + t.dim(`resolving ${h.host} …`));
    await sleep(55 * speed);
  }
  out(t.ansi.cr + t.ansi.clearLine + '    ' + formatHost(h, hostCol) + '\n');
  await sleep(20 * speed);
}

async function tunnel(routed, speed, cols) {
  out('\n');
  const label = 'ESTABLISHING SECURE ROUTES';
  const width = Math.min(cols - 10, 40);
  for (let i = 0; i <= width; i++) {
    const pct = Math.round((i / width) * 100);
    const headOn = i > 0 && i < width;
    const fullCount = headOn ? i - 1 : i;
    const emptyCount = Math.max(0, width - fullCount - (headOn ? 1 : 0));
    const rawBar = t.bar.full.repeat(fullCount) + (headOn ? t.bar.head : '') + t.bar.empty.repeat(emptyCount);
    out(t.ansi.cr + t.ansi.clearLine + '  ' + t.dim(label) + ' ' + t.paint.green(rawBar) + ' ' + t.bold(`${String(pct).padStart(3)}%`));
    await sleep(14 * speed);
  }
  out(t.ansi.cr + t.ansi.clearLine + '  ' + t.paint.green('▸') + ' ' + t.bold(`${routed} routes live`) + '\n');
}

async function summaryBox(totals, opts) {
  const { mode, dryRun, speed, cols } = opts;
  const inner = Math.min(cols - 4, 44);
  const v = t.paint.agedGreen(t.box.v);
  out('\n');
  out('  ' + t.paint.agedGreen(t.box.tl + t.box.h.repeat(inner) + t.box.tr) + '\n');
  const title = t.gradientByColumn(t.centerVisible('R E S U L T S', inner), inner, t.bannerStops);
  out('  ' + v + title + v + '\n');
  // Counters count up in place on a single line.
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const r = Math.round(totals.routed * k);
    const s = Math.round(totals.skipped * k);
    const f = Math.round(totals.failed * k);
    out(t.ansi.cr + t.ansi.clearLine + '  ' + v + countersContent(r, s, f, inner) + v);
    await sleep(28 * speed);
  }
  out('\n');
  out('  ' + t.paint.agedGreen(t.box.bl + t.box.h.repeat(inner) + t.box.br) + '\n');
  out('\n  ' + verdictLine(totals, mode, dryRun) + '\n');
  if (mode !== 'remove') out('\n  ' + t.dim('Undo anytime:  ') + 'sudo bypass-vpn --remove' + '\n');
  out('\n');
}

// ── Static path (non-TTY / --no-anim) ──────────────────────────

function renderStatic(data, opts) {
  const { mode, dryRun, showBannerArt, cols, totals } = opts;
  const hostCol = computeHostCol(data.services, cols);

  if (showBannerArt) {
    const { art, width, fits } = bannerArtWidthFits(cols);
    out('\n');
    if (!fits) {
      out('  ' + t.bold(t.gradientByColumn('bypass-vpn', 10, t.bannerStops)) + '\n');
    } else {
      out('  ' + t.paint.agedGreen(t.glyph.scanTop.repeat(width)) + '\n');
      for (const line of art) out('  ' + t.gradientByColumn(line, width, t.bannerStops) + '\n');
      out('  ' + t.paint.agedGreen(t.glyph.scanBottom.repeat(width)) + '\n');
    }
    out('  ' + t.dim(`v${data.version}  ·  ${t.glyph.bullet} route AI traffic around your VPN`) + (dryRun ? t.dim('  [dry run]') : '') + '\n\n');
  }

  out('  ' + gatewayLine(data.gateway) + '\n\n');

  for (const svc of data.services) {
    out('  ' + groupHeaderStr(svc, cols) + '\n');
    for (const h of svc.hosts) out('    ' + formatHost(h, hostCol) + '\n');
  }

  out('\n  ' + t.paint.green('▸') + ' ' + t.bold(`${totals.routed} routes live`) + '\n');

  const inner = Math.min(cols - 4, 44);
  const v = t.paint.agedGreen(t.box.v);
  out('\n');
  out('  ' + t.paint.agedGreen(t.box.tl + t.box.h.repeat(inner) + t.box.tr) + '\n');
  out('  ' + v + t.gradientByColumn(t.centerVisible('R E S U L T S', inner), inner, t.bannerStops) + v + '\n');
  out('  ' + v + countersContent(totals.routed, totals.skipped, totals.failed, inner) + v + '\n');
  out('  ' + t.paint.agedGreen(t.box.bl + t.box.h.repeat(inner) + t.box.br) + '\n');
  out('\n  ' + verdictLine(totals, mode, dryRun) + '\n');
  if (mode !== 'remove') out('\n  ' + t.dim('Undo anytime:  ') + 'sudo bypass-vpn --remove' + '\n');
  out('\n');
}

// ── Orchestrator ───────────────────────────────────────────────

async function render(data, options = {}) {
  const speed = options.speed == null ? 1 : options.speed;
  const animate = (process.stdout.isTTY || options._forceAnimate) && speed > 0;
  const mode = options.mode || 'add';
  const dryRun = !!options.dryRun;
  const showBannerArt = options.banner !== false;
  const cols = process.stdout.columns || 80;
  const totals = tally(data.services);

  if (!animate) {
    renderStatic(data, { mode, dryRun, showBannerArt, cols, totals });
    return totals;
  }

  const hostCol = computeHostCol(data.services, cols);
  out(t.ansi.hideCursor);
  try {
    await powerOn(speed, cols);
    if (showBannerArt) await banner(data.version, speed, cols, dryRun);
    await gatewayProbe(data.gateway, speed);
    for (const svc of data.services) {
      out('  ' + groupHeaderStr(svc, cols) + '\n');
      await sleep(40 * speed);
      for (const h of svc.hosts) await hostLine(h, speed, hostCol);
    }
    await tunnel(totals.routed, speed, cols);
    await summaryBox(totals, { mode, dryRun, speed, cols });
  } finally {
    out(t.ansi.showCursor); // never leave the cursor hidden
  }
  return totals;
}

module.exports = { render };
