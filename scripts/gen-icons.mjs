import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

// Standard icon: full-bleed brand square with the "G" mark, matches the
// blue badge used across the app's own UI (login, portal header, etc.)
const standard = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#f2751a"/>
  <text x="50" y="68" font-family="Arial, sans-serif" font-weight="700"
        font-size="60" fill="#ffffff" text-anchor="middle">G</text>
</svg>`;

// Maskable icon: same mark kept inside the ~80% safe zone so an OS that
// crops to a circle/squircle doesn't clip the letterform.
const maskable = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#f2751a"/>
  <text x="50" y="62" font-family="Arial, sans-serif" font-weight="700"
        font-size="46" fill="#ffffff" text-anchor="middle">G</text>
</svg>`;

const jobs = [
  ["icon-192.png", standard(192), 192],
  ["icon-512.png", standard(512), 512],
  ["icon-maskable-512.png", maskable(512), 512],
  ["apple-touch-icon.png", standard(180), 180],
];

for (const [name, svg, size] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(OUT, name));
  console.log("wrote", name);
}
