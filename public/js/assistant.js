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
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
    return li;
  }

  function say(m) {
    m.from = m.from || 'assistant';
    transcript.push(m);
    transcript = transcript.slice(-40);
    render(m);
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
      say(answer(q));
      if (!offered) { offered = true; keep.hidden = false; }
    }, 350);
  }

  transcript.forEach(render);

  // What the guide says on entering a room, once the panel is open: the
  // tour stop if one is due (part of the conversation, so it is stored),
  // otherwise a greeting with what this room offers (shown, never stored,
  // so it can't pile up from page to page).
  var greeted = false;
  function arrive() {
    var stop = tourStop();
    var last = transcript[transcript.length - 1];
    if (stop) { if (!last || last.stop !== stop.stop) say(stop); return; }
    if (greeted) return;
    greeted = true;
    render({ from: 'assistant', text: [roomGreeting()], suggestions: roomSuggestions() });
  }

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
  // to the page panel (styles/shell.css), and closing moves it back. Carry
  // the reading position across, so the page doesn't jump.
  var page = document.querySelector('.page');
  function panelScrolls() { return page && getComputedStyle(page).overflowY === 'auto'; }
  function scrollTop() { return panelScrolls() ? page.scrollTop : window.pageYOffset; }
  function scrollTo(y) { if (panelScrolls()) page.scrollTop = y; else window.scrollTo(0, y); }

  function isOpen() { return d.getAttribute('assistant') === 'open'; }
  function setOpen(open, from) {
    var y = scrollTop();
    open ? d.setAttribute('assistant', 'open') : d.removeAttribute('assistant');
    scrollTo(y);
    store(local, 'assistant', open ? 'open' : null);
    toggles.forEach(function (t) { t.setAttribute('aria-expanded', String(open)); });
    if (open) { arrive(); input.focus({ preventScroll: true }); }
    else if (panel.contains(document.activeElement)) {
      var back = from || toggles.filter(function (t) { return t.offsetParent; })[0];
      if (back) back.focus();
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
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) setOpen(false); });
})();
