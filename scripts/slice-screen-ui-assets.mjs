import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "public", "art", "ui");
const outputRoot = path.join(sourceRoot, "slices");

await mkdir(outputRoot, { recursive: true });

const slices = [
  ["tabs-v1.png", "tab-active-v2.png", 12, 25, 294, 175],
  ["tabs-v1.png", "tab-idle-v2.png", 343, 42, 286, 158],

  ["cards-v1.png", "card-default-v2.png", 25, 31, 590, 196],
  ["cards-v1.png", "card-selected-v2.png", 25, 232, 590, 198],
  ["cards-v1.png", "card-thumbnail-v2.png", 24, 429, 174, 169],
  ["cards-v1.png", "card-divider-v2.png", 196, 491, 413, 54],

  ["buttons-v1.png", "button-primary-v2.png", 31, 31, 338, 132],
  ["buttons-v1.png", "button-pressed-v2.png", 31, 174, 338, 126],
  ["buttons-v1.png", "button-disabled-v2.png", 31, 309, 338, 132],
  ["buttons-v1.png", "button-secondary-v2.png", 31, 449, 338, 124],
  ["buttons-v1.png", "button-danger-v2.png", 31, 574, 338, 132],

  ["icons-v1.png", "icon-lock-v2.png", 19, 91, 101, 123],
  ["icons-v1.png", "icon-check-v2.png", 137, 94, 126, 115],
  ["icons-v1.png", "icon-close-v2.png", 270, 93, 113, 116],
  ["icons-v1.png", "icon-plus-v2.png", 389, 88, 112, 126],
  ["icons-v1.png", "icon-refresh-v2.png", 503, 92, 128, 120],
  ["icons-v1.png", "icon-paw-v2.png", 257, 267, 126, 127],
  ["icons-v1.png", "icon-warning-v2.png", 500, 271, 122, 123],

  ["panels-v1.png", "panel-card-v2.png", 21, 18, 598, 344],
  ["panels-v1.png", "panel-strip-v2.png", 47, 355, 548, 131],
  ["panels-v1.png", "progress-track-v2.png", 48, 487, 546, 60],
  ["panels-v1.png", "progress-fill-v2.png", 48, 535, 546, 70],

  ["badges-v1.png", "badge-wide-v2.png", 40, 15, 341, 111],
  ["badges-v1.png", "badge-pill-v2.png", 397, 16, 221, 108],
];

for (const [inputName, outputName, left, top, width, height] of slices) {
  console.log(`Slicing ${inputName} -> ${outputName}`);
  const extracted = await sharp(path.join(sourceRoot, inputName))
    .extract({ left, top, width, height })
    .png()
    .toBuffer();

  await sharp(extracted)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .extend({
      top: 2,
      right: 2,
      bottom: 2,
      left: 2,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(outputRoot, outputName));
}

console.log(`Created ${slices.length} UI slices in ${outputRoot}`);
