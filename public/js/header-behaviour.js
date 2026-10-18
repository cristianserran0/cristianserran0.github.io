/* Hide the header while scrolling down, show it again on the way up.
   Follows whichever box scrolls: the window in the plain site, or the page
   panel when the guide is open (see styles/shell.css). */
document.addEventListener('DOMContentLoaded', function () {
  var header = document.querySelector('.site-header');
  var page = document.querySelector('.page');
  if (!header) return;
  var didScroll = false;
  var lastScrollTop = 0;
  var delta = 50;
  var navBarHeight = header.offsetHeight;

  function panelScrolls() { return page && getComputedStyle(page).overflowY === 'auto'; }
  function metrics() {
    return panelScrolls()
      ? { top: page.scrollTop, view: page.clientHeight, height: page.scrollHeight }
      : { top: window.pageYOffset || document.documentElement.scrollTop, view: window.innerHeight, height: document.documentElement.scrollHeight };
  }

  // On wide screens the page panel scrolls itself, not the window, and
  // keys like Space or Page Down only scroll what has focus. So a scroll
  // key pressed with nothing focused first hands focus to the panel; the
  // key's own default action then scrolls it.
  var SCROLL_KEYS = /^(PageDown|PageUp|Home|End|ArrowDown|ArrowUp| )$/;
  document.addEventListener('keydown', function (e) {
    if (!page || !panelScrolls() || !SCROLL_KEYS.test(e.key)) return;
    var a = document.activeElement;
    if (!a || a === document.body || a === document.documentElement) page.focus({ preventScroll: true });
  }, true);

  function onScroll() { didScroll = true; }
  window.addEventListener('scroll', onScroll);
  if (page) page.addEventListener('scroll', onScroll);

  setInterval(function () {
    if (didScroll) { hasScrolled(); didScroll = false; }
  }, 250);

  function hasScrolled() {
    var m = metrics();
    if (Math.abs(lastScrollTop - m.top) <= delta) return;
    if (m.top > lastScrollTop && m.top > navBarHeight) {
      header.classList.remove('nav-visible');
      header.classList.add('nav-hidden');
    } else if (m.top + m.view < m.height) {
      header.classList.remove('nav-hidden');
      header.classList.add('nav-visible');
    }
    lastScrollTop = m.top;
  }
});
