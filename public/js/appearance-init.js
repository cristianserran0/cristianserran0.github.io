/* Resolve the stored appearance before first paint, so there is no flash.
   Loaded render-blocking in <head>, as a file rather than inline, so a
   strict Content-Security-Policy (script-src 'self') does not block it. */
(function () {
  var d = document.documentElement;
  try {
    var s = localStorage.getItem('scheme');
    if (s === 'light' || s === 'dark') d.setAttribute('scheme', s);
    var a = localStorage.getItem('accent');
    if (a) d.setAttribute('accent', a);
    if (localStorage.getItem('assistant') === 'open') d.setAttribute('assistant', 'open');
  } catch (e) {}
})();
