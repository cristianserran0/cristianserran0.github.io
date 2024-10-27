// Hide Header on scroll down
var didScroll;
var lastScrollTop = 0;
var delta = 50;
var navBarHeight = $('header').outerHeight();

$(window).scroll(function(event){
    didScroll = true;
});

setInterval(function() {
    if (didScroll) {
        hasScrolled();
        didScroll = false;
    }
}, 250);

function hasScrolled() {
    var st = $(this).scrollTop();
    
    // Make sure they scroll more than delta
    if(Math.abs(lastScrollTop - st) <= delta)
        return;
    
    // If they scrolled down and are past the navbar, add class .nav-hidden.
    // This is necessary so you never see what is "behind" the navbar.
    if (st > lastScrollTop && st > navBarHeight){
        // Scroll Down
        $('header').removeClass('nav-visible').addClass('nav-up');
    } else {
        // Scroll Up
        if(st + $(window).height() < $(document).height()) {
            $('header').removeClass('nav-hidden').addClass('nav-down');
        }
    }
    
    lastScrollTop = st;
}