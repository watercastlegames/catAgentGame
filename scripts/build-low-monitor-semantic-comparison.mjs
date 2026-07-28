import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourceDirectory = path.join(
  projectRoot,
  "tmp",
  "validation",
  "low-monitor-segmentation",
);
const outputPath = path.join(
  projectRoot,
  "tmp",
  "validation",
  "low-monitor-semantic-clean-v3-comparison.png",
);
const panelWidth = 620;
const panelHeight = 650;
const headerHeight = 76;
const background = { r: 244, g: 238, b: 227, alpha: 1 };
const panels = [
  {
    title: "BEFORE · ORIGINAL",
    file: "original-front-small.png",
  },
  {
    title: "MASK · PARTS",
    file: "final-mask-small.png",
  },
  {
    title: "AFTER · CLEAN V3",
    file: "clean-v3-final-front-v5-small.png",
  },
];

const layers = [];
for (let index = 0; index < panels.length; index += 1) {
  const panel = panels[index];
  const image = await sharp(path.join(sourceDirectory, panel.file))
    .trim({
      background,
      threshold: 10,
    })
    .resize(panelWidth - 56, panelHeight - 40, {
      fit: "contain",
      background,
    })
    .extend({
      top: 20,
      bottom: 20,
      left: 28,
      right: 28,
      background,
    })
    .png()
    .toBuffer();
  layers.push({
    input: image,
    left: index * panelWidth,
    top: headerHeight,
  });
  layers.push({
    input: Buffer.from(
      `<svg width="${panelWidth}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f4eee3"/>
        <text x="50%" y="48" text-anchor="middle" font-family="Arial, sans-serif"
          font-size="28" font-weight="700" fill="#67564b">${panel.title}</text>
      </svg>`,
    ),
    left: index * panelWidth,
    top: 0,
  });
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp({
  create: {
    width: panelWidth * panels.length,
    height: headerHeight + panelHeight,
    channels: 4,
    background,
  },
})
  .composite(layers)
  .png({ compressionLevel: 9 })
  .toFile(outputPath);

console.log(outputPath);
