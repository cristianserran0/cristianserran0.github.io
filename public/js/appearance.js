/* Appearance controls.
   scheme: cycles system -> light -> dark. "system" removes the attribute so
   :root's `color-scheme: light dark` follows the OS natively and live --
   no matchMedia listener needed, and it keeps working with JS disabled.
   accent: sets the attribute and remembers it. */
(function () {
  var d = document.documentElement;
  var ORDER = ['system', 'light', 'dark'];
  var LABEL = { system: 'System', light: 'Light', dark: 'Dark' };

  function store(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function currentScheme() {
    var s = d.getAttribute('scheme');
    return s === 'light' || s === 'dark' ? s : 'system';
  }

  function applyScheme(next) {
    next === 'system' ? d.removeAttribute('scheme') : d.setAttribute('scheme', next);
    store('scheme', next === 'system' ? null : next);
    render();
  }

  function applyAccent(name) {
    d.setAttribute('accent', name);
    store('accent', name);
    render();
  }

  var toggle = document.querySelector('[data-scheme-toggle]');
  var label = document.querySelector('[data-scheme-label]');
  var swatches = Array.prototype.slice.call(document.querySelectorAll('[data-accent]'));

  function render() {
    var s = currentScheme();
    if (label) label.textContent = LABEL[s];
    if (toggle) toggle.setAttribute('aria-label', 'Appearance: ' + LABEL[s] + '. Activate to change.');
    var a = d.getAttribute('accent');
    swatches.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-accent') === a));
    });
  }

  if (toggle) toggle.addEventListener('click', function () {
    applyScheme(ORDER[(ORDER.indexOf(currentScheme()) + 1) % ORDER.length]);
  });

  swatches.forEach(function (b) {
    b.addEventListener('click', function () { applyAccent(b.getAttribute('data-accent')); });
  });

  // the stored accent was already applied by the inline head script; just reflect it
  if (!d.getAttribute('accent')) d.setAttribute('accent', read('accent') || 'blue');
  render();
})();
