import express, { Request, Response } from 'express';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { db } from '../lib/db';
import { decrypt, hashAccessCode } from '../lib/encryption';

const router = express.Router();

// Blocked URL patterns for settings/billing/account pages
const BLOCKED_PATTERNS = [
  /\/settings/i,
  /\/account(?!\/login)/i,
  /\/billing/i,
  /\/payment/i,
  /\/subscription/i,
  /\/profile/i,
  /\/security/i,
  /\/password/i,
  /\/preferences/i,
  /\/invoices?/i,
  /\/api[-_]?keys/i,
  /\/developer/i,
];

// Check if URL path is blocked
function isBlockedPath(path: string): boolean {
  return BLOCKED_PATTERNS.some(pattern => pattern.test(path));
}

// Get session cookies for a product
async function getSessionCookies(accessCode: string, productSlug: string): Promise<{ cookies: any[], product: any } | null> {
  try {
    const accessCodeHash = hashAccessCode(accessCode);
    
    // Get purchase and product info
    const result = await db.query(
      `SELECT p.*, prod.id as prod_id, prod.name as prod_name, prod.encrypted_session_cookies,
              prod.service_url, prod.login_domain, prod.slug
       FROM purchases p
       JOIN products prod ON p.product_id = prod.id
       WHERE p.access_code_hash = $1 AND p.status = $2 AND p.expires_at > NOW()
       AND (prod.slug = $3 OR prod.login_domain ILIKE $4)`,
      [accessCodeHash, 'active', productSlug, `%${productSlug}%`]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const purchase = result.rows[0];

    if (!purchase.encrypted_session_cookies) {
      return null;
    }

    const decrypted = decrypt(purchase.encrypted_session_cookies);
    const cookies = JSON.parse(decrypted);

    return { cookies, product: purchase };
  } catch (error) {
    console.error('Error getting session cookies:', error);
    return null;
  }
}

// Build cookie header string from cookies array
function buildCookieHeader(cookies: any[]): string {
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

// Rewrite URLs in HTML content
function rewriteUrls(content: string, baseUrl: string, proxyBase: string): string {
  // Rewrite absolute URLs to the target domain
  const urlObj = new URL(baseUrl);
  const targetOrigin = urlObj.origin;
  
  // Replace absolute URLs with proxy URLs
  content = content.replace(
    new RegExp(`(href|src|action)=["'](${targetOrigin})([^"']*)["']`, 'gi'),
    `$1="${proxyBase}$3"`
  );
  
  // Replace protocol-relative URLs
  content = content.replace(
    new RegExp(`(href|src|action)=["']//(${urlObj.host})([^"']*)["']`, 'gi'),
    `$1="${proxyBase}$3"`
  );
  
  // Replace root-relative URLs (starting with /)
  content = content.replace(
    /(href|src|action)=["']\/([^/"'][^"']*)["']/gi,
    `$1="${proxyBase}/$2"`
  );

  return content;
}

// Proxy endpoint: /api/proxy/:product/{*path}
router.all('/:product/{*path}', async (req: Request, res: Response) => {
  const product = req.params.product as string;
  const pathParam = (req.params as any).path || '';
  const targetPath = '/' + pathParam;
  const accessCode = (req.query.ac as string) || req.cookies?.groupbuy_access_code;

  console.log(`[Proxy] Request: ${req.method} ${product}${targetPath}`);

  // Check if path is blocked
  if (isBlockedPath(targetPath)) {
    res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Access Restricted</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
          }
          .container {
            text-align: center;
            padding: 60px;
            background: rgba(255,255,255,0.05);
            border-radius: 20px;
            max-width: 500px;
          }
          .icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 30px;
          }
          h1 { margin: 0 0 15px; }
          p { color: rgba(255,255,255,0.7); line-height: 1.6; }
          button {
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: white;
            border: none;
            padding: 14px 40px;
            font-size: 16px;
            border-radius: 10px;
            cursor: pointer;
            margin-top: 20px;
          }
          button:hover { opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
            </svg>
          </div>
          <h1>Access Restricted</h1>
          <p>Settings, billing, and account pages are not accessible with shared accounts. This restriction protects the account owner's personal information.</p>
          <button onclick="history.back()">Go Back</button>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // Validate access code
  if (!accessCode) {
    res.status(401).json({ error: 'Access code required. Add ?ac=YOUR_ACCESS_CODE to the URL.' });
    return;
  }

  // Get session cookies
  const sessionData = await getSessionCookies(accessCode, product);
  if (!sessionData) {
    res.status(403).json({ error: 'Invalid access code or no access to this product.' });
    return;
  }

  const { cookies, product: productInfo } = sessionData;

  // Determine target URL
  let targetHost = productInfo.login_domain || 'www.blinkist.com';
  if (!targetHost.includes('.')) {
    targetHost = `www.${targetHost}.com`;
  }
  
  const targetUrl = `https://${targetHost}${targetPath}`;
  const proxyBase = `/api/proxy/${product}`;

  console.log(`[Proxy] Forwarding to: ${targetUrl}`);

  try {
    const urlObj = new URL(targetUrl);
    
    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: req.method,
      headers: {
        'Host': urlObj.hostname,
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.5',
        'Accept-Encoding': 'identity', // Don't accept compressed responses for easier rewriting
        'Cookie': buildCookieHeader(cookies),
        'Referer': `https://${urlObj.hostname}/`,
      },
    };

    const proxyReq = https.request(options, (proxyRes) => {
      // Copy status code
      res.status(proxyRes.statusCode || 200);

      // Copy headers (except some that shouldn't be forwarded)
      const skipHeaders = ['content-encoding', 'transfer-encoding', 'content-length', 'set-cookie', 'x-frame-options', 'content-security-policy'];
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (!skipHeaders.includes(key.toLowerCase()) && value) {
          res.setHeader(key, value);
        }
      }

      // Collect response body
      const chunks: Buffer[] = [];
      proxyRes.on('data', (chunk) => chunks.push(chunk));
      proxyRes.on('end', () => {
        let body = Buffer.concat(chunks);
        const contentType = proxyRes.headers['content-type'] || '';

        // Rewrite URLs in HTML responses
        if (contentType.includes('text/html')) {
          let html = body.toString('utf-8');
          html = rewriteUrls(html, targetUrl, proxyBase);
          
          // Add base tag for relative URLs
          if (!html.includes('<base')) {
            html = html.replace('<head>', `<head><base href="${proxyBase}/">`);
          }
          
          body = Buffer.from(html, 'utf-8');
        }

        // Rewrite URLs in CSS
        if (contentType.includes('text/css')) {
          let css = body.toString('utf-8');
          css = css.replace(/url\(['"]?\//g, `url('${proxyBase}/`);
          body = Buffer.from(css, 'utf-8');
        }

        res.setHeader('Content-Length', body.length);
        res.send(body);
      });
    });

    proxyReq.on('error', (error) => {
      console.error('[Proxy] Request error:', error);
      res.status(502).json({ error: 'Failed to connect to target server' });
    });

    // Forward request body for POST/PUT requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }

    proxyReq.end();
  } catch (error) {
    console.error('[Proxy] Error:', error);
    res.status(500).json({ error: 'Proxy error' });
  }
});

// Root proxy endpoint - redirect to product home
router.get('/:product', async (req: Request, res: Response) => {
  const { product } = req.params;
  const accessCode = req.query.ac as string;
  
  if (!accessCode) {
    res.status(401).json({ error: 'Access code required. Add ?ac=YOUR_ACCESS_CODE to the URL.' });
    return;
  }

  res.redirect(`/api/proxy/${product}/?ac=${accessCode}`);
});

export default router;
