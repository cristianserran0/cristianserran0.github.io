/* Assistant panel -- PROTOTYPE with scripted answers, no AI behind it.
   Opens/closes the shell (<html assistant="open">, remembered), keeps a
   transcript, answers from a small keyword table, and offers to keep the
   chat for next time. All text is inserted with textContent, never as HTML,
   so nothing typed into the box can inject markup. */
(function () {
  var d = document.documentElement;
  var panel = document.getElementById('assistant');
  if (!panel) return;
  var toggle = document.querySelector('[data-assistant-toggle]');
  var closeBtn = panel.querySelector('[data-assistant-close]');
  var log = panel.querySelector('.assistant-log');
  var form = panel.querySelector('.assistant-composer');
  var input = form.querySelector('textarea');
  var send = form.querySelector('[type="submit"]');
  var keep = panel.querySelector('.assistant-keep');

  function store(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // ---- scripted knowledge, in priority order ----
  var ANSWERS = [
    { match: /\b(site|built|build|token|tokens|css|styleguide|code|stack)\b/i, read: '/styleguide/',
      text: ['This site runs on one token source: colour, type, space and effects live in src/styles/tokens/, and every rule consumes them through var(). A build check fails on any value set anywhere else.',
             'The markup only says what things are; the CSS decides how they look. The styleguide shows every token and text style.'],
      links: [['Open the styleguide', '/styleguide/']] },
    { match: /\b(justrelate|coworker|head of design|current|now)\b/i, read: '/work/justrelate-head-of-design/',
      text: ['Cristian is Head of Design at JustRelate in Munich since December 2024. He defined the platform vision around JustRelate Home and conceptualised JR Coworker, the AI layer that calls each product’s skills to turn intent into execution.'],
      links: [['Read the case study', '/work/justrelate-head-of-design/']] },
    { match: /\b(work|project|projects|case|portfolio|design system|design systems|kaia|openbank|google)\b/i, read: '/work/',
      text: ['There are four featured case studies: JustRelate Home, Kaia Health’s Kinetic Design System, Small Business Advisors for Google, and the Openbank Design System.'],
      links: [['See the work', '/work/']] },
    { match: /\b(contact|email|mail|hire|linkedin|reach|talk)\b/i, read: '/contact/',
      text: ['The quickest way is LinkedIn; email works too.'],
      links: [['How to get in touch', '/contact/']] },
    { match: /\b(cv|resume|career|experience|years|skills|background|who|what does|about)\b/i, read: '/cv/',
      text: ['Cristian is a product designer with 17+ years of experience, focused on product design, design systems and design leadership, with a strong background in visual and UI design. Before JustRelate he led the Kinetic Design System at Kaia Health and worked with Google, Disney and Openbank through Globant.'],
      links: [['Read the CV', '/cv/']] },
  ];
  var FALLBACK = {
    text: ['I’m a scripted prototype, so I only know a few topics: Cristian’s CV, his work, how to contact him, and how this site is built.'],
    suggestions: true };
  var SUGGESTIONS = ['What does Cristian do?', 'Show me his work', 'How is this site built?'];
  var GREETING = { from: 'assistant', text: ['Hi! Ask me about Cristian’s work, his CV, or how this site is built.'], suggestions: true };

  function answer(q) {
    for (var i = 0; i < ANSWERS.length; i++) if (ANSWERS[i].match.test(q)) {
      var a = ANSWERS[i]; return { from: 'assistant', read: a.read, text: a.text, links: a.links };
    }
    return { from: 'assistant', text: FALLBACK.text, suggestions: true };
  }

  // ---- transcript ----
  var saved = read('assistant-transcript');
  var transcript = [];
  try { transcript = saved ? JSON.parse(saved) : []; } catch (e) { transcript = []; }
  var kept = !!saved, offered = kept;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function render(m) {
    var li = el('li');
    li.setAttribute('data-from', m.from);
    if (m.read) li.appendChild(el('p', 'assistant-step', 'Read ' + m.read + ' for context'));
    m.text.forEach(function (t) { li.appendChild(el('p', null, t)); });
    if (m.links) {
      var ul = el('ul', 'assistant-links');
      m.links.forEach(function (l) { var a = el('a', null, l[0]); a.href = l[1]; var i = el('li'); i.appendChild(a); ul.appendChild(i); });
      li.appendChild(ul);
    }
    if (m.suggestions) {
      var s = el('ul', 'assistant-suggestions');
      SUGGESTIONS.forEach(function (q) {
        var b = el('button', null, q); b.type = 'button';
        b.addEventListener('click', function () { ask(q); });
        var i = el('li'); i.appendChild(b); s.appendChild(i);
      });
      li.appendChild(s);
    }
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
  }

  function persist() { if (kept) store('assistant-transcript', JSON.stringify(transcript)); }

  function ask(q) {
    q = q.trim();
    if (!q) return;
    var u = { from: 'user', text: [q] };
    transcript.push(u); render(u);
    input.value = ''; send.disabled = true;
    setTimeout(function () {
      var a = answer(q);
      transcript.push(a); render(a); persist();
      if (!offered) { offered = true; keep.hidden = false; }
    }, 450);
  }

  if (transcript.length) transcript.forEach(render); else render(GREETING);

  keep.addEventListener('click', function (e) {
    var b = e.target.closest('[data-keep]');
    if (!b) return;
    kept = b.getAttribute('data-keep') === 'yes';
    if (kept) persist(); else store('assistant-transcript', null);
    keep.hidden = true;
  });

  // ---- composer ----
  input.addEventListener('input', function () { send.disabled = !input.value.trim(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });

  // ---- open / close ----
  function isOpen() { return d.getAttribute('assistant') === 'open'; }
  function setOpen(open) {
    open ? d.setAttribute('assistant', 'open') : d.removeAttribute('assistant');
    store('assistant', open ? 'open' : null);
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
    if (open) input.focus({ preventScroll: true });
    else if (panel.contains(document.activeElement) && toggle) toggle.focus();
  }
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(isOpen()));
    toggle.addEventListener('click', function () { setOpen(!isOpen()); });
  }
  closeBtn.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) setOpen(false); });
})();
