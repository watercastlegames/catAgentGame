import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");
const outputPath = path.join(
  projectRoot,
  "tmp",
  "validation",
  "meshy-t2-smart-topology-comparison-v1.png",
);
const panelWidth = 640;
const panelHeight = 640;
const headerHeight = 86;
const background = { r: 244, g: 238, b: 227, alpha: 1 };
const panels = [
  {
    title: "2D REFERENCE",
    file: path.join(
      projectRoot,
      "assets",
      "meshy-references",
      "cats-soup-v1",
      "low-monitor-raised-four-key-workstation-ref-v2.png",
    ),
  },
  {
    title: "MESHY 6 · STANDARD",
    file: path.join(
      projectRoot,
      "assets",
      "meshy-source",
      "cats-soup-v1",
      "low-monitor-raised-four-key-workstation-meshy6-preview-v1.png",
    ),
  },
  {
    title: "MESHY T2 · SMART TOPOLOGY",
    file: path.join(
      projectRoot,
      "assets",
      "meshy-source",
      "cats-soup-t2-v1",
      "low-monitor-raised-four-key-workstation-meshy-t2-v1-preview.png",
    ),
  },
];

const layers = [];
for (const [index, panel] of panels.entries()) {
  const image = await sharp(panel.file)
    .resize(panelWidth - 48, panelHeight - 48, {
      fit: "contain",
      background,
    })
    .extend({
      top: 24,
      bottom: 24,
      left: 24,
      right: 24,
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
        <text x="50%" y="54" text-anchor="middle" font-family="Arial, sans-serif"
          font-size="26" font-weight="700" fill="#67564b">${panel.title}</text>
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
