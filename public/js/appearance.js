/* Display controls, inside the Display popover in the header.
   Mode: System / Light / Dark. "System" removes the attribute so :root's
   `color-scheme: light dark` follows the OS natively and live -- no
   matchMedia listener needed, and it keeps working with JS disabled.
   Accent: sets the attribute and remembers it. */
(function () {
  var d = document.documentElement;

  function store(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function currentScheme() {
    var s = d.getAttribute('scheme');
    return s === 'light' || s === 'dark' ? s : 'system';
  }

  var schemes = Array.prototype.slice.call(document.querySelectorAll('[data-scheme]'));
  var swatches = Array.prototype.slice.call(document.querySelectorAll('[data-accent]'));

  function render() {
    var s = currentScheme(), a = d.getAttribute('accent');
    schemes.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-scheme') === s)); });
    swatches.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-accent') === a)); });
  }

  schemes.forEach(function (b) {
    b.addEventListener('click', function () {
      var next = b.getAttribute('data-scheme');
      next === 'system' ? d.removeAttribute('scheme') : d.setAttribute('scheme', next);
      store('scheme', next === 'system' ? null : next);
      render();
    });
  });

  swatches.forEach(function (b) {
    b.addEventListener('click', function () {
      d.setAttribute('accent', b.getAttribute('data-accent'));
      store('accent', b.getAttribute('data-accent'));
      render();
    });
  });

  // the stored accent was already applied by appearance-init.js; just reflect it
  if (!d.getAttribute('accent')) d.setAttribute('accent', read('accent') || 'blue');
  render();
})();
