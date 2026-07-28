import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");
const validationDirectory = path.join(projectRoot, "tmp", "validation");
const panelWidth = 360;
const panelHeight = 270;
const headerHeight = 48;
const comparisons = [
  {
    id: "tent",
    before: "tent-workstation-before-clean-v4.png",
    after: "tent-workstation-after-clean.png",
  },
  {
    id: "round",
    before: "round-workstation-before-clean-v4.png",
    after: "round-workstation-after-clean.png",
  },
  {
    id: "folding",
    before: "folding-workstation-before-clean-v4.png",
    after: "folding-workstation-after-clean.png",
  },
  {
    id: "low-monitor",
    before: "low-monitor-selective-clean-v1-detail.png",
    after: "low-monitor-selective-clean-v2-color-corrected.png",
  },
];

function labelSvg(label, x) {
  return Buffer.from(`
    <svg width="${panelWidth}" height="${headerHeight}">
      <rect width="100%" height="100%" fill="#f6efe2"/>
      <text x="${x}" y="32" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="22"
        font-weight="700" fill="#6f5849">${label}</text>
    </svg>
  `);
}

await fs.mkdir(validationDirectory, { recursive: true });
const outputFiles = [];

for (const comparison of comparisons) {
  const before = await sharp(
    path.join(validationDirectory, comparison.before),
  )
    .resize(panelWidth, panelHeight, {
      fit: "contain",
      background: "#eef3e9",
    })
    .png()
    .toBuffer();
  const after = await sharp(
    path.join(validationDirectory, comparison.after),
  )
    .resize(panelWidth, panelHeight, {
      fit: "contain",
      background: "#eef3e9",
    })
    .png()
    .toBuffer();
  const outputPath = path.join(
    validationDirectory,
    `workstation-cleanup-comparison-${comparison.id}.png`,
  );
  await sharp({
    create: {
      width: panelWidth * 2,
      height: headerHeight + panelHeight,
      channels: 4,
      background: "#eef3e9",
    },
  })
    .composite([
      { input: labelSvg("BEFORE", panelWidth / 2), left: 0, top: 0 },
      {
        input: labelSvg("AFTER", panelWidth / 2),
        left: panelWidth,
        top: 0,
      },
      { input: before, left: 0, top: headerHeight },
      { input: after, left: panelWidth, top: headerHeight },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  outputFiles.push(outputPath);
}

const sheets = await Promise.all(
  outputFiles.map((file) =>
    sharp(file).resize(panelWidth * 2, headerHeight + panelHeight).toBuffer(),
  ),
);
const sheetPath = path.join(
  validationDirectory,
  "workstation-cleanup-comparison-all.png",
);
await sharp({
  create: {
    width: panelWidth * 2,
    height: (headerHeight + panelHeight) * comparisons.length,
    channels: 4,
    background: "#eef3e9",
  },
})
  .composite(
    sheets.map((input, index) => ({
      input,
      left: 0,
      top: index * (headerHeight + panelHeight),
    })),
  )
  .png({ compressionLevel: 9 })
  .toFile(sheetPath);

console.log(
  JSON.stringify(
    {
      comparisons: outputFiles,
      contactSheet: sheetPath,
    },
    null,
    2,
  ),
);
