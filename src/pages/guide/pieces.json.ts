/* The featured pieces as plain data, for the guide's AI (worker/index.js).
   Generated from src/data/pieces.ts at build time, so it never drifts. */
import { featured } from '../../data/pieces';

export function GET() {
  const data = featured.map((p) => ({
    slug: p.slug, title: p.title, client: p.client, years: p.years, label: p.label, role: p.facts.role,
  }));
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
