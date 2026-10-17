/* Page-transition names, generated from src/data/pieces.ts so they can never
   drift from the pieces themselves. A piece's image carries the same name on
   the wall and on its own page, so the browser morphs one into the other.
   (Inline style="" would do it per element, but the CSP forbids it.) */
import { pieces } from '../data/pieces';

export function GET() {
  const css = pieces
    .map((p) => `[data-piece="${p.slug}"] img { view-transition-name: piece-${p.slug}; }`)
    .join('\n');
  return new Response(css + '\n', { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
}
