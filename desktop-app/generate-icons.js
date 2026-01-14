const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, 'assets');

// Create assets directory if it doesn't exist
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Create a simple icon with gradient background and "GB" text
async function createIcon() {
  const size = 512;
  
  // Create SVG with gradient and text
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="100" fill="url(#grad)"/>
      <text x="50%" y="55%" font-family="Arial, sans-serif" font-size="200" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">GB</text>
    </svg>
  `;

  // Generate PNG icon
  const pngBuffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  // Save different sizes
  const sizes = [16, 32, 48, 64, 128, 256, 512];
  
  for (const s of sizes) {
    await sharp(pngBuffer)
      .resize(s, s)
      .png()
      .toFile(path.join(assetsDir, `icon-${s}.png`));
  }

  // Save main icon
  await sharp(pngBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));

  // For Windows ICO, we'll use the 256x256 PNG (electron-builder will convert)
  await sharp(pngBuffer)
    .resize(256, 256)
    .png()
    .toFile(path.join(assetsDir, 'icon.ico'));

  // For Mac ICNS, we'll use the 512x512 PNG (electron-builder will convert)
  await sharp(pngBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(assetsDir, 'icon.icns'));

  console.log('Icons generated successfully!');
}

createIcon().catch(console.error);
