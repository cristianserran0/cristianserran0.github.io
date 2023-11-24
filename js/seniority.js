document.addEventListener('DOMContentLoaded', function() {
    // Get the current date
    const currentDate = new Date();

    // Set the date I started my design career
    const startDate = new Date('2009-06-01');

    // Calculate the difference in years
    let yearsDifference = currentDate.getFullYear() - startDate.getFullYear();

    // Adjust the years if the start date is later in the current year
    if (
        currentDate.getMonth() < startDate.getMonth() ||
        (currentDate.getMonth() === startDate.getMonth() && currentDate.getDate() < startDate.getDate())
    ) {
        yearsDifference--;
    }

    // Update the HTML element with the calculated number of years
    const experienceElement = document.getElementById('experienceYears');
    experienceElement.textContent = yearsDifference + '+ years';
});