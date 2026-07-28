import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");
const outputPath = path.join(
  projectRoot,
  "tmp",
  "validation",
  "monitor-isolated-meshy6-comparison-v1.png",
);
const panelWidth = 520;
const panelHeight = 520;
const headerHeight = 82;
const background = { r: 244, g: 238, b: 227, alpha: 1 };
const panels = [
  {
    title: "INPUT V1 · GAPPED LINE",
    file: path.join(
      projectRoot,
      "assets",
      "meshy-references",
      "cats-soup-parts-v1",
      "monitor-clean-ref-v1.png",
    ),
  },
  {
    title: "MESHY V1 · DENTED",
    file: path.join(
      projectRoot,
      "assets",
      "meshy-source",
      "cats-soup-parts-v1",
      "monitor-meshy6-v1-preview.png",
    ),
  },
  {
    title: "INPUT V2 · CLOSED LINE",
    file: path.join(
      projectRoot,
      "assets",
      "meshy-references",
      "cats-soup-parts-v1",
      "monitor-clean-ref-v2.png",
    ),
  },
  {
    title: "MESHY V2 · CLEAN",
    file: path.join(
      projectRoot,
      "assets",
      "meshy-source",
      "cats-soup-parts-v1",
      "monitor-meshy6-v2-preview.png",
    ),
  },
];

const layers = [];
for (const [index, panel] of panels.entries()) {
  const image = await sharp(panel.file)
    .resize(panelWidth - 44, panelHeight - 44, {
      fit: "contain",
      background,
    })
    .extend({
      top: 22,
      bottom: 22,
      left: 22,
      right: 22,
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
        <text x="50%" y="52" text-anchor="middle" font-family="Arial, sans-serif"
          font-size="23" font-weight="700" fill="#67564b">${panel.title}</text>
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
