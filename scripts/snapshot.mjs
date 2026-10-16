/* Render snapshot: what every page LOOKS like, independent of its markup.
 *
 *   node scripts/snapshot.mjs save    <file>   record the built site (dist/)
 *   node scripts/snapshot.mjs compare <file>   diff the built site against it
 *
 * Renders each page of dist/ in headless Chrome at two widths and both
 * schemes, and records, in document order:
 *   - every element that owns text: its text and computed type, colour, box
 *   - every element that paints something without text: image, rule, border,
 *     background, shadow
 * Wrappers that paint nothing are skipped, so markup can be restructured
 * (classes removed, <hgroup> added) and the snapshot still matches as long
 * as the page looks the same. That is the point: it verifies the render,
 * not the source.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { execFile } from 'child_process';

const [mode, file] = process.argv.slice(2);
if (!['save', 'compare'].includes(mode) || !file) {
  console.error('usage: node scripts/snapshot.mjs save|compare <file>');
  process.exit(2);
}

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('No Chrome/Chromium found.'); process.exit(1); }

const DIST = path.resolve('dist');
const WIDTHS = [1280, 1024, 390];
const pages = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.html')) pages.push('/' + path.relative(DIST, p).replace(/index\.html$/, ''));
  }
})(DIST);
pages.sort();

// Runs inside the page. Collects once per scheme, then writes JSON into the DOM.
const COLLECTOR = `
addEventListener('load', async () => {
  await document.fonts.ready;
  const r = n => Math.round(n * 2) / 2;
  // The same colour can serialise differently (rgba() vs color(srgb ...)),
  // so colours inside shadows are normalised to rgba() before comparing.
  const srgb = v => v.replace(/color\\(srgb ([\\d.]+) ([\\d.]+) ([\\d.]+)(?: \\/ ([\\d.]+))?\\)/g,
    (_, x, y, z, a) => 'rgba(' + [x, y, z].map(n => Math.round(n * 255)).join(', ') + ', ' + (a ?? 1) + ')');
  const take = () => {
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('script, style, #__snap')) continue;
      const c = getComputedStyle(el);
      if (c.display === 'none' || c.visibility === 'hidden') continue;
      const b = el.getBoundingClientRect();
      const box = [r(b.x), r(b.y + scrollY), r(b.width), r(b.height)];
      const text = [...el.childNodes].filter(n => n.nodeType === 3)
        .map(n => n.textContent).join('').replace(/\\s+/g, ' ').trim();
      const paints = el.tagName === 'IMG' || el.tagName === 'HR' ||
        c.backgroundColor !== 'rgba(0, 0, 0, 0)' || c.backgroundImage !== 'none' ||
        c.boxShadow !== 'none' || parseFloat(c.borderTopWidth) + parseFloat(c.borderLeftWidth) > 0;
      if (text) out.push({ kind: 'text', text: text.slice(0, 80), box,
        type: [c.fontFamily.split(',')[0], c.fontSize, c.lineHeight, c.fontWeight,
               c.letterSpacing, c.textTransform, c.fontStyle].join(' '),
        color: c.color, deco: [c.textDecorationLine, c.textDecorationColor].join(' ') });
      if (paints) out.push({ kind: 'paint', tag: el.tagName.toLowerCase(), box,
        bg: c.backgroundColor + ' ' + c.backgroundImage.slice(0, 120),
        // a border's colour is only visible when the border has width
        border: [['Top', c.borderTopWidth, c.borderTopColor], ['Left', c.borderLeftWidth, c.borderLeftColor]]
          .map(([side, w, col]) => side + ' ' + w + (parseFloat(w) ? ' ' + col : '')).join(', '),
        radius: c.borderRadius, shadow: srgb(c.boxShadow) });
    }
    return out;
  };
  const d = document.documentElement, res = {};
  for (const s of ['light', 'dark']) { d.setAttribute('scheme', s); res[s] = take(); }
  res.height = document.documentElement.scrollHeight;
  res.fonts = [...document.fonts].filter(f => f.status === 'loaded')
    .map(f => f.family.replace(/"/g, '') + ' ' + f.weight + ' ' + f.style).sort();
  const pre = document.createElement('pre'); pre.id = '__snap';
  pre.textContent = JSON.stringify(res); document.body.append(pre);
});`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/__snap.js') { res.setHeader('content-type', 'text/javascript'); return res.end(COLLECTOR); }
  let p = path.join(DIST, url);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(DIST) || !fs.existsSync(p)) { res.statusCode = 404; return res.end(); }
  const ext = path.extname(p);
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  res.setHeader('content-type', types[ext] || 'application/octet-stream');
  let body = fs.readFileSync(p);
  if (ext === '.html') body = body.toString().replace('</head>', '<script src="/__snap.js"></script></head>');
  res.end(body);
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const render = (page, width) => new Promise((ok, fail) => {
  execFile(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--window-size=${width},900`, '--virtual-time-budget=20000', '--dump-dom', base + page],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }, (err, out) => {
      if (err) return fail(err);
      const m = out.match(/<pre id="__snap">([\s\S]*?)<\/pre>/);
      if (!m) return fail(new Error(`no snapshot output for ${page} @${width}: ` + out.slice(-300)));
      ok(JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')));
    });
});

const snap = {};
const jobs = pages.flatMap(p => WIDTHS.map(w => [p, w]));
const worker = async () => {
  for (let job; (job = jobs.shift());) {
    const [p, w] = job;
    for (let attempt = 1; ; attempt++) {
      try { snap[`${p} @${w}`] = await render(p, w); break; }
      catch (e) { if (attempt === 3) throw e; }
    }
  }
};
await Promise.all(Array.from({ length: 4 }, worker));
server.close();

const keys = Object.keys(snap).sort();
// Self-test: a snapshot that recorded nothing would compare equal to anything.
for (const k of keys) {
  if (snap[k].light.length < 5) { console.error(`SELF-TEST FAILED: ${k} recorded only ${snap[k].light.length} items`); process.exit(1); }
  if (!snap[k].fonts.some(f => f.startsWith('Inter '))) console.warn(`warning: Inter not loaded on ${k} (fonts: ${snap[k].fonts.join(', ') || 'none'})`);
}

if (mode === 'save') {
  fs.writeFileSync(file, JSON.stringify(snap));
  const n = keys.reduce((a, k) => a + snap[k].light.length, 0);
  console.log(`saved ${keys.length} renders (${pages.length} pages × ${WIDTHS.length} widths × 2 schemes), ${n} items per scheme -> ${file}`);
  process.exit(0);
}

const old = JSON.parse(fs.readFileSync(file, 'utf8'));
const show = o => o.kind === 'text' ? `"${o.text.slice(0, 40)}"` : `<${o.tag}>`;
let bad = 0;
for (const k of [...new Set([...Object.keys(old), ...keys])].sort()) {
  const a = old[k], b = snap[k];
  if (!a || !b) { console.log(`✗ ${k}: ${a ? 'missing now' : 'new page'}`); bad++; continue; }
  const lines = [];
  if (a.height !== b.height) lines.push(`  page height ${a.height} -> ${b.height}`);
  if (a.fonts.join() !== b.fonts.join()) lines.push(`  fonts [${a.fonts}] -> [${b.fonts}]`);
  for (const s of ['light', 'dark']) {
    const x = a[s], y = b[s];
    if (x.length !== y.length) lines.push(`  ${s}: ${x.length} items -> ${y.length}`);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const p = x[i], q = y[i];
      if (!p || !q) { lines.push(`  ${s} #${i}: ${p ? show(p) + ' gone' : show(q) + ' added'}`); continue; }
      if (p.kind !== q.kind || (p.kind === 'text' && p.text !== q.text) || (p.kind === 'paint' && p.tag !== q.tag)) {
        lines.push(`  ${s} #${i}: ${show(p)} -> ${show(q)} (sequence diverged)`); break;
      }
      for (const f of Object.keys(p)) {
        const pv = JSON.stringify(p[f]), qv = JSON.stringify(q[f]);
        if (pv !== qv) lines.push(`  ${s} #${i} ${show(p)} ${f}: ${pv} -> ${qv}`);
      }
    }
  }
  if (lines.length) { bad++; console.log(`✗ ${k}  (${lines.length} differences)\n` + lines.slice(0, 25).join('\n') + (lines.length > 25 ? `\n  ... +${lines.length - 25} more` : '')); }
}
console.log(bad ? `\n${bad} of ${keys.length} renders differ` : `✓ all ${keys.length} renders identical`);
process.exit(bad ? 1 : 0);
