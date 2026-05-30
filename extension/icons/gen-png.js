// Generate PNG icons using Jimp v1+ API
const { Jimp } = require('jimp');
const path = require('path');

const sizes = [16, 48, 128];
const COLOR_START = { r: 99, g: 102, b: 241 };
const COLOR_END = { r: 139, g: 92, b: 246 };

async function generateIcon(size) {
  const img = new Jimp({ width: size, height: size, color: 0x00000000 });

  const radius = Math.floor(size / 4);
  const cx = size / 2, cy = size / 2;

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      // Check if pixel is within rounded rect
      const dx = Math.max(Math.abs(x - cx + 0.5) - (size / 2 - radius), 0);
      const dy = Math.max(Math.abs(y - cy + 0.5) - (size / 2 - radius), 0);
      if (Math.sqrt(dx * dx + dy * dy) > radius) continue;

      // Gradient calculation
      const t = (x + y) / (size * 2);
      const r = Math.round(COLOR_START.r + (COLOR_END.r - COLOR_START.r) * t);
      const g = Math.round(COLOR_START.g + (COLOR_END.g - COLOR_START.g) * t);
      const b = Math.round(COLOR_START.b + (COLOR_END.b - COLOR_START.b) * t);

      // Draw white sparkle/star shape
      const crossSize = size * 0.3;
      const thick = Math.max(1, size * 0.13);
      const inStar = (
        (Math.abs(x - cx) < thick && Math.abs(y - cy) < crossSize) ||
        (Math.abs(y - cy) < thick && Math.abs(x - cx) < crossSize) ||
        (Math.abs(x - cx) < crossSize * 0.7 && Math.abs(y - cy) < crossSize * 0.7 &&
         Math.abs(Math.abs(x - cx) - Math.abs(y - cy)) < thick * 2)
      );

      // Jimp uses 0xRRGGBBAA hex format; >>>0 fixes JS signed int overflow
      const rgbaToInt = (rr, gg, bb, aa) => ((rr << 24) | (gg << 16) | (bb << 8) | aa) >>> 0;
      const color = inStar
        ? rgbaToInt(255, 255, 255, 255)
        : rgbaToInt(r, g, b, 255);

      img.setPixelColor(color, x, y);
    }
  }

  const filepath = path.join(__dirname, `icon${size}.png`);
  await img.write(filepath);
  console.log(`✅ Generated icon${size}.png (${size}x${size})`);
}

(async () => {
  console.log('Generating extension icons...');
  for (const size of sizes) {
    await generateIcon(size);
  }
  console.log('Done!');
})();
