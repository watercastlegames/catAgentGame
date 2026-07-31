import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ART_ROOT = new URL("../public/art/", import.meta.url);
const pairs = [
  {
    clean: "menu-keycaps-base-v5.png",
    updated: "menu-keycaps-base-v7.png",
    masks: [
      [0.408, 0.357, 0.078, 0.105],
      [0.606, 0.355, 0.078, 0.105],
    ],
  },
  {
    clean: "menu-keycaps-pressed-1-v2.png",
    updated: "menu-keycaps-pressed-1-v4.png",
    masks: [
      [0.408, 0.357, 0.078, 0.105],
      [0.606, 0.355, 0.078, 0.105],
    ],
  },
  {
    clean: "menu-keycaps-pressed-2-v2.png",
    updated: "menu-keycaps-pressed-2-v4.png",
    masks: [
      [0.407, 0.472, 0.075, 0.096],
      [0.604, 0.355, 0.078, 0.105],
    ],
  },
  {
    clean: "menu-keycaps-pressed-3-v2.png",
    updated: "menu-keycaps-pressed-3-v4.png",
    masks: [
      [0.408, 0.357, 0.078, 0.105],
      [0.604, 0.475, 0.075, 0.096],
    ],
  },
  {
    clean: "menu-keycaps-pressed-4-v2.png",
    updated: "menu-keycaps-pressed-4-v4.png",
    masks: [
      [0.408, 0.357, 0.078, 0.105],
      [0.606, 0.355, 0.078, 0.105],
    ],
  },
];

async function rawImage(file) {
  const { data, info } = await sharp(fileURLToPath(new URL(file, ART_ROOT)))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, info };
}

test("every menu state changes only the intended icon pixels", async () => {
  for (const { clean: cleanFile, updated: updatedFile, masks } of pairs) {
    const clean = await rawImage(cleanFile);
    const updated = await rawImage(updatedFile);
    assert.deepEqual(updated.info, clean.info);

    const { width, height, channels } = clean.info;
    let iconPixelChanges = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const insideIconMask = masks.some(([cx, cy, rx, ry]) => {
          const dx = (x / width - cx) / rx;
          const dy = (y / height - cy) / ry;
          return dx * dx + dy * dy <= 1;
        });
        const offset = (y * width + x) * channels;

        for (let channel = 0; channel < channels; channel += 1) {
          const changed =
            updated.data[offset + channel] !== clean.data[offset + channel];
          if (insideIconMask && changed) iconPixelChanges += 1;
          assert.equal(
            insideIconMask || !changed,
            true,
            `${updatedFile} changed non-icon pixel (${x}, ${y})`,
          );
        }
      }
    }

    assert.ok(iconPixelChanges > 1_000, `${updatedFile} must update its icons`);
  }
});
