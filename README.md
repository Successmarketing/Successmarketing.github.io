# Success Marketing Website

This repository contains the source code for the Success Marketing company website, a wholesale supplier of disposable food packaging products based in Kota, Rajasthan.

## Website Structure

The website follows a modular structure with:

- **HTML Files**: Main pages for different product categories and sections
- **CSS**: Styling files in the `css/` directory
- **JavaScript**: Script files in the `js/` directory
- **Images/Products**: Product images in the `products/` directory

## Development Guidelines

### File Organization

- **HTML Files**: All pages should use the common header/footer structure with placeholders
- **CSS**: All styles should be in `css/styles.css`
- **JavaScript**: 
  - `js/main.js`: Main site functionality
  - `js/common.js`: Common components like header/footer

### Adding New Pages

1. Copy an existing page with similar structure (e.g., use `Plates.html` as a template)
2. Update metadata (title, description, keywords)
3. Update canonical and Open Graph URLs using the `successmarketingkota.com` domain
4. Use the header/footer placeholders:

```html
<!-- Header placeholder -->
<div id="header-placeholder"></div>

<!-- Main content here -->

<!-- Footer placeholder -->
<div id="footer-placeholder"></div>

<!-- JavaScript Files -->
<script src="js/main.js"></script>
<script src="js/common.js"></script>
```

### Updating Navigation

To update the navigation menu, edit the `js/common.js` file:

```javascript
// Header content
const headerContent = `
<header>
  <div class="nav-container">
    <a href="index.html">Home</a>
    <a href="About_us.html">About us</a>
    <a href="Products.html">Products</a>
    <a href="Contact.html">Contact us</a>
  </div>
</header>
`;
```

### Need Further Updates

Several HTML files still need to be modernized to use the header/footer placeholders. Check the console for warnings on pages that need updating.

## Contact

For questions or assistance, please contact:
- Email: successmarketingkota@gmail.com
- Phone: +91 9024048484 