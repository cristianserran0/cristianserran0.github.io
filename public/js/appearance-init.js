/* Resolve the stored appearance before first paint, so there is no flash.
   Loaded render-blocking in <head>, as a file rather than inline, so a
   strict Content-Security-Policy (script-src 'self') does not block it. */
(function () {
  var d = document.documentElement;
  try {
    var s = localStorage.getItem('scheme');
    if (s === 'light' || s === 'dark') d.setAttribute('scheme', s);
    var t = localStorage.getItem('temperature');
    if (t === 'warm' || t === 'neutral' || t === 'cold') d.setAttribute('temperature', t);
    var a = localStorage.getItem('accent');
    if (a) d.setAttribute('accent', a);
    if (localStorage.getItem('assistant') === 'open') d.setAttribute('assistant', 'open');
    var gt = localStorage.getItem('guide-type');
    if (gt === 'light' || gt === 'page') d.setAttribute('guide-type', gt);
    if (localStorage.getItem('guide-measure') === 'narrow') d.setAttribute('guide-measure', 'narrow');
    var w = +localStorage.getItem('assistant-width');
    if (w) d.style.setProperty('--assistant-width', w + 'px');   // CSSOM: allowed by the CSP
  } catch (e) {}
})();
