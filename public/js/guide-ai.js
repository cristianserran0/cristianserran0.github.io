/* The guide's AI answers: streaming, steady reveal, always-valid markdown.
   Used by assistant.js through window.GuideAI. Three ideas, from the
   Coworker prototype brief:

   1. Arrival is decoupled from reveal. Chunks land in bursts; words appear
      one every WORD_MS, whatever the network does. Completion drains at the
      same pace -- it never snaps the rest in.
   2. Raw syntax never shows. The revealed prefix is trimmed of a ragged
      edge (cleanTrailingMarkdown) and rendered as markdown on every tick.
   3. The caller owns scrolling and messages; this file only reveals.

   Markdown is rendered by building DOM nodes (textContent, createElement),
   never by assigning HTML, so nothing the model writes can inject markup.
   Links are allowed only to this site's paths and to http(s). */
(function () {
  var WORD_MS = 60;     // one word every 60 ms: a steady reading pace
  var FADE_MS = 280;    // how long a new word takes to fade in (CSS .word)

  // ---- 1. reveal ticker + network ----
  function stream(opts) {
    var controller = new AbortController();
    var stopped = false, done = false, failed = false;
    var buffer = '';
    var revealed = 0, times = [];          // words on screen, and when each appeared
    var alive = true, rafId = 0, lastTick = 0, poll = 0;

    // Words with the whitespace before them, so newlines (lists,
    // paragraphs) survive. A word still arriving isn't revealable yet.
    function words() { return buffer.match(/\s*\S+/g) || []; }
    function revealable(w) { return done || /\s$/.test(buffer) ? w.length : Math.max(0, w.length - 1); }
    function shown() { return cleanTrailingMarkdown(hideIncompleteLink(words().slice(0, revealed).join(''))); }
    function ages(now) {
      var out = [];
      for (var i = times.length - 1; i >= 0 && now - times[i] < FADE_MS; i--) out.unshift(now - times[i]);
      return out;
    }

    // Started on send, not on first chunk: it idles while there's nothing.
    function tick(now) {
      if (!alive) return;                  // a stale frame can't revive a stopped ticker
      var w = words();
      if (now - lastTick >= WORD_MS && revealed < revealable(w)) {
        revealed += 1; lastTick = now; times.push(now);
        opts.onReveal(shown(), ages(now));
      }
      rafId = requestAnimationFrame(tick);
    }
    function stopTicker() { alive = false; cancelAnimationFrame(rafId); clearInterval(poll); }
    rafId = requestAnimationFrame(tick);

    // Completion: the network is done AND the reveal has caught up.
    poll = setInterval(function () {
      if (!done || failed || stopped) return;
      if (revealed >= words().length) {
        stopTicker();
        if (!buffer.trim()) return fail('empty');
        opts.onDone(shown(), false);
      }
    }, 50);

    function fail(kind) {
      if (stopped || failed) return;
      failed = true; stopTicker(); opts.onError(kind);
    }

    fetch(opts.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts.body),
      signal: controller.signal,
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          fail(j.error || (res.status === 429 ? 'rate' : 'model'));
        });
      }
      // SSE with a persistent line buffer: chunks split mid-line, and a
      // naive split per chunk would silently drop text.
      var reader = res.body.getReader(), decoder = new TextDecoder(), pending = '';
      function read() {
        return reader.read().then(function (r) {
          if (stopped) return;
          if (r.done) { done = true; return; }
          pending += decoder.decode(r.value, { stream: true });
          var lines = pending.split('\n');
          pending = lines.pop();           // keep the partial line for next time
          lines.forEach(function (line) {
            var s = line.trim();
            if (s.indexOf('data:') !== 0) return;
            var payload = s.slice(5).trim();
            if (payload === '[DONE]') return;
            try { buffer += JSON.parse(payload).response || ''; } catch (e) {}
          });
          return read();
        });
      }
      return read();
    }).catch(function (err) {
      if (stopped || (err && err.name === 'AbortError')) return;   // stopping is not an error
      fail('network');
    });

    return {
      // Stop, in this order: guard late handlers, cancel the fetch, freeze
      // the reveal, leave a clean, valid partial.
      stop: function () {
        if (stopped || failed) return;
        stopped = true;
        controller.abort();
        stopTicker();
        opts.onDone(shown(), true);
      },
    };
  }

  // ---- 2. never show raw syntax ----
  // Copied as-is from the brief.
  function cleanTrailingMarkdown(text) {
    var lines = text.replace(/\s+$/, '').split('\n');
    while (lines.length) {
      var last = lines[lines.length - 1].trim();
      if (last === '' || /^#{1,6}$/.test(last) || /^([-*_])\1{0,2}$/.test(last) ||
          /^[-*•]$/.test(last) || /^\d+[.)]$/.test(last) || /^#{1,6}\s*$/.test(last)) {
        lines.pop();
      } else break;
    }
    var out = lines.join('\n');
    if ((out.match(/\*\*/g) || []).length % 2) out += '**';
    if ((out.replace(/\*\*/g, '').match(/\*/g) || []).length % 2) out += '*';
    if ((out.match(/`/g) || []).length % 2) out += '`';
    return out;
  }
  // Added to the brief's trimmer: a link still arriving ("[the wo" or
  // "[the work](/wo") is held back until it's complete.
  function hideIncompleteLink(text) {
    return text.replace(/\[[^\]\n]*$/, '').replace(/\[[^\]\n]*\]\([^)\s]*$/, '');
  }

  // ---- markdown -> DOM (paragraphs, lists, headings, bold, italic, code, links) ----
  var INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  function safeHref(u) { return /^(https?:\/\/|\/(?!\/))/.test(u) ? u : null; }
  function inline(parent, text) {
    var at = 0, m;
    INLINE.lastIndex = 0;
    while ((m = INLINE.exec(text))) {
      if (m.index > at) parent.appendChild(document.createTextNode(text.slice(at, m.index)));
      var node;
      if (m[1] !== undefined) {
        var href = safeHref(m[2]);
        if (href) { node = document.createElement('a'); node.href = href; node.textContent = m[1]; }
        else node = document.createTextNode(m[1]);
      } else if (m[3] !== undefined) { node = document.createElement('strong'); node.textContent = m[3]; }
      else if (m[4] !== undefined) { node = document.createElement('em'); node.textContent = m[4]; }
      else { node = document.createElement('code'); node.textContent = m[5]; }
      parent.appendChild(node);
      at = INLINE.lastIndex;
    }
    if (at < text.length) parent.appendChild(document.createTextNode(text.slice(at)));
  }
  // Line by line: runs of "- " or "1. " lines become a list even straight
  // after a sentence with no blank line (models write it that way); other
  // lines gather into paragraphs, a blank line ends one; a heading is shown
  // as a bold line (a chat reply has no outline to head).
  function renderMarkdown(target, md) {
    target.textContent = '';
    var bullet = /^\s*[-*•]\s+/, number = /^\s*\d+[.)]\s+/;
    var p = null, list = null, listOrdered = false;
    md.split('\n').forEach(function (line) {
      if (!line.trim()) { p = null; list = null; return; }
      var ordered = number.test(line);
      if (ordered || bullet.test(line)) {
        if (!list || listOrdered !== ordered) {
          list = document.createElement(ordered ? 'ol' : 'ul'); listOrdered = ordered;
          target.appendChild(list);
        }
        p = null;
        var li = document.createElement('li');
        inline(li, line.replace(ordered ? number : bullet, ''));
        list.appendChild(li);
        return;
      }
      list = null;
      if (p) p.appendChild(document.createElement('br'));
      else { p = document.createElement('p'); target.appendChild(p); }
      var heading = line.match(/^\s*#{1,6}\s+(.*)$/);
      if (heading) { var s = document.createElement('strong'); inline(s, heading[1]); p.appendChild(s); }
      else inline(p, line);
    });
  }

  // The newest words fade in. Every tick re-renders the whole prefix, so
  // each fading word gets a negative animation-delay for its age: its fade
  // carries on from where it was instead of restarting. (Set through the
  // CSSOM, which the CSP allows.)
  function fadeNewest(root, ageList) {
    var k = ageList.length;
    if (!k) return;
    var nodes = [], walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) nodes.push(walk.currentNode);
    for (var i = nodes.length - 1; i >= 0 && k > 0; i--) {
      var parts = nodes[i].nodeValue.split(/(\s+)/), frag = [];
      for (var j = parts.length - 1; j >= 0; j--) {
        if (k > 0 && /\S/.test(parts[j])) {
          var s = document.createElement('span');
          s.className = 'word'; s.textContent = parts[j];
          s.style.animationDelay = (-ageList[--k]) + 'ms';
          frag.unshift(s);
        } else frag.unshift(document.createTextNode(parts[j]));
      }
      var parent = nodes[i].parentNode;
      frag.forEach(function (n) { parent.insertBefore(n, nodes[i]); });
      parent.removeChild(nodes[i]);
    }
  }

  window.GuideAI = { stream: stream, renderMarkdown: renderMarkdown, fadeNewest: fadeNewest, cleanTrailingMarkdown: cleanTrailingMarkdown };
})();
