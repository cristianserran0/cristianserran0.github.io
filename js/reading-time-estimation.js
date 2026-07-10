document.addEventListener("DOMContentLoaded", function () {
	// Get the article text
	const articleText = document.getElementById('content').innerText;

	// Split the text into an array of words
	const wordsArray = articleText.split(' ');

	// Count the number of words in the array
	const wordCount = wordsArray.length;

	// Calculate the estimated reading time
	const wordsPerMinute = 150;
	const readingTime = Math.ceil(wordCount / wordsPerMinute);

	// Add the reading time to the HTML
	const experienceElement = document.getElementById('reading-time');
    experienceElement.textContent = readingTime;
});
