import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "public", "logo-source.png");
const OUT = path.join(__dirname, "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

// The source is a 1536x1024 lockup (mark + "GarageFlow" wordmark + tagline).
// Crop just the gear/car/road mark, square, with a little breathing room.
const CROP = { left: 467, top: 52, width: 600, height: 515 };

const markBuf = await sharp(SRC).extract(CROP).png().toBuffer();

// Standard + apple-touch: mark filling most of a white square.
async function square(size, file) {
  await sharp(markBuf)
    .resize(size, size, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .png()
    .toFile(path.join(OUT, file));
}

// Maskable: same mark, shrunk into the ~80% safe zone so an OS mask
// (circle/squircle) never clips the gear teeth.
async function maskable(size, file) {
  const inner = Math.round(size * 0.7);
  const pad = Math.round((size - inner) / 2);
  await sharp(markBuf)
    .resize(inner, inner, { fit: "contain", background: "#ffffff" })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: "#ffffff" })
    .resize(size, size)
    .flatten({ background: "#ffffff" })
    .png()
    .toFile(path.join(OUT, file));
}

await square(192, "icon-192.png");
await square(512, "icon-512.png");
await square(180, "apple-touch-icon.png");
await maskable(512, "icon-maskable-512.png");

// Small header/login badge — same mark, modest size, app renders it in a
// rounded-corner clip so it reads as a chip.
await square(96, "mark-96.png");

console.log("done");
