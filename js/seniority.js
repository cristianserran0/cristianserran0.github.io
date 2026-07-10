document.addEventListener('DOMContentLoaded', function() {
    var currentDate = new Date();
    var startDate = new Date('2009-06-01');

    var yearsDifference = currentDate.getFullYear() - startDate.getFullYear();
    if (
        currentDate.getMonth() < startDate.getMonth() ||
        (currentDate.getMonth() === startDate.getMonth() && currentDate.getDate() < startDate.getDate())
    ) {
        yearsDifference--;
    }

    var experienceElement = document.getElementById('experienceYears');
    if (experienceElement) {
        experienceElement.textContent = yearsDifference + '+ years';
    }

});
