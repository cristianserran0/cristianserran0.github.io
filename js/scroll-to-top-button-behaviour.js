$(document).scroll(function() {
    var y = $(this).scrollTop();
    if (y > 240) {
        $('.scroll-to-top').css('bottom', 24);
    } else {
        $('.scroll-to-top').css('bottom', -48);
    }
});