/* The guide's page index: what's on every page, so the AI knows what the
 * visitor is looking at.
 *
 * Runs after `astro build`. Reads each built page's <main>, cuts it into
 * sections at its h2 headings (the part before the first h2 is "intro"),
 * and writes dist/guide/pages.json:
 *   { "/work/x/": { title, sections: [{ heading, text }, ...] }, ... }
 * worker/index.js bundles that file and, for each question, adds the
 * section the visitor is reading (plus the page's outline) to the model's
 * instructions. The text always comes from here, never from the browser,
 * so a visitor can't feed the AI "page content" of their own.
 *
 * No HTML parser dependency: the pages are our own, simple, well-formed
 * markup, and only text is needed.
 */
import fs from 'fs';
import path from 'path';

const DIST = 'dist';
const MAX_SECTION = 3000;   // characters per section the model may get

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

function textOf(html) {
  return decode(html
    .replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => '[' + t.replace(/<[^>]+>/g, '') + '](' + href + ')')
    .replace(/<img[^>]*alt="([^"]+)"[^>]*>/gi, ' [image: $1] ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<h[3-6][^>]*>/gi, '\n\n### ')
    .replace(/<\/(p|h[1-6]|li|blockquote|figcaption|dt|dd|div|section|article|header)>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? pages(p) : e.name === 'index.html' ? [p] : [];
  });
}

const index = {};
for (const file of pages(DIST)) {
  const route = '/' + path.relative(DIST, path.dirname(file)).split(path.sep).filter(Boolean).join('/') + (file === path.join(DIST, 'index.html') ? '' : '/');
  const html = fs.readFileSync(file, 'utf8');
  if (/<meta name="robots" content="noindex"/.test(html)) continue;   // the styleguide, 404
  const main = (html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || [])[1];
  if (!main) continue;
  const title = decode((html.match(/<title>([^<]*)<\/title>/i) || [])[1] || route).trim();
  const parts = main.split(/<h2\b[^>]*>/i);
  const sections = [];
  const intro = textOf(parts[0]);
  if (intro) sections.push({ heading: 'intro', text: intro.slice(0, MAX_SECTION) });
  for (const part of parts.slice(1)) {
    const [h, ...rest] = part.split(/<\/h2>/i);
    const heading = textOf(h).replace(/\s+/g, ' ');
    const text = textOf(rest.join(''));
    if (heading || text) sections.push({ heading, text: text.slice(0, MAX_SECTION) });
  }
  index[route] = { title, sections };
}

fs.mkdirSync(path.join(DIST, 'guide'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'guide', 'pages.json'), JSON.stringify(index));
// The same text for AI search engines: /llms-full.txt, every page in full,
// next to the hand-written summary in /llms.txt. Generated, so it can
// never go out of date.
const SITE = 'https://cristianserrano.ar';
const order = Object.keys(index).sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
const full = [
  '# Cristian Serrano — full text of cristianserrano.ar',
  '',
  '> Every page of the site in plain text, generated at build time. The short summary is ' + SITE + '/llms.txt.',
  '',
  ...order.flatMap((route) => {
    const p = index[route];
    return ['', '---', '', '# ' + p.title, '', 'URL: ' + SITE + route, '',
      ...p.sections.flatMap((sec) => (sec.heading === 'intro' ? [sec.text, ''] : ['## ' + sec.heading, '', sec.text, '']))];
  }),
].join('\n');
fs.writeFileSync(path.join(DIST, 'llms-full.txt'), full.replace(/\]\(\//g, '](' + SITE + '/'));

const n = Object.keys(index).length;
const s = Object.values(index).reduce((a, p) => a + p.sections.length, 0);
console.log(`✓ guide index: ${n} pages, ${s} sections -> dist/guide/pages.json, dist/llms-full.txt`);
