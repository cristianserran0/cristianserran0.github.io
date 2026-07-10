document.addEventListener('DOMContentLoaded', function() {
    var year = new Date().getFullYear();
    document.querySelectorAll('.current-year').forEach(function(el) {
        el.textContent = year;
    });
});
