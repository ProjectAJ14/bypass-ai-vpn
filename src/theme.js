// theme.js — single source of truth for the retro-CRT look.
//
// Colours, glyphs, spinner frames, box-drawing chars, the bundled "ANSI
// Shadow" banner font, and low-level ANSI helpers. Re-skin the whole CLI by
// editing this file alone. Zero dependencies — raw ANSI escape codes only.

// ── Colour gating ──────────────────────────────────────────────
// NO_COLOR disables colour entirely. FORCE_COLOR forces it on (handy for
// piping into a file to preview). Otherwise colour follows TTY detection so
// piping into `cat`/logs stays free of escape-code soup.
const useColor = process.env.NO_COLOR
  ? false
  : process.env.FORCE_COLOR
    ? true
    : !!process.stdout.isTTY;

// ── Phosphor palette (24-bit hex) ──────────────────────────────
const palette = {
  green: '#39ff14', // hot phosphor green
  agedGreen: '#1f8a3b', // settled green
  faintGreen: '#0e3b1c', // barely-lit / warm-up
  amber: '#ffb000', // amber phosphor
  red: '#ff3b30', // alert
};

// Banner gradient: amber → green → green → amber across the width.
const bannerStops = [palette.amber, palette.green, palette.green, palette.amber];

// ── Hex / truecolor helpers ────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function lerpRgb(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Colour at fraction `frac` (0..1) across an array of hex stops.
function colorAt(stops, frac) {
  const f = Math.max(0, Math.min(1, frac));
  const span = stops.length - 1;
  const seg = f * span;
  const i = Math.min(Math.floor(seg), span - 1);
  return lerpRgb(hexToRgb(stops[i]), hexToRgb(stops[i + 1]), seg - i);
}

const RESET = '\x1b[0m';

// Wrap text in a 24-bit foreground colour (hex or [r,g,b]); no-op without colour.
function fgHex(hex, str) {
  if (!useColor) return str;
  const [r, g, b] = Array.isArray(hex) ? hex : hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m${str}${RESET}`;
}

function bold(str) {
  return useColor ? `\x1b[1m${str}${RESET}` : str;
}

function dim(str) {
  return useColor ? `\x1b[2m${str}${RESET}` : str;
}

// Convenience phosphor wrappers.
const paint = {
  green: (s) => fgHex(palette.green, s),
  agedGreen: (s) => fgHex(palette.agedGreen, s),
  faint: (s) => fgHex(palette.faintGreen, s),
  amber: (s) => fgHex(palette.amber, s),
  red: (s) => fgHex(palette.red, s),
};

// Colour each visible code point of `line` by its column position, so a
// horizontal gradient stays continuous across stacked lines of equal width.
function gradientByColumn(line, width, stops) {
  if (!useColor) return line;
  const chars = [...line];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === ' ') {
      out += ch;
      continue;
    }
    const frac = width <= 1 ? 0 : i / (width - 1);
    out += fgHex(colorAt(stops, frac), ch);
  }
  return out;
}

// ── Back-compat named colours (used by --help/--list and friends) ──
const c = {
  red: paint.red,
  green: paint.green,
  yellow: paint.amber,
  cyan: paint.green,
  bold,
  dim,
};

// ── Glyphs ─────────────────────────────────────────────────────
const glyph = {
  routed: '▣',
  skip: '◌',
  fail: '▤',
  gateway: '▣',
  bullet: '☰',
  arrow: '➜',
  groupMark: '◇',
  rule: '─',
  scanTop: '▔',
  scanBottom: '▁',
};

// ── Spinner frames ─────────────────────────────────────────────
const spinners = {
  signal: ['▱▱▱', '▰▱▱', '▰▰▱', '▰▰▰'], // gateway sweep
  host: ['◜', '◠', '◝', '◞', '◡', '◟'], // per-host resolve
};

// ── Box drawing (double line) + progress bar ───────────────────
const box = {
  tl: '╔',
  tr: '╗',
  bl: '╚',
  br: '╝',
  h: '═',
  v: '║',
};

const bar = { full: '█', head: '▓', empty: '░' };

// ── Low-level ANSI ─────────────────────────────────────────────
const ansi = {
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  clearLine: '\x1b[2K',
  cr: '\r',
  up: (n = 1) => `\x1b[${n}A`,
};

// ── Width math (must ignore ANSI) ──────────────────────────────
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

function stripAnsi(str) {
  return str.replace(ANSI_RE, '');
}

function visibleWidth(str) {
  return [...stripAnsi(str)].length;
}

function padEndVisible(str, width) {
  const pad = width - visibleWidth(str);
  return pad > 0 ? str + ' '.repeat(pad) : str;
}

function padStartVisible(str, width) {
  const pad = width - visibleWidth(str);
  return pad > 0 ? ' '.repeat(pad) + str : str;
}

function centerVisible(str, width) {
  const pad = width - visibleWidth(str);
  if (pad <= 0) return str;
  const left = Math.floor(pad / 2);
  return ' '.repeat(left) + str + ' '.repeat(pad - left);
}

// ── Bundled "ANSI Shadow" font (only the glyphs bypass-vpn needs) ──
// Each entry is 6 rows of fixed width, so concatenating across letters keeps
// every banner row identical in length. Lowercase maps to these uppercase
// shapes, exactly like figlet's ANSI Shadow.
const FONT = {
  B: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██████╔╝', '╚═════╝ '],
  Y: ['██╗   ██╗', '╚██╗ ██╔╝', ' ╚████╔╝ ', '  ╚██╔╝  ', '   ██║   ', '   ╚═╝   '],
  P: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔═══╝ ', '██║     ', '╚═╝     '],
  A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  S: ['███████╗', '██╔════╝', '███████╗', '╚════██║', '███████║', '╚══════╝'],
  V: ['██╗   ██╗', '██║   ██║', '██║   ██║', '╚██╗ ██╔╝', ' ╚████╔╝ ', '  ╚═══╝  '],
  N: ['███╗   ██╗', '████╗  ██║', '██╔██╗ ██║', '██║╚██╗██║', '██║ ╚████║', '╚═╝  ╚═══╝'],
  '-': ['        ', '        ', '██████╗ ', '╚═════╝ ', '        ', '        '],
};

// Render `text` as 6 rows of ANSI Shadow art; unknown chars are skipped.
function figText(text) {
  const rows = ['', '', '', '', '', ''];
  for (const ch of text.toUpperCase()) {
    const g = FONT[ch];
    if (!g) continue;
    for (let r = 0; r < 6; r++) rows[r] += g[r];
  }
  return rows;
}

module.exports = {
  useColor,
  palette,
  bannerStops,
  fgHex,
  bold,
  dim,
  paint,
  gradientByColumn,
  colorAt,
  c,
  glyph,
  spinners,
  box,
  bar,
  ansi,
  stripAnsi,
  visibleWidth,
  padEndVisible,
  padStartVisible,
  centerVisible,
  figText,
};
