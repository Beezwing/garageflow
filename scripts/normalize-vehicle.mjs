/** Trim the white margin off each vehicle view and cap its size. Run once after
 *  dropping new images into public/vehicle/.  node scripts/normalize-vehicle.mjs */
import sharp from "sharp";
import path from "node:path";

const DIR = path.resolve("public/vehicle");
const VIEWS = ["top", "front", "rear", "left", "right"];

for (const v of VIEWS) {
  const file = path.join(DIR, `${v}.png`);
  try {
    const buf = await sharp(file)
      .trim({ threshold: 12 })
      .resize({ width: 1000, height: 800, fit: "inside", withoutEnlargement: true })
      .png({ quality: 90 })
      .toBuffer();
    await sharp(buf).toFile(file);
    const m = await sharp(file).metadata();
    console.log(`${v}.png -> ${m.width}x${m.height}`);
  } catch (e) {
    console.log(`${v}.png skipped: ${e.message}`);
  }
}
