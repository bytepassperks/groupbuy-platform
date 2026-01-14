#!/usr/bin/env node

const puppeteer = require('puppeteer-core');
const axios = require('axios');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs');
const os = require('os');

const API_BASE_URL = 'http://165.22.2.0/api';

// Blocked URL patterns (settings, billing, account pages)
const BLOCKED_PATTERNS = [
  /\/settings/i,
  /\/account/i,
  /\/billing/i,
  /\/subscription/i,
  /\/payment/i,
  /\/profile/i,
  /\/preferences/i,
  /\/admin/i,
  /\/manage/i,
  /\/plan/i,
  /\/upgrade/i,
  /\/cancel/i,
  /\/delete-account/i,
  /\/security/i,
  /\/password/i,
  /\/email-settings/i,
  /\/notifications-settings/i,
  /\/help/i,
  /\/support/i,
  /\/contact/i,
  /\/faq/i,
  /\/privacy/i,
  /\/terms/i,
  /\/legal/i
];

// Blocked external domain patterns
const BLOCKED_DOMAIN_PATTERNS = [
  /^support\./i,
  /^help\./i,
  /^faq\./i,
  /^contact\./i,
  /intercom/i,
  /zendesk/i,
  /freshdesk/i,
  /helpscout/i,
  /crisp/i,
  /drift/i
];

let allowedDomain = null;

function findChrome() {
  const platform = os.platform();
  const possiblePaths = [];

  if (platform === 'win32') {
    possiblePaths.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    );
  } else if (platform === 'darwin') {
    possiblePaths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    possiblePaths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge'
    );
  }

  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }

  return null;
}

function isBlockedUrl(url) {
  try {
    const urlObj = new URL(url);
    const fullPath = urlObj.pathname + urlObj.search;
    return BLOCKED_PATTERNS.some(pattern => pattern.test(fullPath));
  } catch {
    return false;
  }
}

function isExternalDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    if (!allowedDomain) {
      return true;
    }

    const allowed = allowedDomain.toLowerCase();

    if (hostname === allowed || hostname === `www.${allowed}`) {
      return false;
    }

    if (hostname.endsWith(`.${allowed}`)) {
      if (BLOCKED_DOMAIN_PATTERNS.some(pattern => pattern.test(hostname))) {
        return true;
      }
      return false;
    }

    return true;
  } catch {
    return true;
  }
}

function extractMainDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostParts = urlObj.hostname.split('.');
    if (hostParts.length >= 2) {
      return hostParts.slice(-2).join('.');
    }
    return urlObj.hostname;
  } catch {
    return null;
  }
}

async function verifyAccessCode(accessCode) {
  try {
    const response = await axios.post(`${API_BASE_URL}/extension/verify-code`, {
      accessCode
    });

    if (response.data.success) {
      const products = (response.data.subscriptions || []).map(sub => ({
        id: sub.product_id,
        name: sub.product_name,
        serviceUrl: sub.login_url,
        iconUrl: sub.icon_url,
        expiresAt: sub.expires_at
      }));

      return { success: true, products };
    } else {
      return { success: false, error: response.data.error || 'Invalid access code' };
    }
  } catch (err) {
    return { success: false, error: 'Failed to connect to server: ' + err.message };
  }
}

async function getSessionCookies(accessCode, productId) {
  try {
    const response = await axios.post(`${API_BASE_URL}/extension/get-credentials`, {
      accessCode,
      productId,
      deviceFingerprint: `chrome-launcher-${os.platform()}-${os.hostname()}`
    });

    if (response.data.success) {
      return {
        success: true,
        cookies: response.data.sessionCookies || [],
        productUrl: response.data.serviceUrl || response.data.loginUrl,
        productName: response.data.productName
      };
    } else {
      return { success: false, error: response.data.error || 'Failed to get session' };
    }
  } catch (err) {
    return { success: false, error: 'Failed to connect to server: ' + err.message };
  }
}

async function logoutUser(accessCode, productId) {
  try {
    await axios.post(`${API_BASE_URL}/extension/logout`, {
      accessCode,
      productId
    });
  } catch (err) {
    console.error('Logout error:', err.message);
  }
}

async function main() {
  console.log(chalk.cyan('\n╔════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.white.bold('     GroupBuy Chrome Launcher v1.0     ') + chalk.cyan('║'));
  console.log(chalk.cyan('╚════════════════════════════════════════╝\n'));

  // Find Chrome
  const spinner = ora('Finding Chrome browser...').start();
  const chromePath = findChrome();

  if (!chromePath) {
    spinner.fail('Chrome browser not found!');
    console.log(chalk.red('\nPlease install Google Chrome or Microsoft Edge to use this application.'));
    console.log(chalk.yellow('Download Chrome: https://www.google.com/chrome/'));
    process.exit(1);
  }

  spinner.succeed(`Found browser: ${path.basename(chromePath)}`);

  // Get access code
  const { accessCode } = await inquirer.prompt([
    {
      type: 'input',
      name: 'accessCode',
      message: 'Enter your access code:',
      validate: input => input.length > 0 || 'Access code is required'
    }
  ]);

  // Verify access code
  const verifySpinner = ora('Verifying access code...').start();
  const verifyResult = await verifyAccessCode(accessCode);

  if (!verifyResult.success) {
    verifySpinner.fail(verifyResult.error);
    process.exit(1);
  }

  verifySpinner.succeed('Access code verified!');

  if (verifyResult.products.length === 0) {
    console.log(chalk.red('\nNo products available for this access code.'));
    process.exit(1);
  }

  // Select product
  const { selectedProduct } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedProduct',
      message: 'Select a product:',
      choices: verifyResult.products.map(p => ({
        name: `${p.name} (expires: ${new Date(p.expiresAt).toLocaleDateString()})`,
        value: p
      }))
    }
  ]);

  // Get session cookies
  const sessionSpinner = ora('Getting session...').start();
  const sessionResult = await getSessionCookies(accessCode, selectedProduct.id);

  if (!sessionResult.success) {
    sessionSpinner.fail(sessionResult.error);
    process.exit(1);
  }

  sessionSpinner.succeed('Session obtained!');

  // Set allowed domain
  allowedDomain = extractMainDomain(sessionResult.productUrl);
  console.log(chalk.gray(`Allowed domain: ${allowedDomain}`));

  // Create user data directory
  const userDataDir = path.join(os.tmpdir(), 'groupbuy-chrome-profile');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // Launch Chrome
  const launchSpinner = ora('Launching Chrome...').start();

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: false,
      defaultViewport: null,
      userDataDir: userDataDir,
      args: [
        '--start-maximized',
        '--disable-infobars',
        '--disable-extensions',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        `--app-name=GroupBuy - ${selectedProduct.name}`
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    // Inject cookies
    for (const cookie of sessionResult.cookies) {
      try {
        await page.setCookie({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || '/',
          secure: cookie.secure || false,
          httpOnly: cookie.httpOnly || false,
          sameSite: cookie.sameSite || 'Lax'
        });
      } catch (err) {
        console.error(`Failed to set cookie ${cookie.name}:`, err.message);
      }
    }

    launchSpinner.succeed('Chrome launched!');

    // Set up request interception for blocking
    await page.setRequestInterception(true);

    page.on('request', request => {
      const url = request.url();

      // Allow resource requests (images, scripts, etc.)
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media', 'script', 'xhr', 'fetch', 'websocket'].includes(resourceType)) {
        request.continue();
        return;
      }

      // Check if it's a blocked URL or external domain
      if (isBlockedUrl(url)) {
        console.log(chalk.yellow(`Blocked restricted URL: ${url}`));
        request.abort('blockedbyclient');
        return;
      }

      if (isExternalDomain(url) && resourceType === 'document') {
        console.log(chalk.yellow(`Blocked external domain: ${url}`));
        request.abort('blockedbyclient');
        return;
      }

      request.continue();
    });

    // Navigate to product URL
    console.log(chalk.green(`\nOpening ${selectedProduct.name}...`));
    await page.goto(sessionResult.productUrl, { waitUntil: 'networkidle2' });

    console.log(chalk.green('\n✓ Product loaded successfully!'));
    console.log(chalk.gray('Close the browser window to logout and exit.\n'));

    // Wait for browser to close
    await new Promise(resolve => {
      browser.on('disconnected', resolve);
    });

  } catch (err) {
    launchSpinner.fail(`Failed to launch Chrome: ${err.message}`);
    process.exit(1);
  }

  // Logout
  const logoutSpinner = ora('Logging out...').start();
  await logoutUser(accessCode, selectedProduct.id);
  logoutSpinner.succeed('Logged out successfully!');

  console.log(chalk.cyan('\nThank you for using GroupBuy!\n'));
  process.exit(0);
}

main().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
