// DOM Elements
const loginSection = document.getElementById('loginSection');
const productsSection = document.getElementById('productsSection');
const accessCodeInput = document.getElementById('accessCode');
const verifyBtn = document.getElementById('verifyBtn');
const backBtn = document.getElementById('backBtn');
const launchBtn = document.getElementById('launchBtn');
const productList = document.getElementById('productList');
const errorMessage = document.getElementById('errorMessage');
const errorMessage2 = document.getElementById('errorMessage2');

// State
let products = [];
let selectedProduct = null;
let currentAccessCode = '';

// Show error message
function showError(element, message) {
  element.textContent = message;
  element.classList.add('show');
}

// Hide error message
function hideError(element) {
  element.classList.remove('show');
}

// Set button loading state
function setLoading(button, loading, text = '') {
  if (loading) {
    button.disabled = true;
    button.innerHTML = `<span class="loading"></span>${text || 'Loading...'}`;
  } else {
    button.disabled = false;
    button.innerHTML = text || button.dataset.originalText || 'Submit';
  }
}

// Verify access code
async function verifyAccessCode() {
  const accessCode = accessCodeInput.value.trim();
  
  if (!accessCode) {
    showError(errorMessage, 'Please enter your access code');
    return;
  }

  hideError(errorMessage);
  verifyBtn.dataset.originalText = verifyBtn.innerHTML;
  setLoading(verifyBtn, true, 'Verifying...');

  try {
    const result = await window.electronAPI.verifyAccessCode(accessCode);
    
    if (result.success) {
      currentAccessCode = accessCode;
      products = result.products;
      showProductsSection();
    } else {
      showError(errorMessage, result.error || 'Invalid access code');
    }
  } catch (err) {
    showError(errorMessage, 'Failed to verify access code. Please try again.');
  } finally {
    setLoading(verifyBtn, false, 'Verify Access Code');
  }
}

// Show products section
function showProductsSection() {
  loginSection.style.display = 'none';
  productsSection.classList.add('show');
  
  // Render products
  productList.innerHTML = '';
  
  if (products.length === 0) {
    productList.innerHTML = '<p style="color: #6b7280; text-align: center;">No products available</p>';
    return;
  }

  products.forEach((product, index) => {
    const productItem = document.createElement('div');
    productItem.className = 'product-item';
    productItem.dataset.index = index;
    
    productItem.innerHTML = `
      <div class="product-icon">
        ${product.icon_url 
          ? `<img src="${product.icon_url}" alt="${product.name}" onerror="this.style.display='none'">` 
          : `<span style="font-size: 24px; color: #667eea;">${product.name.charAt(0).toUpperCase()}</span>`
        }
      </div>
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.service_url || 'Click to access'}</p>
      </div>
    `;
    
    productItem.addEventListener('click', () => selectProduct(index));
    productList.appendChild(productItem);
  });
}

// Select a product
function selectProduct(index) {
  // Remove previous selection
  document.querySelectorAll('.product-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  // Select new product
  const productItem = document.querySelector(`.product-item[data-index="${index}"]`);
  if (productItem) {
    productItem.classList.add('selected');
  }
  
  selectedProduct = products[index];
  launchBtn.disabled = false;
}

// Launch selected product
async function launchProduct() {
  if (!selectedProduct) {
    showError(errorMessage2, 'Please select a product');
    return;
  }

  hideError(errorMessage2);
  launchBtn.dataset.originalText = launchBtn.innerHTML;
  setLoading(launchBtn, true, 'Launching...');

  try {
    const result = await window.electronAPI.launchProduct({
      accessCode: currentAccessCode,
      productId: selectedProduct.id,
      productName: selectedProduct.name
    });
    
    if (!result.success) {
      showError(errorMessage2, result.error || 'Failed to launch product');
      setLoading(launchBtn, false, 'Launch Product');
    }
    // If successful, the window will close and main window will open
  } catch (err) {
    showError(errorMessage2, 'Failed to launch product. Please try again.');
    setLoading(launchBtn, false, 'Launch Product');
  }
}

// Go back to login section
function goBack() {
  productsSection.classList.remove('show');
  loginSection.style.display = 'block';
  selectedProduct = null;
  launchBtn.disabled = true;
  hideError(errorMessage2);
}

// Event listeners
verifyBtn.addEventListener('click', verifyAccessCode);
backBtn.addEventListener('click', goBack);
launchBtn.addEventListener('click', launchProduct);

// Enter key to verify
accessCodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    verifyAccessCode();
  }
});

// Focus input on load
window.addEventListener('DOMContentLoaded', () => {
  accessCodeInput.focus();
});
