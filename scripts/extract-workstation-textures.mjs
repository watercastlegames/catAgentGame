import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(
  projectRoot,
  "tmp",
  "style-analysis",
  "workstation-textures",
);
const modelDirectories = [
  {
    label: "v3-original",
    directory: path.join(
      projectRoot,
      "public",
      "models",
      "camping-style-locked-v3",
    ),
  },
  {
    label: "v4-palette",
    directory: path.join(
      projectRoot,
      "public",
      "models",
      "camping-style-locked-v4",
    ),
  },
];

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

function extractEmbeddedImage(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("Invalid GLB.");
  }
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== JSON_CHUNK_TYPE) {
    throw new Error("Missing JSON chunk.");
  }
  const json = JSON.parse(
    buffer
      .subarray(20, 20 + jsonLength)
      .toString("utf8")
      .replace(/\0+$/, "")
      .trimEnd(),
  );
  const binaryHeaderOffset = 20 + jsonLength;
  if (buffer.readUInt32LE(binaryHeaderOffset + 4) !== BIN_CHUNK_TYPE) {
    throw new Error("Missing binary chunk.");
  }
  const binaryLength = buffer.readUInt32LE(binaryHeaderOffset);
  const binary = buffer.subarray(
    binaryHeaderOffset + 8,
    binaryHeaderOffset + 8 + binaryLength,
  );
  const image = json.images?.[0];
  const view = json.bufferViews?.[image?.bufferView];
  if (!image || !view) {
    throw new Error("Missing embedded image.");
  }
  const start = view.byteOffset ?? 0;
  return binary.subarray(start, start + view.byteLength);
}

await fs.mkdir(outputDirectory, { recursive: true });
const outputs = [];

for (const source of modelDirectories) {
  const files = (await fs.readdir(source.directory))
    .filter((file) => file.endsWith(".glb"))
    .sort();
  for (const file of files) {
    const image = extractEmbeddedImage(
      await fs.readFile(path.join(source.directory, file)),
    );
    const output = path.join(
      outputDirectory,
      `${path.parse(file).name}-${source.label}.png`,
    );
    await sharp(image).png({ compressionLevel: 9 }).toFile(output);
    const metadata = await sharp(image).metadata();
    outputs.push({
      source: path.relative(projectRoot, path.join(source.directory, file)),
      output: path.relative(projectRoot, output),
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    });
  }
}

await fs.writeFile(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(outputs, null, 2)}\n`,
);
console.log(JSON.stringify(outputs, null, 2));
