/* The guide (assistant panel) -- PROTOTYPE, scripted, no AI behind it yet.

   It stays silent until the visitor opens it: nothing is said, stored or
   advanced while the panel is closed.

   It knows which room the visitor is in (the #guide-data JSON block, written
   by Layout.astro from src/data/pieces.ts), offers short tours through the
   pieces, and answers a few topics from a keyword table. The conversation
   follows the visitor from page to page for the session (sessionStorage);
   "Keep it" also keeps it for next time (localStorage).

   All text is inserted with textContent, never as HTML, so nothing typed
   into the box can inject markup. */
(function () {
  var d = document.documentElement;
  var panel = document.getElementById('assistant');
  if (!panel) return;
  var toggles = Array.prototype.slice.call(document.querySelectorAll('[data-assistant-toggle]'));
  var closeBtn = panel.querySelector('[data-assistant-close]');
  var clearBtn = panel.querySelector('[data-assistant-clear]');
  var log = panel.querySelector('.assistant-log');
  var form = panel.querySelector('.assistant-composer');
  var input = form.querySelector('textarea');
  var send = form.querySelector('[type="submit"]');
  var keep = panel.querySelector('.assistant-keep');
  var feedback = panel.querySelector('[data-feedback]');

  // ---- the scroll model (the Coworker brief, section 6) ----
  // The newest question is pinned to the TOP and the reply grows down into
  // empty space below it, so the view never moves while an answer streams
  // and the answer appears where the eyes already are. (Sticking to the
  // bottom instead nudges the view on every word and pushes the start of
  // the answer out of reach -- don't bring it back.)
  //   send:      a full panel height of trailing space, then snap the
  //              question to the top (two frames: commit, then paint).
  //   done:      settle the space -- just enough to keep the question at
  //              the top of a short reply, or a resting tail under a long one.
  //   the visitor scrolls during a turn: hands off until their next send.
  // Scrolling is set on the log itself, never with scrollIntoView(), which
  // would also scroll the page panel behind the guide.
  var JUMP_SLACK = 24;   // px the latest message may hide before "jump" shows
  var spacer = document.createElement('li');
  spacer.className = 'assistant-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  log.appendChild(spacer);
  var jump = panel.querySelector('.assistant-jump');
  var userScrolled = false;

  function restSpace() {
    var v = getComputedStyle(log).getPropertyValue('--chat-rest-space').trim();
    return parseFloat(v) * (v.endsWith('rem') ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 1);
  }
  function scrollPad() { return parseFloat(getComputedStyle(log).scrollPaddingTop) || 0; }
  function setSpacer(h) { spacer.style.height = Math.max(0, Math.round(h)) + 'px'; }   // CSSOM: CSP-safe
  // A node's top inside the scrolled content, from rect differences (not
  // offsetTop, which depends on the offset parent).
  function topInLog(node) { return node.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop - scrollPad(); }
  function contentEnd() { return log.scrollHeight - spacer.offsetHeight; }
  function lastQuestion() { var u = log.querySelectorAll('[data-from="user"]'); return u[u.length - 1]; }
  function scrollLog(top, smooth) { log.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' }); }

  function pin(node) {
    userScrolled = false;
    setSpacer(log.clientHeight);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (!userScrolled && node.isConnected) scrollLog(topInLog(node));   // snap, never smooth: content is about to move
        updateJump();
      });
    });
  }
  function settle(anchor) {
    anchor = anchor && anchor.isConnected ? anchor : lastQuestion();
    if (!anchor) { setSpacer(restSpace()); updateJump(); return; }
    var at = topInLog(anchor), end = contentEnd();
    var overflows = end - at >= log.clientHeight;
    setSpacer(overflows ? restSpace() : Math.max(restSpace(), at + log.clientHeight - end));
    if (!userScrolled) scrollLog(at);       // re-pin; a visitor who scrolled is left where they are
    updateJump();
  }

  // Any scroll by the visitor wins for the rest of the turn.
  ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach(function (type) {
    log.addEventListener(type, function () { userScrolled = true; }, { passive: true });
  });

  // Jump to latest: only while the latest message hides more than
  // JUMP_SLACK below the fold. Measured on the last real message, never the
  // spacer (always below the fold, it would keep the button on forever).
  // Also the edge fades: the top one while anything is scrolled away above,
  // the bottom one while the latest message runs past the bottom (1px,
  // tighter than the jump button's 24).
  var thread = log.parentNode;
  function updateJump() {
    var last = spacer.previousElementSibling;
    var below = last ? last.getBoundingClientRect().bottom - log.getBoundingClientRect().bottom : 0;
    jump.hidden = !last || below <= JUMP_SLACK;
    thread.toggleAttribute('data-above', log.scrollTop > 0);
    thread.toggleAttribute('data-below', below > 1);
  }
  var jumpFrame = 0;
  function updateJumpSoon() { cancelAnimationFrame(jumpFrame); jumpFrame = requestAnimationFrame(updateJump); }
  log.addEventListener('scroll', updateJumpSoon, { passive: true });
  jump.addEventListener('click', function () {
    userScrolled = true;                    // the visitor has taken over
    var last = spacer.previousElementSibling;
    if (last) scrollLog(topInLog(last) + scrollPad() + last.offsetHeight + restSpace() - log.clientHeight, true);
  });

  function store(area, k, v) { try { v === null ? area.removeItem(k) : area.setItem(k, v); } catch (e) {} }
  function read(area, k) { try { return area.getItem(k); } catch (e) { return null; } }
  var local = window.localStorage, session = window.sessionStorage;

  var data = { room: { kind: 'other' }, pieces: [] };
  try { data = JSON.parse(document.getElementById('guide-data').textContent); } catch (e) {}
  var room = data.room, pieces = data.pieces;
  var here = location.pathname.replace(/\/?$/, '/');

  // ---- tours: short, goal-driven walks through the pieces ----
  function byCategory(re) { return pieces.filter(function (p) { return re.test(p.category); }); }
  var TOURS = {
    'The 2-minute tour': { intro: 'Four pieces, newest first. Half a minute on each first screen is enough; scroll down wherever you want the full story.', stops: pieces },
    'Design systems':    { intro: 'Two design systems, built from the ground up for very different companies.', stops: byCategory(/design system/i) },
    'Leadership':        { intro: 'Where Cristian led teams and set up how design works.', stops: byCategory(/leadership|operations/i) },
  };
  var TOUR_NAMES = Object.keys(TOURS);

  // ---- scripted knowledge, in priority order ----
  var ANSWERS = [
    { match: /\b(site|built|build|token|tokens|css|styleguide|code|stack|guide|assistant)\b/i, read: '/styleguide/',
      text: ['This site runs on one token source: colour, type, space and effects live in one place, and every style reads from it. A build check fails on any value set anywhere else.',
             'The pages only say what things are; the styles decide how they look. I’m a scripted prototype for now; a free AI model comes next.'],
      links: [['Open the styleguide', '/styleguide/']] },
    { match: /\b(justrelate|coworker|head of design|current|now)\b/i, read: '/work/justrelate-head-of-design/',
      text: ['Cristian is Head of Design at JustRelate in Munich since December 2024. He defined the platform vision around JustRelate Home and conceptualised JR Coworker, the AI layer that calls each product’s skills to turn intent into execution.'],
      links: [['See the piece', '/work/justrelate-head-of-design/']] },
    { match: /\b(work|project|projects|case|portfolio|design system|design systems|kaia|openbank|google)\b/i, read: '/work/',
      text: ['There are four featured pieces: JustRelate Home, Kaia Health’s Kinetic Design System, Small Business Advisors for Google, and the Openbank Design System.'],
      links: [['See the wall', '/work/']] },
    { match: /\b(contact|email|mail|hire|linkedin|reach|talk)\b/i, read: '/contact/',
      text: ['The quickest way is LinkedIn; email works too.'],
      links: [['How to get in touch', '/contact/']] },
    { match: /\b(cv|resume|career|experience|years|skills|background|who|what does|about)\b/i, read: '/cv/',
      text: ['Cristian is a product designer with 17+ years of experience, focused on product design, design systems and design leadership, with a strong background in visual and UI design. Before JustRelate he led the Kinetic Design System at Kaia Health and worked with Google, Disney and Openbank through Globant.'],
      links: [['Read the CV', '/cv/']] },
  ];
  var FALLBACK = 'I’m a scripted prototype, so I only know a few topics: Cristian’s pieces, his CV, how to contact him, and how this site is built. Or take a tour:';

  // ---- what to offer in each room ----
  var Q_SPECIAL = 'What’s special about this one?';
  var Q_ROLE = 'What was his role?';
  function roomSuggestions() {
    if (room.kind === 'piece') {
      var s = [Q_SPECIAL, Q_ROLE];
      if (room.next) s.push('Next piece: ' + room.next.title);
      return s;
    }
    return TOUR_NAMES;
  }
  // The blank state's words, for the room the visitor is in.
  // The blank state: a greeting by the visitor's own clock, and this
  // room's options as cards (q is what gets asked, so the scripted answers
  // match). Descriptions come from the pieces, never typed twice.
  function blankState() {
    var h = new Date().getHours();
    var hello = h >= 5 && h < 12 ? 'Good morning!' : h >= 12 && h < 18 ? 'Good afternoon!' : 'Good evening!';
    var clients = function (re) { return byCategory(re).map(function (p) { return p.client.replace(/^Globant \+ /, ''); }).join(' and '); };
    if (room.kind === 'piece') {
      var opts = [
        { q: Q_SPECIAL, title: Q_SPECIAL, text: 'The piece in a few lines', icon: 'sparkle' },
        { q: Q_ROLE, title: Q_ROLE, text: 'Role, time and platforms', icon: 'person' },
      ];
      if (room.next) {
        var next = pieces.filter(function (p) { return p.title === room.next.title; })[0];
        opts.push({ q: 'Next piece: ' + room.next.title, title: 'Next piece: ' + room.next.title, text: next ? next.client + ' · ' + next.years : 'The next case study', icon: 'arrow' });
      }
      return { title: hello + ' Curious about ' + room.title + '?', options: opts };
    }
    return {
      title: hello + ' What would you like to know?',
      options: [
        { q: TOUR_NAMES[0], title: TOUR_NAMES[0], text: pieces.length + ' pieces, newest first', icon: 'compass' },
        { q: TOUR_NAMES[1], title: TOUR_NAMES[1], text: clients(/design system/i), icon: 'layers' },
        { q: TOUR_NAMES[2], title: TOUR_NAMES[2], text: 'Where he led teams and design operations', icon: 'people' },
      ],
    };
  }
  var ICONS = {
    sparkle: 'M7 1.75c.4 2.9 1.85 4.35 4.75 4.75-2.9.4-4.35 1.85-4.75 4.75C6.6 8.35 5.15 6.9 2.25 6.5 5.15 6.1 6.6 4.65 7 1.75zM12.25 9.5c.2 1.35.9 2.05 2.25 2.25-1.35.2-2.05.9-2.25 2.25-.2-1.35-.9-2.05-2.25-2.25 1.35-.2 2.05-.9 2.25-2.25z',
    person:  'M8 7.25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 14c.4-2.8 2.4-4.25 5-4.25s4.6 1.45 5 4.25',
    arrow:   'M3 8h10M9 4l4 4-4 4',
    compass: 'M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5zM10.5 5.5l-1.4 3.6-3.6 1.4 1.4-3.6z',
    layers:  'M8 2l6 3-6 3-6-3 6-3zM2 8l6 3 6-3M2 11l6 3 6-3',
    people:  'M5.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM1.75 13c.3-2.2 1.8-3.5 3.75-3.5s3.45 1.3 3.75 3.5M11 7a1.75 1.75 0 1 0 0-3.5M12 9.5c1.3.4 2 1.6 2.25 3.5',
  };
  function icon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.3'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICONS[name]); svg.appendChild(p);
    return svg;
  }

  function answer(q) {
    var t = q.trim();
    if (TOURS[t]) return startTour(t);
    if (room.kind === 'piece') {
      if (t === Q_SPECIAL) return { text: [room.label], suggestions: [Q_ROLE].concat(room.next ? ['Next piece: ' + room.next.title] : []) };
      if (t === Q_ROLE || /\b(role|team|time|how long|platform)/i.test(t))
        return { text: ['Role: ' + room.facts.role + '. Time: ' + room.facts.time + '. Platforms: ' + room.facts.platforms + '.'] };
      if (room.next && t === 'Next piece: ' + room.next.title)
        return { text: [room.next.title + ' is next.'], links: [[room.next.title, room.next.href]] };
    }
    for (var i = 0; i < ANSWERS.length; i++) if (ANSWERS[i].match.test(t)) {
      var a = ANSWERS[i]; return { read: a.read, text: a.text, links: a.links };
    }
    return { text: [FALLBACK], suggestions: TOUR_NAMES };
  }

  function startTour(name) {
    var tour = TOURS[name];
    var stops = tour.stops.map(function (p) { return p.href; });
    store(session, 'guide-tour', JSON.stringify({ name: name, stops: stops }));
    var first = tour.stops[0];
    return { text: [tour.intro], links: [['First stop: ' + first.title, first.href]] };
  }

  // On arrival: if this page is a stop on the tour in progress, say so.
  function tourStop() {
    var t; try { t = JSON.parse(read(session, 'guide-tour')); } catch (e) {}
    if (!t || !TOURS[t.name]) return null;
    var i = t.stops.indexOf(here);
    if (i === -1) return null;
    var p = TOURS[t.name].stops[i];
    var m = { stop: t.name + ' · stop ' + (i + 1) + ' of ' + t.stops.length, text: [p.label] };
    var next = TOURS[t.name].stops[i + 1];
    if (next) m.links = [['Next stop: ' + next.title, next.href]];
    else {
      m.text.push('That’s the tour. If this is the kind of work you need, the front desk is one click away.');
      m.links = [['Contact Cristian', '/contact/'], ['Read the CV', '/cv/']];
      store(session, 'guide-tour', null);
    }
    return m;
  }

  // ---- transcript ----
  var kept = !!read(local, 'assistant-transcript');
  var transcript = [];
  try { transcript = JSON.parse(read(local, 'assistant-transcript') || read(session, 'guide-log') || '[]'); } catch (e) {}
  // Only the conversation is stored; room greetings are drawn fresh each
  // time (older versions stored them -- drop those).
  transcript = transcript.filter(function (m) { return !m.room; });
  var offered = kept || transcript.some(function (m) { return m.from === 'user'; });

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function render(m) {
    var li = el('li');
    li.setAttribute('data-from', m.from);
    if (m.stop) li.appendChild(el('p', 'assistant-stop', m.stop));
    if (m.read) li.appendChild(el('p', 'assistant-step', 'Read ' + m.read + ' for context'));
    if (m.md !== undefined) {
      var body = el('div', 'assistant-md');
      window.GuideAI.renderMarkdown(body, m.md);
      li.appendChild(body);
    }
    (m.text || []).forEach(function (t) { li.appendChild(el('p', null, t)); });
    if (m.links) {
      var ul = el('ul', 'assistant-links');
      m.links.forEach(function (l) { var a = el('a', null, l[0]); a.href = l[1]; var i = el('li'); i.appendChild(a); ul.appendChild(i); });
      li.appendChild(ul);
    }
    if (m.suggestions && m.suggestions.length) {
      var s = el('ul', 'assistant-suggestions');
      m.suggestions.forEach(function (q) {
        var b = el('button', null, q); b.type = 'button';
        b.addEventListener('click', function () { ask(q); });
        var i = el('li'); i.appendChild(b); s.appendChild(i);
      });
      li.appendChild(s);
    }
    if (m.rateable) li.appendChild(rating(m));
    log.insertBefore(li, spacer);
    updateEmpty();
    return li;
  }

  function say(m) {
    m.from = m.from || 'assistant';
    transcript.push(m);
    transcript = transcript.slice(-40);
    var li = render(m);
    persist();
    return li;
  }

  // ---- rating an answer ----
  var SVG = 'http://www.w3.org/2000/svg';
  function thumb() {
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.4'); svg.setAttribute('stroke-linejoin', 'round');
    var p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', 'M5 7.5v6H2.5v-6H5zm0 0 2.5-5c1.1 0 2 .9 2 2v2h3.1c.8 0 1.4.7 1.3 1.5l-.6 4.4c-.1.6-.7 1.1-1.3 1.1H5');
    svg.appendChild(p);
    return svg;
  }
  function rating(m) {
    var g = el('div', 'assistant-rating');
    g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'Rate this answer');
    [['up', 'Helpful'], ['down', 'Not helpful']].forEach(function (r) {
      var b = el('button', 'icon-button'); b.type = 'button';
      b.setAttribute('data-rate', r[0]); b.setAttribute('aria-label', r[1]);
      b.setAttribute('aria-pressed', String(m.rating === r[0]));
      b.appendChild(thumb());
      b.addEventListener('click', function () { rate(m, r[0], g, b); });
      g.appendChild(b);
    });
    if (m.rated) g.appendChild(el('span', null, 'Thanks for the feedback'));
    return g;
  }

  var REASONS = {
    up:   { title: 'Glad it helped! What was good?', reasons: ['Accurate', 'Clear', 'Quick', 'Something else'] },
    down: { title: 'Sorry about that. What went wrong?', reasons: ['Wrong or made up', 'Didn’t answer my question', 'Too long', 'Something else'] },
  };
  var rated = null;   // the answer being rated while the modal is open
  function rate(m, value, group, opener) {
    m.rating = value;
    group.querySelectorAll('[data-rate]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-rate') === value));
    });
    persist();
    rated = { m: m, value: value, group: group };
    var r = REASONS[value];
    feedback.querySelector('[data-feedback-title]').textContent = r.title;
    var list = feedback.querySelector('[data-feedback-reasons]');
    list.textContent = '';
    r.reasons.forEach(function (label) {
      var b = el('button', null, label); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); });
      var li = el('li'); li.appendChild(b); list.appendChild(li);
    });
    feedback.querySelector('textarea').value = '';
    modal.open(opener);
  }

  /* A modal of this panel only (styles/components/modal.css): the rest of
     the panel goes inert while it is open, the page does not. */
  var modal = (function (wrap) {
    var opener = null;
    function others() { return Array.prototype.filter.call(panel.children, function (n) { return n !== wrap; }); }
    return {
      isOpen: function () { return !wrap.hidden; },
      open: function (from) {
        opener = from;
        others().forEach(function (n) { n.inert = true; });
        wrap.hidden = false;
        var first = wrap.querySelector('button, textarea');
        if (first) first.focus();
      },
      close: function () {
        wrap.hidden = true;
        others().forEach(function (n) { n.inert = false; });
        if (opener) opener.focus();
      },
    };
  })(feedback);

  feedback.querySelector('[data-feedback-cancel]').addEventListener('click', function () { modal.close(); });
  feedback.addEventListener('click', function (e) { if (e.target === feedback) modal.close(); });   // backdrop
  feedback.querySelector('form').addEventListener('submit', function (e) {
    e.preventDefault();
    // Prototype: kept in this browser only. A free store (Workers KV) can
    // take it once the guide runs on the Worker.
    var entry = {
      at: new Date().toISOString(), page: here, rating: rated.value,
      answer: rated.m.md !== undefined ? rated.m.md : (rated.m.text || []).join(' '),
      reasons: Array.prototype.map.call(feedback.querySelectorAll('[data-feedback-reasons] [aria-pressed="true"]'), function (b) { return b.textContent; }),
      note: feedback.querySelector('textarea').value.trim(),
    };
    var all; try { all = JSON.parse(read(local, 'guide-feedback') || '[]'); } catch (x) { all = []; }
    all.push(entry); store(local, 'guide-feedback', JSON.stringify(all.slice(-50)));
    rated.m.rated = true; persist();
    if (!rated.group.querySelector('span')) rated.group.appendChild(el('span', null, 'Thanks for the feedback'));
    modal.close();
  });

  function persist() {
    var json = JSON.stringify(transcript);
    store(session, 'guide-log', json);
    if (kept) store(local, 'assistant-transcript', json);
  }

  // Tours and this room's own questions are scripted: instant, free and
  // always right. Anything typed goes to the AI (worker/index.js).
  function scripted(q) {
    if (TOURS[q]) return true;
    if (room.kind !== 'piece') return false;
    return q === Q_SPECIAL || q === Q_ROLE || (room.next && q === 'Next piece: ' + room.next.title);
  }

  var turn = null;   // the answer streaming right now: { stop, li, scrolled }
  function ask(q) {
    q = q.trim();
    if (!q || turn) return;
    var question = say({ from: 'user', text: [q] });
    pin(question);
    input.value = ''; send.disabled = true;
    if (!offered) { offered = true; keep.hidden = false; }
    if (scripted(q) || !window.GuideAI) {
      setTimeout(function () {
        var a = answer(q); a.rateable = true; say(a);
        requestAnimationFrame(function () { settle(question); });
      }, 350);
      return;
    }
    streamAnswer(q);
  }

  function history() {
    return transcript.filter(function (m) { return !m.offline; }).slice(-12).map(function (m) {
      return { role: m.from === 'user' ? 'user' : 'assistant', content: m.md !== undefined ? m.md : (m.text || []).join('\n\n') };
    });
  }
  function pageLabel() {
    return room.kind === 'piece'
      ? room.title + ' (' + room.client + ', ' + room.years + '), at ' + here
      : document.title + ', at ' + here;
  }

  // The reply slot appears at once with thinking dots; the first revealed
  // word turns it into the answer in place -- no second bubble, no reflow.
  function streamAnswer(q) {
    var li = el('li', 'assistant-pending');
    li.setAttribute('data-from', 'assistant');
    li.setAttribute('aria-label', 'Thinking');
    for (var i = 0; i < 3; i++) li.appendChild(el('span'));
    log.insertBefore(li, spacer);
    var body = null;
    turn = { li: li };
    busy(true);
    var question = lastQuestion();
    function finish() { requestAnimationFrame(function () { settle(question); }); }
    turn.stop = window.GuideAI.stream({
      url: '/api/ask',
      body: { messages: history(), page: pageLabel() },
      onReveal: function (shown, ages) {
        if (!body) { li.textContent = ''; li.className = ''; li.removeAttribute('aria-label'); body = el('div', 'assistant-md'); li.appendChild(body); }
        window.GuideAI.renderMarkdown(body, shown);
        window.GuideAI.fadeNewest(body, ages);
        updateJumpSoon();                    // the view itself never moves
      },
      onDone: function (finalText) {
        li.remove();
        turn = null; busy(false);
        if (finalText.trim()) say({ from: 'assistant', md: finalText, rateable: true });
        finish();
      },
      onError: function (kind) {
        li.remove();
        turn = null; busy(false);
        say(offline(kind, q));
        finish();
      },
    }).stop;
  }

  // Errors are sentences, followed by what the guide knows offline.
  function offline(kind, q) {
    var reset = new Date(); reset.setUTCHours(24, 0, 0, 0);
    var why = {
      quota: 'I’ve used up today’s free AI answers; they come back at ' + reset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' your time.',
      rate: 'That’s a lot of questions at once; give me a minute.',
    }[kind] || 'I couldn’t reach the AI just now.';
    var a = answer(q);
    return { offline: true, rateable: true, read: a.read, text: [why + ' Here’s what I know offline:'].concat(a.text), links: a.links, suggestions: a.suggestions };
  }

  // Send becomes Stop while an answer streams, in the same place.
  function busy(on) {
    form.toggleAttribute('data-busy', on);
    send.setAttribute('aria-label', on ? 'Stop' : 'Send');
    send.disabled = on ? false : !input.value.trim();
  }

  transcript.forEach(render);

  // The blank state: shown while the conversation is empty, with this
  // room's suggestions; it gives way as soon as anything is said.
  var empty = panel.querySelector('.assistant-empty');
  var blank = blankState();
  empty.querySelector('[data-empty-title]').textContent = blank.title;
  var options = empty.querySelector('[data-empty-options]');
  blank.options.forEach(function (o) {
    var b = el('button'); b.type = 'button';
    var i = el('span'); i.appendChild(icon(o.icon)); b.appendChild(i);
    var t = el('span'); t.appendChild(el('strong', null, o.title)); t.appendChild(el('span', null, o.text)); b.appendChild(t);
    b.addEventListener('click', function () { ask(o.q); });
    var li = el('li'); li.appendChild(b); options.appendChild(li);
  });
  // (Also called while the saved conversation is first drawn, before
  // `empty` is looked up just above -- hence the guard.)
  function updateEmpty() {
    var has = log.children.length > 1;    // the spacer is always there
    if (empty) empty.hidden = has;
    if (clearBtn) clearBtn.disabled = !has;
  }
  updateEmpty();

  // On entering a room with the guide open: the tour stop, if one is due.
  // That IS conversation (progress through the tour), so it is stored.
  function arrive() {
    var stop = tourStop();
    var last = transcript[transcript.length - 1];
    if (stop && (!last || last.stop !== stop.stop)) {
      // A tour stop is pinned to the top like a question, then settled
      // (one frame after pin() has placed it).
      var li = say(stop);
      pin(li);
      requestAnimationFrame(function () { requestAnimationFrame(function () { requestAnimationFrame(function () { settle(li); }); }); });
    }
  }

  // Carried across pages for the session: where the conversation was
  // scrolled to, and anything half-typed.
  var VIEW = 'guide-view';
  var view = {}; try { view = JSON.parse(read(session, VIEW)) || {}; } catch (e) {}
  setSpacer(restSpace());
  if (typeof view.top === 'number' && !view.bottom) log.scrollTop = view.top;
  else log.scrollTop = log.scrollHeight;    // otherwise open on the latest
  if (view.draft) { input.value = view.draft; send.disabled = !view.draft.trim(); }
  window.addEventListener('pagehide', function () {
    store(session, VIEW, JSON.stringify({
      top: log.scrollTop,
      bottom: log.scrollTop + log.clientHeight >= log.scrollHeight - 2,
      draft: input.value,
    }));
  });

  keep.addEventListener('click', function (e) {
    var b = e.target.closest('[data-keep]');
    if (!b) return;
    kept = b.getAttribute('data-keep') === 'yes';
    store(local, 'assistant-transcript', kept ? JSON.stringify(transcript) : null);
    keep.hidden = true;
  });

  // ---- composer ----
  input.addEventListener('input', function () { if (!turn) send.disabled = !input.value.trim(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (turn) turn.stop(); else ask(input.value);
  });

  // ---- open / close ----
  // The page panel narrowing can rewrap the text, so the reader's place is
  // kept by ELEMENT, not by scroll number: note the element at the top of
  // the reading area, and keep it exactly where it was.
  var page = document.querySelector('.page');
  var header = document.querySelector('.site-header');
  var wide = window.matchMedia('(min-width: 761px)');
  var touch = window.matchMedia('(pointer: coarse)');
  function panelScrolls() { return page && getComputedStyle(page).overflowY === 'auto'; }
  function scrollTop() { return panelScrolls() ? page.scrollTop : window.pageYOffset; }
  function scrollTo(y) { if (panelScrolls()) page.scrollTop = y; else window.scrollTo(0, y); }

  var READABLE = 'main h1, main h2, main h3, main h4, main p, main li, main dt, main dd, main figure, main blockquote, main .work-tile';
  function readingAnchor() {
    var line = (panelScrolls() ? page.getBoundingClientRect().top : 0) + (header ? header.offsetHeight : 0);
    var nodes = document.querySelectorAll(READABLE);
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      if (r.height && r.bottom > line) return { el: nodes[i], top: r.top };
    }
    return null;
  }
  function keepPlace(anchor) {
    if (anchor) scrollTo(scrollTop() + anchor.el.getBoundingClientRect().top - anchor.top);
  }

  function isOpen() { return d.getAttribute('assistant') === 'open'; }
  // Opening and closing is just the attribute: CSS moves the real panels
  // (styles/shell.css). While the page panel's edge moves, its text may
  // rewrap; keepPlace runs on every frame of the movement, so the
  // paragraph being read stays where it is the whole way, not only at the end.
  function setOpen(open, from) {
    if (open === isOpen()) return;
    var anchor = readingAnchor();
    open ? d.setAttribute('assistant', 'open') : d.removeAttribute('assistant');
    holdPlace(anchor);
    store(local, 'assistant', open ? 'open' : null);
    toggles.forEach(function (t) { t.setAttribute('aria-expanded', String(open)); });
    if (open) {
      arrive();
      updateJumpSoon();
      // On touch screens focusing the box would pop up the keyboard
      // and shove everything again; there it waits for a tap.
      if (!touch.matches) input.focus({ preventScroll: true });
    } else if (panel.contains(document.activeElement)) {
      var back = from || toggles.filter(function (t) { return t.offsetParent; })[0];
      if (back) back.focus({ preventScroll: true });
    }
  }
  var holding = 0;
  function holdPlace(anchor) {
    cancelAnimationFrame(holding);
    if (!anchor) return;
    var until = performance.now() + parseFloat(getComputedStyle(d).getPropertyValue('--duration-panel')) + 50;
    (function frame(now) {
      keepPlace(anchor);
      if (now < until) holding = requestAnimationFrame(frame);
    })(performance.now());
  }
  toggles.forEach(function (t) {
    t.setAttribute('aria-expanded', String(isOpen()));
    t.addEventListener('click', function () { setOpen(!isOpen(), t); });
  });
  closeBtn.addEventListener('click', function () { setOpen(false); });

  // Clear: an empty conversation and the blank state again. Stops an answer
  // in flight first, and resets everything that belongs to the conversation
  // together (a tour in progress, the saved scroll, the keep-it choice), so
  // nothing from the old one shows up in the next.
  clearBtn.addEventListener('click', function () {
    if (turn) turn.stop();
    transcript = [];
    Array.prototype.slice.call(log.children).forEach(function (n) { if (n !== spacer) n.remove(); });
    store(session, 'guide-log', null);
    store(session, 'guide-tour', null);
    store(session, VIEW, null);
    store(local, 'assistant-transcript', null);
    kept = false; offered = false; keep.hidden = true;
    userScrolled = false;
    setSpacer(restSpace());
    log.scrollTop = 0;
    updateEmpty(); updateJump();
    input.focus({ preventScroll: true });
  });
  if (isOpen()) arrive();

  // The browser restores the window's scroll on reload and Back, but not a
  // panel's. Do it ourselves -- only then; a fresh visit starts at the top.
  var KEY = 'guide-scroll:' + location.pathname;
  window.addEventListener('pagehide', function () { store(session, KEY, String(scrollTop())); });
  var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if (nav && (nav.type === 'reload' || nav.type === 'back_forward') && panelScrolls()) {
    var saved = +read(session, KEY);
    if (saved) scrollTo(saved);
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (modal.isOpen()) modal.close();        // the innermost layer closes first
    else if (isOpen()) setOpen(false);
  });

  // ---- resizing the guide (styles/shell.css, "resizing the guide") ----
  // Drag the handle between the panels, or focus it and use the arrow keys
  // (Shift for bigger steps, Home/End for the limits); double-click resets.
  // The width is a custom property on <html>, set through the CSSOM (which
  // the CSP allows), remembered like the other display preferences, and
  // kept between the guide's minimum and what leaves the page its minimum.
  var resizer = document.querySelector('.panel-resizer');
  if (resizer) {
    var rootPx = function (name) {
      var v = getComputedStyle(d).getPropertyValue(name).trim();
      return v.endsWith('rem') ? parseFloat(v) * parseFloat(getComputedStyle(d).fontSize) : parseFloat(v);
    };
    var limits = function () {
      var min = rootPx('--assistant-min');
      var max = window.innerWidth - rootPx('--panel-min') - 3 * rootPx('--frame-gap');
      return { min: min, max: Math.max(min, max) };
    };
    var width = function () { return panel.getBoundingClientRect().width; };
    var setWidth = function (w, save) {
      var l = limits();
      w = Math.round(Math.min(l.max, Math.max(l.min, w)));
      d.style.setProperty('--assistant-width', w + 'px');
      resizer.setAttribute('aria-valuemin', String(Math.round(l.min)));
      resizer.setAttribute('aria-valuemax', String(Math.round(l.max)));
      resizer.setAttribute('aria-valuenow', String(w));
      if (save) store(local, 'assistant-width', String(w));
    };
    var reset = function () {
      var a = readingAnchor();
      d.style.removeProperty('--assistant-width');
      store(local, 'assistant-width', null);
      keepPlace(a);
      setWidth(width(), false);
    };

    var drag = null;
    resizer.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      resizer.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, w: width(), anchor: readingAnchor(), frame: 0 };
      d.setAttribute('resizing', '');
    });
    resizer.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var x = e.clientX;
      cancelAnimationFrame(drag.frame);
      drag.frame = requestAnimationFrame(function () {
        setWidth(drag.w + (drag.x - x), false);   // the guide is on the right: left = wider
        keepPlace(drag.anchor);                    // the paragraph you were on stays put
      });
    });
    var stop = function () {
      if (!drag) return;
      cancelAnimationFrame(drag.frame);
      drag = null;
      d.removeAttribute('resizing');
      setWidth(width(), true);
    };
    resizer.addEventListener('pointerup', stop);
    resizer.addEventListener('pointercancel', stop);
    resizer.addEventListener('dblclick', reset);

    resizer.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 64 : 16, w = width(), l = limits(), a = readingAnchor();
      if (e.key === 'ArrowLeft') setWidth(w + step, true);
      else if (e.key === 'ArrowRight') setWidth(w - step, true);
      else if (e.key === 'Home') setWidth(l.min, true);
      else if (e.key === 'End') setWidth(l.max, true);
      else if (e.key === 'Enter') reset();
      else return;
      e.preventDefault();
      keepPlace(a);
    });

    // A smaller window may no longer fit a saved width: re-fit it (unsaved).
    window.addEventListener('resize', function () { if (isOpen()) setWidth(width(), false); });
    if (isOpen()) setWidth(width(), false);
  }
})();
