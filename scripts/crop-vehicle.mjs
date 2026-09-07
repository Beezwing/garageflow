/**
 * Slice a 5-view vehicle diagram composite into per-view PNGs for the check-in
 * damage diagram.
 *
 *   1. Save the composite image to  public/vehicle/source.png
 *   2. npm i -D sharp   (one time)
 *   3. node scripts/crop-vehicle.mjs
 *
 * Crop boxes are fractions of the source (left, top, width, height). Tune them
 * to your image, then re-run. Output: public/vehicle/{top,front,rear,left,right}.png
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SRC = path.resolve("public/vehicle/source.png");
const OUT = path.resolve("public/vehicle");

// left, top, width, height — as fractions of the whole image
const BOXES = {
  top: [0.02, 0.0, 0.25, 0.72],
  front: [0.27, 0.08, 0.28, 0.52],
  rear: [0.55, 0.08, 0.28, 0.52],
  left: [0.0, 0.6, 0.42, 0.4],
  right: [0.48, 0.6, 0.42, 0.4],
};

const meta = await sharp(SRC).metadata();
await mkdir(OUT, { recursive: true });

for (const [view, [l, t, w, h]] of Object.entries(BOXES)) {
  const left = Math.round(l * meta.width);
  const top = Math.round(t * meta.height);
  const width = Math.min(Math.round(w * meta.width), meta.width - left);
  const height = Math.min(Math.round(h * meta.height), meta.height - top);
  await sharp(SRC)
    .extract({ left, top, width, height })
    .resize({ width: 900, withoutEnlargement: true })
    .png()
    .toFile(path.join(OUT, `${view}.png`));
  console.log(`${view}.png  ${width}x${height}`);
}
console.log("done — reload /workshop/check-in");
