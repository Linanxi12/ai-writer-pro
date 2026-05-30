// Quick icon generator - run with Node.js
// Generates simple SVG icons (convert to PNG for Chrome Web Store)
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];

sizes.forEach(size => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size/4}" fill="url(#g)"/>
  <text x="${size/2}" y="${size/2 + size/6}" text-anchor="middle" fill="white" font-size="${size/2}" font-family="Arial">✨</text>
</svg>`;
  fs.writeFileSync(path.join(__dirname, `icon${size}.svg`), svg);
  console.log(`Generated icon${size}.svg`);
});

console.log('Done! Convert SVGs to PNGs for Chrome Web Store submission.');
