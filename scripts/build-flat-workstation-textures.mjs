import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(
  projectRoot,
  "public",
  "art",
  "workstations-flat-v2",
);

const workstationModels = [
  {
    input:
      "public/models/camping-style-locked-v3/tent-workstation-meshy6-web-v3.glb",
    output: "tent-workstation-flat-v2.png",
  },
  {
    input:
      "public/models/camping-style-locked-v3/round-laptop-workstation-meshy6-web-v3.glb",
    output: "round-laptop-workstation-flat-v2.png",
  },
  {
    input:
      "public/models/camping-style-locked-v3/folding-laptop-radio-workstation-meshy6-web-v3.glb",
    output: "folding-laptop-radio-workstation-flat-v2.png",
  },
  {
    input:
      "public/models/camping-style-locked-v3/low-monitor-cat-keycap-workstation-meshy6-web-v3.glb",
    output: "low-monitor-cat-keycap-workstation-flat-v2.png",
  },
];

function extractFirstEmbeddedImage(glbBuffer) {
  const jsonLength = glbBuffer.readUInt32LE(12);
  const jsonStart = 20;
  const json = JSON.parse(
    glbBuffer
      .subarray(jsonStart, jsonStart + jsonLength)
      .toString("utf8")
      .replace(/\0+$/, ""),
  );
  const image = json.images?.[0];
  const view = image && json.bufferViews?.[image.bufferView];
  if (!view) throw new Error("The GLB has no embedded workstation texture.");

  const binaryStart = jsonStart + jsonLength + 8;
  const start = binaryStart + (view.byteOffset ?? 0);
  return glbBuffer.subarray(start, start + view.byteLength);
}

function keycapFaceSvg(expressionIndex) {
  const expressions = [
    '<circle cx="206" cy="270" r="16"/><circle cx="306" cy="270" r="16"/><path d="M238 326 Q256 340 274 326"/>',
    '<path d="M186 276 Q206 258 226 276"/><path d="M286 276 Q306 258 326 276"/><path d="M238 328 Q256 346 274 328"/>',
    '<circle cx="206" cy="270" r="15"/><circle cx="306" cy="270" r="15"/><path d="M234 334 Q256 318 278 334"/>',
    '<path d="M188 270 Q207 290 226 270"/><path d="M286 270 Q305 290 324 270"/><path d="M234 326 Q256 350 278 326"/>',
  ];
  return `
    <svg width="512" height="512" viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg">
      <g fill="none" stroke="#755344" stroke-width="22"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M132 218 L158 132 L220 182 Q256 164 292 182 L354 132 L380 218"/>
        <path d="M138 222 Q126 348 256 378 Q386 348 374 222"/>
        <path d="M256 292 L242 310 L270 310 Z" fill="#755344" stroke="none"/>
        ${expressions[expressionIndex]}
      </g>
    </svg>
  `;
}

await fs.mkdir(outputDirectory, { recursive: true });

for (const model of workstationModels) {
  const glb = await fs.readFile(path.join(projectRoot, model.input));
  const embeddedTexture = extractFirstEmbeddedImage(glb);
  await sharp(embeddedTexture)
    .blur(5.5)
    .modulate({ brightness: 1.03, saturation: 0.72 })
    .png({
      palette: true,
      colours: 16,
      dither: 0,
      compressionLevel: 9,
    })
    .toFile(path.join(outputDirectory, model.output));
}

await Promise.all(
  Array.from({ length: 4 }, (_, index) =>
    sharp(Buffer.from(keycapFaceSvg(index)))
      .png({ compressionLevel: 9 })
      .toFile(
        path.join(
          projectRoot,
          "public",
          "art",
          `desk-keycap-${index + 1}-top-flat-v1.png`,
        ),
      ),
  ),
);

console.log(outputDirectory);
