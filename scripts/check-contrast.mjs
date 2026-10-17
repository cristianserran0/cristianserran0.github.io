/* Contrast gate for the token collections.
 *
 * Values are resolved by a real browser, not by parsing CSS here. Two earlier
 * hand-written parsers in this file produced FALSE PASSES -- one stopped at an
 * inner var() paren and silently skipped every dark-mode pair, the other stopped
 * matching the role block after a selector changed and passed on zero roles.
 * The tokens now use oklch() with calc() and var(), which no small parser should
 * be trusted with at all. So: render, read getComputedStyle, check the numbers.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => fs.existsSync(p));

if (!CHROME) {
  console.error('No Chrome/Chromium found; cannot resolve oklch() tokens.');
  console.error('Set CONTRAST_CHECK_OPTIONAL=1 to skip this gate deliberately.');
  process.exit(process.env.CONTRAST_CHECK_OPTIONAL ? 0 : 1);
}

const css = fs.readFileSync('src/styles/tokens/color.css', 'utf8');
const modes = a => [...new Set([...css.matchAll(new RegExp(`\\[${a}="([^"]+)"\\]`, 'g'))].map(m => m[1]))];
const SCHEMES = ['light', 'dark'];
const TEMPS = modes('temperature');
const ACCENTS = modes('accent');
const FG = ['--text-primary', '--text-secondary', '--text-tertiary', '--link', '--link-hover'];
// Every depth text sits on, plus the see-through fills over the panel (and
// over the overlay) they are drawn on: "a+b" paints b over a, as on screen.
const BG = ['--bg-surface', '--bg-raised', '--bg-overlay',
            '--bg-surface+--fill-subtle', '--bg-surface+--fill-strong', '--bg-overlay+--fill-strong'];

const page = `<!DOCTYPE html><html><head><style>${css}</style></head><body><pre id="o"></pre>
<script>
var cv=document.createElement('canvas'); cv.width=cv.height=1;
var cx=cv.getContext('2d',{willReadFrequently:true});
var S=${JSON.stringify(SCHEMES)},T=${JSON.stringify(TEMPS)},A=${JSON.stringify(ACCENTS)},
    R=${JSON.stringify([...FG, ...BG])}, out=[];
S.forEach(function(s){T.forEach(function(t){A.forEach(function(a){
  var d=document.createElement('div');
  d.setAttribute('scheme',s); d.setAttribute('temperature',t); d.setAttribute('accent',a);
  document.body.appendChild(d);
  var row={scheme:s,temp:t,accent:a,roles:{}};
  R.forEach(function(k){
    // Chrome returns oklch() verbatim for non-legacy colour functions, so
    // rasterise: paint the pixel and read it back. That yields true sRGB
    // including the browser's own gamut mapping -- the values a reader sees.
    // "a+b": paint a, then b over it (a translucent fill on its surface).
    cx.clearRect(0,0,1,1);
    var c=k.split('+').map(function(part){
      var i=document.createElement('i'); i.style.color='var('+part+')'; d.appendChild(i);
      var v=getComputedStyle(i).color;
      cx.fillStyle='#000'; cx.fillStyle=v; cx.fillRect(0,0,1,1);
      return v;
    }).join(' + ');
    var px=cx.getImageData(0,0,1,1).data;
    row.roles[k]=[px[0],px[1],px[2]];
    row.raw=row.raw||{}; row.raw[k]=c;
  });
  out.push(row);
});});});
document.getElementById('o').textContent=JSON.stringify(out);
</script></body></html>`;

const tmp = path.join(os.tmpdir(), `contrast-${process.pid}.html`);
fs.writeFileSync(tmp, page);
let dom;
try {
  dom = execFileSync(CHROME, ['--headless', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=4000', '--dump-dom', 'file://' + tmp],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
} finally { fs.unlinkSync(tmp); }

const m = dom.match(/<pre id="o">([\s\S]*?)<\/pre>/);
if (!m) { console.error('Browser produced no output.'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
                            .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

// Self-test: the run must actually cover what it claims. A vacuous pass is the
// failure mode this gate exists to prevent.
const want = SCHEMES.length * TEMPS.length * ACCENTS.length;
if (rows.length !== want) {
  console.error(`SELF-TEST FAILED: expected ${want} appearances, browser returned ${rows.length}`);
  process.exit(1);
}
const rgb = v => Array.isArray(v) && v.length === 3 && v.every(x => Number.isInteger(x) && x >= 0 && x <= 255) ? v : [];
const unresolved = [];
for (const r of rows)
  for (const k of [...FG, ...BG])
    if (rgb(r.roles[k]).length !== 3)
      unresolved.push(`${r.scheme}/${r.temp}/${r.accent} ${k} = ${JSON.stringify(r.roles[k])} (raw ${r.raw?r.raw[k]:'?'})`);
if (unresolved.length) {
  console.error(`SELF-TEST FAILED: ${unresolved.length} role(s) did not resolve to a colour:`);
  unresolved.slice(0, 8).forEach(u => console.error('  ' + u));
  process.exit(1);
}
console.log(`✓ self-test: ${rows.length} appearances × ${FG.length + BG.length} roles all resolved by the browser`);

const lum = c => { const v = c.map(x => x / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

let n = 0; const fails = [];
for (const r of rows)
  for (const f of FG) for (const b of BG) {
    // fill-strong marks images and the chosen option, never a link
    if (f.startsWith('--link') && b.endsWith('--fill-strong')) continue;
    const v = ratio(rgb(r.roles[f]), rgb(r.roles[b])); n++;
    if (v < 4.5) fails.push(`  ${r.scheme}/${r.temp}/${r.accent}  ${f.slice(2)} on ${b.slice(2)}` +
                            `  rgb(${r.roles[f]}) / rgb(${r.roles[b]})  ${v.toFixed(2)}:1`);
  }
console.log(`${SCHEMES.length}×${TEMPS.length}×${ACCENTS.length} = ${rows.length} appearances, ${n} pairs vs WCAG AA 4.5:1\n`);
console.log(fails.length ? `FAILURES (${fails.length}):\n` + fails.slice(0, 20).join('\n') +
  (fails.length > 20 ? `\n  ... +${fails.length - 20} more` : '') : '✓ every pair passes');
process.exit(fails.length ? 1 : 0);
