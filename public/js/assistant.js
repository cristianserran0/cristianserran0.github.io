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
  var log = panel.querySelector('.assistant-log');
  var form = panel.querySelector('.assistant-composer');
  var input = form.querySelector('textarea');
  var send = form.querySelector('[type="submit"]');
  var keep = panel.querySelector('.assistant-keep');
  var feedback = panel.querySelector('[data-feedback]');

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
  function roomGreeting() {
    switch (room.kind) {
      case 'piece': return 'You’re in front of ' + room.title + ', ' + room.client + ', ' + room.years + '.';
      case 'wall':  return 'This is the wall: ' + pieces.length + ' pieces. Pick one, or let me take you through them.';
      case 'cv':    return 'This is the CV: the detail behind the pieces.';
      case 'contact': return 'This is the front desk: how to reach Cristian.';
      default:      return 'Hi! I’m the guide to Cristian’s work. Take a short tour, or ask me anything.';
    }
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
    m.text.forEach(function (t) { li.appendChild(el('p', null, t)); });
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
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
    return li;
  }

  function say(m) {
    m.from = m.from || 'assistant';
    transcript.push(m);
    transcript = transcript.slice(-40);
    render(m);
    persist();
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
      answer: rated.m.text.join(' '),
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

  function ask(q) {
    q = q.trim();
    if (!q) return;
    say({ from: 'user', text: [q] });
    input.value = ''; send.disabled = true;
    setTimeout(function () {
      var a = answer(q); a.rateable = true;
      say(a);
      if (!offered) { offered = true; keep.hidden = false; }
    }, 350);
  }

  transcript.forEach(render);

  // Where you are: a strip above the composer, rewritten in place on every
  // page. It is not part of the conversation, so changing pages never
  // changes the conversation (or its scroll).
  var strip = panel.querySelector('.assistant-here');
  strip.querySelector('[data-here]').textContent = roomGreeting();
  var hereList = strip.querySelector('[data-here-suggestions]');
  roomSuggestions().forEach(function (q) {
    var b = el('button', null, q); b.type = 'button';
    b.addEventListener('click', function () { ask(q); });
    var i = el('li'); i.appendChild(b); hereList.appendChild(i);
  });

  // On entering a room with the guide open: the tour stop, if one is due.
  // That IS conversation (progress through the tour), so it is stored.
  function arrive() {
    var stop = tourStop();
    var last = transcript[transcript.length - 1];
    if (stop && (!last || last.stop !== stop.stop)) say(stop);
  }

  // Carried across pages for the session: where the conversation was
  // scrolled to, and anything half-typed.
  var VIEW = 'guide-view';
  var view = {}; try { view = JSON.parse(read(session, VIEW)) || {}; } catch (e) {}
  if (typeof view.top === 'number' && !view.bottom) log.scrollTop = view.top;
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
  input.addEventListener('input', function () { send.disabled = !input.value.trim(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });

  // ---- open / close ----
  // Opening the guide on a wide screen moves the scrolling from the window
  // to the page panel (styles/shell.css), and the narrower panel rewraps
  // the text. So instead of carrying a scroll NUMBER across, keep the
  // reader's place: note the element at the top of the reading area, and
  // after the change scroll so it sits exactly where it was.
  var page = document.querySelector('.page');
  var header = document.querySelector('.site-header');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
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
  function setOpen(open, from) {
    if (open === isOpen()) return;
    var anchor = readingAnchor();
    function change() {
      open ? d.setAttribute('assistant', 'open') : d.removeAttribute('assistant');
      keepPlace(anchor);
      store(local, 'assistant', open ? 'open' : null);
      toggles.forEach(function (t) { t.setAttribute('aria-expanded', String(open)); });
      if (open) {
        arrive();
        // On touch screens focusing the box would pop up the keyboard
        // and shove everything again; there it waits for a tap.
        if (!touch.matches) input.focus({ preventScroll: true });
      } else if (panel.contains(document.activeElement)) {
        var back = from || toggles.filter(function (t) { return t.offsetParent; })[0];
        if (back) back.focus({ preventScroll: true });
      }
    }
    // Both panels move as one (styles/shell.css, "opening and closing the
    // guide"). Phones use the sheet's own transition; reduced motion and
    // browsers without view transitions switch at once.
    if (document.startViewTransition && wide.matches && !reduce.matches) {
      // [motion] makes the page a window-sized scroller (styles/shell.css):
      // carry the window's scroll into it, and back out when it ends.
      var y = window.pageYOffset;
      d.setAttribute('motion', open ? 'enter' : 'exit');
      if (open) page.scrollTop = y;
      var vt = document.startViewTransition(change);
      vt.finished.then(done, done);
    } else change();
    function done() {
      var top = page.scrollTop;
      d.removeAttribute('motion');
      if (!isOpen()) window.scrollTo(0, top);
    }
  }
  toggles.forEach(function (t) {
    t.setAttribute('aria-expanded', String(isOpen()));
    t.addEventListener('click', function () { setOpen(!isOpen(), t); });
  });
  closeBtn.addEventListener('click', function () { setOpen(false); });
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
})();
