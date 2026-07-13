// ui.js — live retro-CRT render engine.
//
// Presentation only. The orchestrator owns a plain, MUTABLE data object and a
// `work` callback that does the real routing. renderLive() plays the intro,
// starts a live loop that redraws the host block on a timer, runs work()
// (which flips each host's status as its real DNS/route work lands), then
// prints the summary. Nothing here touches gateways, DNS, or the route table.
//
//   const totals = await renderLive(
//     { version, gateway, services: [{ name, hosts: [{ host, status, ips?, note? }] }] },
//     { speed, budgetMs, dryRun, mode, banner },
//     async () => { /* mutate data.services[].hosts[].status / .ips / .note */ },
//   );
//
// host.status ∈ 'pending' | 'resolving' | 'routing' | 'ok' | 'skip' | 'fail'.
// Returns { routed, skipped, failed }.

const t = require('./theme');

const out = (s) => process.stdout.write(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

// Base durations (ms) for the intro/summary beats. The middle (host) section is
// real-timed — it lasts exactly as long as the real resolve+route work takes.
const D = {
  powerScan: 18,
  powerBloom: 90,
  flickOn: 50,
  flickOff: 40,
  bannerLine: 45,
  bannerBright: 35,
  type: 8,
  gw: 90,
  counter: 28,
};
const GW_FRAMES = 6;
const COUNTER_STEPS = 17;
const LIVE_INTERVAL = 70; // ms between live redraws (spinner cadence)

// Pacing factor for the (fixed) intro+summary beats so they fit budgetMs.
let PACE_K = 1;
const pace = (base) => sleep(base * PACE_K);

function powerOnIters(cols) {
  const width = Math.min(cols - 2, 60);
  const mid = Math.floor(width / 2);
  const step = Math.max(1, Math.floor(mid / 8));
  return Math.floor((mid - 1) / step) + 1;
}

// Weight of the non-work beats only (intro + summary count-up), used to scale
// PACE_K to budgetMs. The live host section is excluded — it is real-timed.
function estimateChromeWeight(data, opts, cols) {
  let w = 0;
  w += powerOnIters(cols) * D.powerScan + D.powerBloom + 3 * (D.flickOn + D.flickOff);
  if (opts.showBannerArt) {
    if (bannerArtWidthFits(cols).fits) w += 6 * (D.bannerLine + D.bannerBright);
    const sub = `v${opts.version}  ·  ${t.glyph.bullet} route AI traffic around your VPN`;
    w += [...sub].length * D.type;
  }
  w += GW_FRAMES * D.gw;
  w += COUNTER_STEPS * D.counter;
  return w;
}

// ── Shared formatting (used by live, static, and summary paths) ──

function tally(services) {
  let routed = 0;
  let skipped = 0;
  let failed = 0;
  for (const svc of services) {
    for (const h of svc.hosts) {
      if (h.status === 'ok') routed++;
      else if (h.status === 'fail') failed++;
      else if (h.status === 'skip') skipped++;
    }
  }
  return { routed, skipped, failed };
}

function liveCounts(services) {
  let total = 0;
  let done = 0;
  for (const svc of services) {
    for (const h of svc.hosts) {
      total++;
      if (h.status === 'ok' || h.status === 'skip' || h.status === 'fail') done++;
    }
  }
  return { total, done };
}

function computeHostCol(services, cols) {
  let max = 0;
  for (const svc of services) {
    for (const h of svc.hosts) max = Math.max(max, t.visibleWidth(h.host));
  }
  return Math.min(max, Math.max(12, cols - 28));
}

// A settled host line: aligned name + status glyph + ip/note.
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

// An in-flight host line — animated spinner reflecting real work in progress.
function liveHostLine(h, frame, hostCol, mode) {
  const name = t.padEndVisible(h.host, hostCol);
  const spin = t.spinners.host;
  if (h.status === 'resolving') {
    const f = spin[frame % spin.length];
    return `${t.paint.amber(f)} ${t.dim(name)}   ${t.dim('resolving …')}`;
  }
  if (h.status === 'routing') {
    const f = spin[frame % spin.length];
    const verb = mode === 'remove' ? 'removing route …' : 'adding route …';
    return `${t.paint.green(f)} ${name}   ${t.dim(verb)}`;
  }
  if (h.status === 'pending') {
    return `${t.dim('·')} ${t.dim(name)}   ${t.dim('queued')}`;
  }
  return formatHost(h, hostCol);
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

// ── Intro animation (short, real sleeps, bounded by budgetMs) ──

async function powerOn(cols) {
  const width = Math.min(cols - 2, 60);
  const mid = Math.floor(width / 2);
  out('\n');
  const step = Math.max(1, Math.floor(mid / 8));
  for (let half = 1; half <= mid; half += step) {
    const len = Math.min(width, half * 2);
    const line = t.centerVisible(t.paint.green(t.glyph.rule.repeat(len)), width);
    out(t.ansi.cr + t.ansi.clearLine + '  ' + line);
    await pace(D.powerScan);
  }
  out(t.ansi.cr + t.ansi.clearLine + '  ' + t.bold(t.paint.green(t.glyph.rule.repeat(width))));
  await pace(D.powerBloom);
  const dots = Array.from({ length: width }, (_, x) => (x % 2 ? ' ' : '·')).join('');
  for (let i = 0; i < 3; i++) {
    out(t.ansi.cr + t.ansi.clearLine + '  ' + t.paint.faint(dots));
    await pace(D.flickOn);
    out(t.ansi.cr + t.ansi.clearLine);
    await pace(D.flickOff);
  }
  out(t.ansi.cr + t.ansi.clearLine);
}

async function banner(version, cols, dryRun) {
  const { art, width, fits } = bannerArtWidthFits(cols);
  if (!fits) {
    out('  ' + t.bold(t.gradientByColumn('bypass-vpn', 10, t.bannerStops)) + '\n');
  } else {
    out('  ' + t.paint.agedGreen(t.glyph.scanTop.repeat(width)) + '\n');
    for (const line of art) {
      out('  ' + t.paint.faint(line) + '\n');
      await pace(D.bannerLine);
      out(t.ansi.up(1) + t.ansi.cr + t.ansi.clearLine + '  ' + t.gradientByColumn(line, width, t.bannerStops) + '\n');
      await pace(D.bannerBright);
    }
    out('  ' + t.paint.agedGreen(t.glyph.scanBottom.repeat(width)) + '\n');
  }
  const sub = `v${version}  ·  ${t.glyph.bullet} route AI traffic around your VPN`;
  out('  ');
  for (const ch of sub) {
    out(t.dim(ch));
    await pace(D.type);
  }
  out((dryRun ? t.dim('  [dry run]') : '') + '\n\n');
}

async function gatewayProbe(gateway) {
  const frames = t.spinners.signal;
  for (let i = 0; i < GW_FRAMES; i++) {
    out(t.ansi.cr + t.ansi.clearLine + '  ' + t.paint.amber(frames[i % frames.length]) + ' ' + t.dim('locating default gateway') + '   ');
    await pace(D.gw);
  }
  out(t.ansi.cr + t.ansi.clearLine + '  ' + gatewayLine(gateway) + '\n\n');
}

async function summaryBox(totals, opts) {
  const { mode, dryRun, cols } = opts;
  const inner = Math.min(cols - 4, 44);
  const v = t.paint.agedGreen(t.box.v);
  out('\n');
  out('  ' + t.paint.agedGreen(t.box.tl + t.box.h.repeat(inner) + t.box.tr) + '\n');
  const title = t.gradientByColumn(t.centerVisible('R E S U L T S', inner), inner, t.bannerStops);
  out('  ' + v + title + v + '\n');
  const steps = COUNTER_STEPS - 1;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const r = Math.round(totals.routed * k);
    const s = Math.round(totals.skipped * k);
    const f = Math.round(totals.failed * k);
    out(t.ansi.cr + t.ansi.clearLine + '  ' + v + countersContent(r, s, f, inner) + v);
    await pace(D.counter);
  }
  out('\n');
  out('  ' + t.paint.agedGreen(t.box.bl + t.box.h.repeat(inner) + t.box.br) + '\n');
  out('\n  ' + verdictLine(totals, mode, dryRun) + '\n');
  if (mode !== 'remove') out('\n  ' + t.dim('Undo anytime:  ') + 'bypass-vpn --remove' + '\n');
  out('\n');
}

// ── Live host block (redrawn in place; reflects real work) ──────

function makeLiveBlock(data, opts) {
  const { cols, mode } = opts;
  const hostCol = computeHostCol(data.services, cols);
  let frame = 0;
  let lastLines = 0;

  function blockLines() {
    const lines = [];
    for (const svc of data.services) {
      lines.push('  ' + groupHeaderStr(svc, cols));
      for (const h of svc.hosts) lines.push('    ' + liveHostLine(h, frame, hostCol, mode));
    }
    const { total, done } = liveCounts(data.services);
    const label = done < total
      ? `${t.dim('working …')} ${t.paint.green(`${done}`)}${t.dim(`/${total}`)}`
      : `${t.paint.green(t.glyph.arrow)} ${t.bold(`${tally(data.services).routed} routes live`)}`;
    lines.push('');
    lines.push('  ' + label);
    return lines;
  }

  function draw() {
    const lines = blockLines();
    let s = '';
    if (lastLines > 0) s += t.ansi.up(lastLines);
    for (const ln of lines) s += t.ansi.cr + t.ansi.clearLine + ln + '\n';
    out(s);
    lastLines = lines.length;
  }

  return {
    draw,
    advance() { frame++; },
  };
}

// ── Static path (non-TTY / --no-anim): work runs, then one dump ──

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

  out('\n  ' + t.paint.green(t.glyph.arrow) + ' ' + t.bold(`${totals.routed} routes live`) + '\n');

  const inner = Math.min(cols - 4, 44);
  const v = t.paint.agedGreen(t.box.v);
  out('\n');
  out('  ' + t.paint.agedGreen(t.box.tl + t.box.h.repeat(inner) + t.box.tr) + '\n');
  out('  ' + v + t.gradientByColumn(t.centerVisible('R E S U L T S', inner), inner, t.bannerStops) + v + '\n');
  out('  ' + v + countersContent(totals.routed, totals.skipped, totals.failed, inner) + v + '\n');
  out('  ' + t.paint.agedGreen(t.box.bl + t.box.h.repeat(inner) + t.box.br) + '\n');
  out('\n  ' + verdictLine(totals, mode, dryRun) + '\n');
  if (mode !== 'remove') out('\n  ' + t.dim('Undo anytime:  ') + 'bypass-vpn --remove' + '\n');
  out('\n');
}

// ── Orchestrator ───────────────────────────────────────────────

async function renderLive(data, options = {}, work = async () => {}) {
  const speed = options.speed == null ? 1 : options.speed;
  const animate = (process.stdout.isTTY || options._forceAnimate) && speed > 0;
  const mode = options.mode || 'add';
  const dryRun = !!options.dryRun;
  const showBannerArt = options.banner !== false;
  const cols = process.stdout.columns || 80;

  // Non-animated (piped / --no-anim): do the real work, then dump once.
  if (!animate) {
    await work();
    const totals = tally(data.services);
    renderStatic(data, { mode, dryRun, showBannerArt, cols, totals });
    return totals;
  }

  const budgetMs = options.budgetMs == null ? 1000 : options.budgetMs;
  const weight = estimateChromeWeight(data, { showBannerArt, version: data.version }, cols);
  PACE_K = weight > 0 ? Math.min(1, budgetMs / weight) : 0;

  out(t.ansi.hideCursor);
  let timer = null;
  try {
    await powerOn(cols);
    if (showBannerArt) await banner(data.version, cols, dryRun);
    await gatewayProbe(data.gateway);

    // Start the live block: spinners animate on a timer while real work runs.
    const block = makeLiveBlock(data, { cols, mode });
    block.draw();
    timer = setInterval(() => { block.advance(); block.draw(); }, LIVE_INTERVAL);

    await work(); // mutates each host's status/ips/note as real work lands

    clearInterval(timer);
    timer = null;
    block.draw(); // final settled frame

    await summaryBox(tally(data.services), { mode, dryRun, cols });
  } finally {
    if (timer) clearInterval(timer);
    out(t.ansi.showCursor);
  }
  return tally(data.services);
}

module.exports = { renderLive };
