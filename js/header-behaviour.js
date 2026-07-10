var didScroll = false;
var lastScrollTop = 0;
var delta = 50;
var header = document.querySelector('header');
var navBarHeight = header.offsetHeight;

window.addEventListener('scroll', function() {
    didScroll = true;
});

setInterval(function() {
    if (didScroll) {
        hasScrolled();
        didScroll = false;
    }
}, 250);

function hasScrolled() {
    var st = window.pageYOffset || document.documentElement.scrollTop;

    if (Math.abs(lastScrollTop - st) <= delta) return;

    if (st > lastScrollTop && st > navBarHeight) {
        header.classList.remove('nav-visible');
        header.classList.add('nav-hidden');
    } else {
        if (st + window.innerHeight < document.documentElement.scrollHeight) {
            header.classList.remove('nav-hidden');
            header.classList.add('nav-visible');
        }
    }

    lastScrollTop = st;
}
