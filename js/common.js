// Insert header and footer content directly
(function() {
  // Log when script is loaded
  console.log('Common.js loaded');
  
  // Add Microsoft Clarity Analytics to all pages
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window, document, "clarity", "script", "r5vp3h3mly");
  
  // Header content
  const headerContent = `
  <header>
    <nav class="navbar navbar-expand-lg navbar-light fixed-top">
      <div class="container">
        <a class="navbar-brand" href="index.html">Success Marketing</a>
        <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav ml-auto">
            <li class="nav-item">
              <a class="nav-link" href="index.html">Home</a>
            </li>
            <li class="nav-item">
              <a class="nav-link" href="About_us.html">About Us</a>
            </li>
            <li class="nav-item dropdown">
              <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                Products
              </a>
              <div class="dropdown-menu" aria-labelledby="navbarDropdown">
                <a class="dropdown-item" href="Products.html">All Products</a>
                <div class="dropdown-divider"></div>
                <a class="dropdown-item" href="Cups.html">Cups & Glasses</a>
                <a class="dropdown-item" href="Plates.html">Plates</a>
                <a class="dropdown-item" href="Containers.html">Containers</a>
                <a class="dropdown-item" href="Spoons.html">Cutlery</a>
                <a class="dropdown-item" href="Tissue.html">Tissue & Napkins</a>
              </div>
            </li>
            <li class="nav-item dropdown">
              <a class="nav-link dropdown-toggle" href="#" id="resourcesDropdown" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                Resources
              </a>
              <div class="dropdown-menu" aria-labelledby="resourcesDropdown">
                <a class="dropdown-item" href="market-overview.html">Market Overview</a>
                <a class="dropdown-item" href="guide-to-disposables.html">Guide to Disposables</a>
                <a class="dropdown-item" href="usecases.html">Use Cases</a>
                <a class="dropdown-item" href="how-to-use.html">How To Use</a>
                <a class="dropdown-item" href="case-studies.html">Case Studies</a>
              </div>
            </li>
            <li class="nav-item">
              <a class="nav-link" href="Contact.html">Contact</a>
            </li>
            <li class="nav-item">
              <a href="https://wa.me/919024048484" class="btn btn-sm btn-success ml-2" style="margin-top: 3px;"><i class="fab fa-whatsapp mr-1"></i> WhatsApp</a>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  </header>
  `;
  
  // Footer content
  const footerContent = `
  <!-- Footer -->
  <footer class="footer">
    <div class="container">
      <div class="row">
        <div class="col-lg-4 col-md-6">
          <h4 class="footer-title">About Success Marketing</h4>
          <p>Success Marketing is one of India's largest wholesalers of disposable food packaging products, serving restaurants, hotels, and food businesses since 1991.</p>
          <div class="footer-social">
            <a href="https://www.facebook.com/successmarketingkota/" target="_blank"><i class="fab fa-facebook-f"></i></a>
            <a href="https://www.instagram.com/successmarketingkota/" target="_blank"><i class="fab fa-instagram"></i></a>
            <a href="#"><i class="fab fa-linkedin-in"></i></a>
            <a href="https://wa.me/919024048484"><i class="fab fa-whatsapp"></i></a>
          </div>
        </div>
        <div class="col-lg-2 col-md-6">
          <h4 class="footer-title">Quick Links</h4>
          <a href="index.html" class="footer-link">Home</a>
          <a href="About_us.html" class="footer-link">About Us</a>
          <a href="Products.html" class="footer-link">Products</a>
          <a href="Contact.html" class="footer-link">Contact</a>
        </div>
        <div class="col-lg-3 col-md-6">
          <h4 class="footer-title">Products</h4>
          <a href="Cups.html" class="footer-link">Cups & Glasses</a>
          <a href="Containers.html" class="footer-link">Food Containers</a>
          <a href="Plates.html" class="footer-link">Plates</a>
          <a href="Tissue.html" class="footer-link">Tissue & Napkins</a>
          <a href="Products.html" class="footer-link">View All Products</a>
        </div>
        <div class="col-lg-3 col-md-6">
          <h4 class="footer-title">Contact Info</h4>
          <ul class="list-unstyled footer-contact">
            <li>
              <i class="fas fa-map-marker-alt"></i>
              <span>8-C, New Grain Mandi, Aerodrome Circle, Kota - 324007, Rajasthan, India</span>
            </li>
            <li>
              <i class="fas fa-phone-alt"></i>
              <span>+91 9024048484</span>
            </li>
            <li>
              <i class="fas fa-envelope"></i>
              <span>successmarketingkota@gmail.com</span>
            </li>
            <li>
              <i class="fas fa-clock"></i>
              <span>Mon-Sat: 11:00 AM - 7:00 PM</span>
            </li>
          </ul>
        </div>
      </div>
      <div class="row mt-4">
        <div class="col-lg-12">
          <h4 class="footer-title">Resource Center</h4>
          <div class="footer-resources">
            <a href="market-overview.html" class="footer-link">Market Overview</a>
            <a href="guide-to-disposables.html" class="footer-link">Guide to Disposables</a>
            <a href="usecases.html" class="footer-link">Use Cases</a>
            <a href="how-to-use.html" class="footer-link">How To Use</a>
            <a href="case-studies.html" class="footer-link">Case Studies</a>
          </div>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <div class="container">
        <div class="row align-items-center">
          <div class="col-md-6">
            <p class="copyright mb-0">© 2025 Success Marketing. All Rights Reserved.</p>
          </div>
          <div class="col-md-6 text-md-right">
            <p class="mb-0 copyright">India's Leading Food Packaging Wholesaler Since 1991</p>
          </div>
        </div>
      </div>
    </div>
  </footer>

  <!-- WhatsApp Floating Button -->
  <div class="whatsapp-float">
    <a href="https://wa.me/919024048484?text=Hi,%20I%20need%20to%20know%20more%20about%20your%20products" class="whatsapp-btn" aria-label="Contact on WhatsApp">
      <i class="fab fa-whatsapp"></i>
    </a>
  </div>
  `;
  
  // Insert content when DOM is ready
  function insertContent() {
    console.log('Inserting content');
    const headerPlaceholder = document.getElementById('header-placeholder');
    const footerPlaceholder = document.getElementById('footer-placeholder');
    
    console.log('Header placeholder exists:', !!headerPlaceholder);
    console.log('Footer placeholder exists:', !!footerPlaceholder);
    
    if (headerPlaceholder) {
      headerPlaceholder.innerHTML = headerContent;
      console.log('Header content inserted');
    }
    
    if (footerPlaceholder) {
      footerPlaceholder.innerHTML = footerContent;
      console.log('Footer content inserted');
    }
    
    // Active link detection
    const currentPage = window.location.pathname.split('/').pop();
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
    const dropdownItems = document.querySelectorAll('.dropdown-menu .dropdown-item');
    
    // Check navbar links
    navLinks.forEach(link => {
      const linkHref = link.getAttribute('href');
      if (linkHref === currentPage) {
        link.classList.add('active');
        
        // If it's in a dropdown, also mark parent as active
        if (link.closest('.dropdown')) {
          link.closest('.dropdown').querySelector('.nav-link').classList.add('active');
        }
      }
    });
    
    // Check dropdown items
    dropdownItems.forEach(item => {
      const itemHref = item.getAttribute('href');
      if (itemHref === currentPage) {
        item.classList.add('active');
        item.closest('.dropdown').querySelector('.nav-link').classList.add('active');
      }
    });
  }

  // Run immediately if DOM is already loaded
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(insertContent, 1);
  } else {
    document.addEventListener('DOMContentLoaded', insertContent);
  }
})(); 