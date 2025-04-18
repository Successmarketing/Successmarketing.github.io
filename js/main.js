// Main JavaScript for Success Marketing Website

// Carousel initialization and animation effects
$(document).ready(function() {
    // Initialize hero carousel
    $('#heroCarousel').carousel({
        interval: 3000,
        pause: false
    });
    
    // Animation on scroll
    $(window).scroll(function() {
        $('.animate__animated').each(function() {
            var position = $(this).offset().top;
            var scroll = $(window).scrollTop();
            var windowHeight = $(window).height();
            
            if (scroll > position - windowHeight + 100) {
                var animationClass = $(this).attr('data-animation') || 'animate__fadeInUp';
                $(this).addClass(animationClass);
            }
        });
    });
    
    // Check for pages that need modernization
    function checkPageModernization() {
        // Check if page is using header/footer placeholders
        if ($('#header-placeholder').length === 0 || $('#footer-placeholder').length === 0) {
            console.warn('This page needs to be updated to use header/footer placeholders with common.js');
        }
        
        // Check if page is using inline styles rather than external CSS
        if ($('style').length > 0) {
            console.warn('This page has inline styles that should be moved to css/styles.css');
        }
        
        // Check for old stylesheet references
        $('link[rel="stylesheet"]').each(function() {
            if ($(this).attr('href') === 'styles.css') {
                console.warn('This page is using root styles.css instead of css/styles.css');
            }
        });
    }
    
    // Run the check
    checkPageModernization();
}); 