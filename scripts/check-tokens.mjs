/* Token gate: every value lives in src/styles/tokens/, and nowhere else.
 *
 * Outside tokens/, a stylesheet may only reference values, never state them:
 *   - no colour literals            (#hex, rgb(), oklch(), named colours ...)
 *   - no lengths, durations, angles (16px, 1rem, 200ms, 45deg ...) except
 *     inside an @media condition, where var() is not allowed
 *   - no easing curves              (cubic-bezier())
 *   - type only through text styles (font, font-size, line-height, ... must
 *     be var(--type-*) / var(--weight-*))
 *   - no z-index literals
 * And in components/pages: no <style> blocks and no style="" attributes --
 * styling lives in src/styles, and a strict CSP (style-src 'self') would
 * block both anyway.
 *
 * Self-tests first, on fixtures with a known answer, so the gate cannot pass
 * by silently matching nothing.
 */
import fs from 'fs';
import path from 'path';

const STYLES = 'src/styles';
const TOKENS = path.join(STYLES, 'tokens');

const COLOUR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const HEX = /#[0-9a-f]{3,8}\b/i;
const NAMED = /(?<![\w-])(?:white|black|red|green|blue|gray|grey|silver|navy|orange|purple|yellow)(?![\w-])/i;
const DIMENSION = /(?<![\w.-])-?\d*\.?\d+(?:px|rem|em|ms|s|deg|turn|vh|vw|svh|dvh|ch|ex)\b/;
const ALLOWED_DIMENSION = /^(?:100vw|100vh|100cqi)$/;
const TYPE_PROPS = /^(?:font|font-size|font-family|font-weight|line-height|letter-spacing)$/;
const TYPE_VALUE = /^var\(--(?:type|weight)-[\w-]+\)$/;

function lint(css) {
  const out = [];
  css = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  // Whole declarations, across line breaks. A selector (a:hover {) or an
  // @media condition never reaches a ';' before its '{', so neither matches.
  for (const m of css.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)) {
    const [whole, prop, raw] = m;
    const value = raw.replace(/\s+/g, ' ').trim();
    const n = css.slice(0, m.index).split('\n').length;
    const line = whole.replace(/\s+/g, ' ');
    if (prop.startsWith('--')) { out.push([n, 'custom property declared outside tokens/', line]); continue; }
    if (HEX.test(value) || COLOUR_FN.test(value) || NAMED.test(value))
      out.push([n, 'colour literal', line]);
    const dims = (value.match(new RegExp(DIMENSION, 'g')) || []).filter(d => !ALLOWED_DIMENSION.test(d));
    if (dims.length) out.push([n, `literal ${dims.join(', ')}`, line]);
    if (/cubic-bezier\(|steps\(/.test(value)) out.push([n, 'easing literal', line]);
    if (TYPE_PROPS.test(prop) && !TYPE_VALUE.test(value)) out.push([n, `${prop} not from a text style`, line]);
    if (prop === 'z-index' && !/^var\(/.test(value)) out.push([n, 'z-index literal', line]);
  }
  return out;
}

// ---- self-test ----
const DIRTY = `.a {
  color: #fff;
  background: rgb(0 0 0 / 0.5);
  border-color: white;
  margin: 1rem;
  transition: opacity 200ms cubic-bezier(0, 0, 1, 1);
  transform: rotate(45deg);
  box-shadow: var(--shadow-sm),
              0 0 8px var(--shadow-tint);
  font-size: var(--font-size-16);
  font: 300 1rem/1.6 Inter;
  z-index: 10;
  --local: 4px;
}`;
const CLEAN = `/* comments may say 16px, #fff and white */
@media (max-width: 736px) {
  .a {
    color: var(--text-primary);
    margin-left: calc((var(--content-inner) - 100vw) / 2);
    font: var(--type-body);
    letter-spacing: var(--type-body-tracking);
    font-style: italic;
    width: 100%;
    grid-template-columns: repeat(4, 1fr);
    opacity: 1;
  }
}`;
const want = ['colour literal', 'colour literal', 'colour literal', 'literal 1rem', 'literal 200ms',
  'easing literal', 'literal 45deg', 'literal 8px', 'font-size not from a text style', 'literal 1rem',
  'font not from a text style', 'z-index literal', 'custom property declared outside tokens/'];
const got = lint(DIRTY).map(v => v[1]);
const missing = want.filter(w => !got.includes(w));
const dirtyLines = new Set(lint(DIRTY).map(v => v[0]));
if (missing.length || dirtyLines.size !== 11) {
  console.error(`SELF-TEST FAILED: violations not caught: ${missing.join('; ') || '(none)'}; declarations flagged ${dirtyLines.size}/11`);
  process.exit(1);
}
const falsePos = lint(CLEAN);
if (falsePos.length) {
  console.error('SELF-TEST FAILED: clean fixture flagged:\n' + falsePos.map(v => `  ${v[0]}: ${v[1]}`).join('\n'));
  process.exit(1);
}

// ---- the codebase ----
const walk = (d, ext) => fs.readdirSync(d, { withFileTypes: true }).flatMap(f => {
  const p = path.join(d, f.name);
  return f.isDirectory() ? walk(p, ext) : ext.includes(path.extname(p)) ? [p] : [];
});

const sheets = walk(STYLES, ['.css']).filter(f => !f.startsWith(TOKENS + path.sep));
const tokenFiles = walk(TOKENS, ['.css']);
if (!sheets.length || !tokenFiles.length) {
  console.error(`SELF-TEST FAILED: found ${sheets.length} stylesheets and ${tokenFiles.length} token files`);
  process.exit(1);
}

const problems = [];
for (const f of sheets)
  for (const [n, why, line] of lint(fs.readFileSync(f, 'utf8')))
    problems.push(`  ${f}:${n}  ${why}\n      ${line.trim()}`);

for (const f of walk('src', ['.astro'])) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/<style[\s>]/.test(line)) problems.push(`  ${f}:${i + 1}  <style> block; styles belong in src/styles`);
    if (/\sstyle=/.test(line)) problems.push(`  ${f}:${i + 1}  style="" attribute; styles belong in src/styles`);
  });
}

console.log(`✓ self-test: fixtures caught 13/13 violations, 0 false positives`);
console.log(`checked ${sheets.length} stylesheets and ${walk('src', ['.astro']).length} components against ${tokenFiles.length} token files`);
if (problems.length) {
  console.error(`\n${problems.length} value(s) outside tokens/:\n` + problems.join('\n'));
  process.exit(1);
}
console.log('✓ every value comes from tokens');
