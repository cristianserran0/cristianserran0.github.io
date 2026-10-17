/* The site's only server code: POST /api/ask, the guide's AI answers.
   Everything else is static files, served by Cloudflare without running
   this Worker at all (wrangler.jsonc: assets.run_worker_first = /api/*).

   Free and bounded by design:
   - Workers AI on the free plan: a daily allowance of "neurons"; when it
     runs out the model refuses (it never bills), and the guide says so in
     a sentence and falls back to its scripted answers.
   - A per-visitor rate limit (the LIMITER binding, no storage needed).
   - Short answers (max_tokens) and a short history window.
   - Only this site may call it (Origin check), so nobody else spends the
     allowance.

   The browser never talks to the model: the AI binding is server-side only. */

import KNOWLEDGE from '../public/llms.txt';
// Built from src/data/pieces.ts by src/pages/guide/pieces.json.ts, so the
// case studies are written once. (The build runs before wrangler bundles.)
import PIECES from '../dist/guide/pieces.json';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';
const MAX_TOKENS = 600;
const HISTORY = 12;            // turns replayed; more adds latency and cost, little else
const MAX_CHARS = 2000;        // per message the visitor sends
const ORIGINS = [/^https:\/\/([a-z0-9-]+\.)*cristianserrano\.ar$/, /^https:\/\/[a-z0-9-]+-cristianserrano-ar\.cristianserrano\.workers\.dev$/, /^http:\/\/localhost(:\d+)?$/];

const SYSTEM = `You are the guide on Cristian Serrano's portfolio website, like a guide in a small gallery. Visitors are mostly hiring managers and design leaders deciding whether to talk to him.

Rules:
- Answer ONLY from the facts below. If something isn't covered, say you don't know and suggest contacting Cristian (LinkedIn or email, see Contact). Never invent numbers, employers, dates, team sizes or results.
- Talk about Cristian in the third person. Be warm, direct and brief: usually 2 to 5 sentences, at most about 120 words. Use a short list only when it really helps.
- You may use simple markdown: **bold**, short lists, and links to pages on this site written as [text](/path/).
- Reply in the visitor's language.
- If asked about yourself: you are a small open model running on Cloudflare Workers AI, guided by the facts on this site; you can make mistakes.

FACTS
${KNOWLEDGE}

CASE STUDIES (title, client, years, role, one-line summary, page)
${PIECES.map((p) => `- ${p.title} — ${p.client}, ${p.years}. Role: ${p.role}. ${p.label} Page: /work/${p.slug}/`).join('\n')}`;

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/ask') return ask(req, env);
    return env.ASSETS.fetch(req);
  },
};

async function ask(req, env) {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const origin = req.headers.get('origin') || '';
  if (!ORIGINS.some((re) => re.test(origin))) return json(403, { error: 'origin' });

  if (env.LIMITER) {
    const ip = req.headers.get('cf-connecting-ip') || 'unknown';
    const { success } = await env.LIMITER.limit({ key: ip });
    if (!success) return json(429, { error: 'rate' });
  }

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'body' }); }
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    .slice(-HISTORY);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json(400, { error: 'body' });
  const page = typeof body.page === 'string' ? body.page.slice(0, 200) : '';
  const system = page ? `${SYSTEM}\n\nThe visitor is currently looking at: ${page}` : SYSTEM;

  if (env.MOCK_AI === '1') return sse(mockStream(messages[messages.length - 1].content));
  if (!env.AI) return json(503, { error: 'model' });

  try {
    const stream = await env.AI.run(MODEL, {
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: MAX_TOKENS,
      stream: true,
    });
    return sse(stream);
  } catch (err) {
    // The free plan's daily allowance is used up: a normal state, not a fault.
    const quota = /4006|daily free allocation|neurons/i.test(String(err && err.message));
    console.error('guide: model call failed', err);   // Workers Logs (observability)
    return json(quota ? 429 : 502, { error: quota ? 'quota' : 'model', detail: String(err && err.message).slice(0, 300) });
  }
}

function sse(stream) {
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' },
  });
}

/* Local development without a Cloudflare login (.dev.vars: MOCK_AI=1):
   the same SSE shape as Workers AI, in uneven bursts, so the guide's
   reveal can be judged without spending anything. */
function mockStream(question) {
  const text = `Here's a **mock answer**, streamed in uneven bursts like the real model, to "${question.slice(0, 60)}".\n\nCristian has led design systems at:\n- **Kaia Health**, the Kinetic Design System\n- **Openbank**, through Globant\n\nSee [the work](/work/) for the full stories, or ask something else.`;
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(ctrl) {
      let i = 0;
      while (i < text.length) {
        const n = 1 + Math.floor(Math.random() * 18);
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ response: text.slice(i, i + n) })}\n\n`));
        i += n;
        await new Promise((r) => setTimeout(r, Math.random() < 0.2 ? 400 : 30));
      }
      ctrl.enqueue(enc.encode('data: [DONE]\n\n'));
      ctrl.close();
    },
  });
}
