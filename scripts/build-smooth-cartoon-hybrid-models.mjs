import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(
  projectRoot,
  "public",
  "models",
  "camping-style-hybrid-v1",
);
const previewDirectory = path.join(
  projectRoot,
  "tmp",
  "style-analysis",
  "smooth-cartoon-hybrid-v1",
);

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

const illustrationPalette = [
  [112, 88, 70],
  [151, 122, 91],
  [194, 157, 113],
  [225, 191, 144],
  [241, 232, 211],
  [173, 194, 161],
  [161, 204, 185],
  [139, 181, 216],
  [188, 174, 146],
];

const models = [
  {
    id: "tent-workstation",
    input: path.join(
      projectRoot,
      "public",
      "models",
      "camping-style-locked-v4",
      "tent-workstation-flat-source-v4.glb",
    ),
    textureInput: path.join(
      projectRoot,
      "public",
      "models",
      "camping-style-locked-v3",
      "tent-workstation-meshy6-web-v3.glb",
    ),
    output: path.join(
      outputDirectory,
      "tent-workstation-smooth-cartoon-v1.glb",
    ),
    preview: path.join(
      previewDirectory,
      "tent-workstation-smooth-cartoon-v1.png",
    ),
    paletteStrength: 0.7,
  },
  {
    id: "round-laptop-workstation",
    input: path.join(
      projectRoot,
      "public",
      "models",
      "camping-style-locked-v4",
      "round-laptop-workstation-flat-source-v4.glb",
    ),
    textureInput: path.join(
      projectRoot,
      "public",
      "models",
      "camping-style-locked-v3",
      "round-laptop-workstation-meshy6-web-v3.glb",
    ),
    output: path.join(
      outputDirectory,
      "round-laptop-workstation-smooth-cartoon-v1.glb",
    ),
    preview: path.join(
      previewDirectory,
      "round-laptop-workstation-smooth-cartoon-v1.png",
    ),
    paletteStrength: 0.7,
  },
  {
    id: "folding-laptop-radio-workstation",
    input: path.join(
      projectRoot,
      "public",
      "models",
      "camping-style-locked-v4",
      "folding-laptop-radio-workstation-flat-source-v4.glb",
    ),
    textureInput: path.join(
      projectRoot,
      "public",
      "models",
      "camping-style-locked-v3",
      "folding-laptop-radio-workstation-meshy6-web-v3.glb",
    ),
    output: path.join(
      outputDirectory,
      "folding-laptop-radio-workstation-smooth-cartoon-v1.glb",
    ),
    preview: path.join(
      previewDirectory,
      "folding-laptop-radio-workstation-smooth-cartoon-v1.png",
    ),
    paletteStrength: 0.7,
  },
  {
    id: "low-monitor-workstation",
    input: path.join(
      projectRoot,
      "public",
      "models",
      "camping-style-locked-v3",
      "low-monitor-cat-keycap-workstation-meshy6-web-v3.glb",
    ),
    output: path.join(
      outputDirectory,
      "low-monitor-cat-keycap-workstation-smooth-cartoon-v1.glb",
    ),
    preview: path.join(
      previewDirectory,
      "low-monitor-cat-keycap-workstation-smooth-cartoon-v1.png",
    ),
    paletteStrength: 0.7,
  },
  {
    id: "camping-supplies",
    input: path.join(
      projectRoot,
      "public",
      "models",
      "camping-style-locked-v1",
      "camping-supplies-cluster-meshy6-web-v1.glb",
    ),
    output: path.join(
      outputDirectory,
      "camping-supplies-cluster-smooth-cartoon-v1.glb",
    ),
    preview: path.join(
      previewDirectory,
      "camping-supplies-cluster-smooth-cartoon-v1.png",
    ),
    paletteStrength: 0.72,
  },
];

function align4(value) {
  return Math.ceil(value / 4) * 4;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseGlb(buffer) {
  if (
    buffer.readUInt32LE(0) !== GLB_MAGIC ||
    buffer.readUInt32LE(4) !== GLB_VERSION
  ) {
    throw new Error("Only GLB v2 files are supported.");
  }
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== JSON_CHUNK_TYPE) {
    throw new Error("Missing GLB JSON chunk.");
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
    throw new Error("Missing GLB binary chunk.");
  }
  const binaryLength = buffer.readUInt32LE(binaryHeaderOffset);
  return {
    json,
    binary: Buffer.from(
      buffer.subarray(
        binaryHeaderOffset + 8,
        binaryHeaderOffset + 8 + binaryLength,
      ),
    ),
  };
}

function encodeGlb(json, binary) {
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.alloc(align4(jsonBytes.length), 0x20);
  jsonBytes.copy(paddedJson);
  const paddedBinary = Buffer.alloc(align4(binary.length));
  binary.copy(paddedBinary);
  const totalLength =
    12 + 8 + paddedJson.length + 8 + paddedBinary.length;
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(GLB_VERSION, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(paddedJson.length, 12);
  output.writeUInt32LE(JSON_CHUNK_TYPE, 16);
  paddedJson.copy(output, 20);
  const binaryHeaderOffset = 20 + paddedJson.length;
  output.writeUInt32LE(paddedBinary.length, binaryHeaderOffset);
  output.writeUInt32LE(BIN_CHUNK_TYPE, binaryHeaderOffset + 4);
  paddedBinary.copy(output, binaryHeaderOffset + 8);
  return output;
}

function extractEmbeddedTexture(json, binary) {
  const image = json.images?.[0];
  const view = json.bufferViews?.[image?.bufferView];
  if (!image || !view) {
    throw new Error("The source GLB needs one embedded texture.");
  }
  const start = view.byteOffset ?? 0;
  return {
    bytes: binary.subarray(start, start + view.byteLength),
    image,
    view,
  };
}

function softPaletteColor(red, green, blue) {
  if (blue - red > 28 && blue - green > 15 && green - red > 12) {
    const sourceLuminance =
      red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const shade = (sourceLuminance - 181) * 0.34;
    return [139 + shade, 181 + shade, 216 + shade];
  }
  const sigma = 58;
  const denominator = 2 * sigma * sigma;
  let weightSum = 0;
  const output = [0, 0, 0];
  for (const color of illustrationPalette) {
    const distance =
      (red - color[0]) ** 2 +
      (green - color[1]) ** 2 +
      (blue - color[2]) ** 2;
    const weight = Math.exp(-distance / denominator);
    weightSum += weight;
    output[0] += color[0] * weight;
    output[1] += color[1] * weight;
    output[2] += color[2] * weight;
  }
  return output.map((value) => value / Math.max(weightSum, 0.000001));
}

async function createSmoothCartoonTexture(source, paletteStrength) {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .median(3)
    .blur(0.65)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(data.length);
  const originalStrength = 1 - paletteStrength;

  for (let offset = 0; offset < data.length; offset += 4) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const softened = [
      luminance + (red - luminance) * 0.62,
      luminance + (green - luminance) * 0.62,
      luminance + (blue - luminance) * 0.62,
    ];
    const palette = softPaletteColor(...softened);
    const paletteLuminance =
      palette[0] * 0.2126 +
      palette[1] * 0.7152 +
      palette[2] * 0.0722;
    const sourceLuminance =
      softened[0] * 0.2126 +
      softened[1] * 0.7152 +
      softened[2] * 0.0722;
    const preservedShade = (sourceLuminance - paletteLuminance) * 0.38;

    output[offset] = clampByte(
      palette[0] * paletteStrength +
        softened[0] * originalStrength +
        preservedShade,
    );
    output[offset + 1] = clampByte(
      palette[1] * paletteStrength +
        softened[1] * originalStrength +
        preservedShade,
    );
    output[offset + 2] = clampByte(
      palette[2] * paletteStrength +
        softened[2] * originalStrength +
        preservedShade,
    );
    output[offset + 3] = data[offset + 3];
  }

  const png = await sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const webp = await sharp(png)
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  return { png, webp, width: info.width, height: info.height };
}

function replaceEmbeddedTexture(json, binary, replacement) {
  const image = json.images[0];
  const imageView = json.bufferViews[image.bufferView];
  const imageStart = imageView.byteOffset ?? 0;
  const oldSuffixStart = align4(imageStart + imageView.byteLength);
  const newSuffixStart = align4(imageStart + replacement.length);
  const offsetDelta = newSuffixStart - oldSuffixStart;
  const nextBinary = Buffer.alloc(binary.length + offsetDelta);
  binary.subarray(0, imageStart).copy(nextBinary, 0);
  replacement.copy(nextBinary, imageStart);
  binary.subarray(oldSuffixStart).copy(nextBinary, newSuffixStart);

  imageView.byteLength = replacement.length;
  image.mimeType = "image/webp";

  for (const [index, view] of json.bufferViews.entries()) {
    if (index === image.bufferView) continue;
    const meshopt = view.extensions?.EXT_meshopt_compression;
    if (meshopt?.byteOffset >= oldSuffixStart) {
      meshopt.byteOffset += offsetDelta;
    } else if (
      !meshopt &&
      (view.buffer ?? 0) === 0 &&
      (view.byteOffset ?? 0) >= oldSuffixStart
    ) {
      view.byteOffset = (view.byteOffset ?? 0) + offsetDelta;
    }
  }

  if (json.buffers?.[0]) {
    json.buffers[0].byteLength = nextBinary.length;
  }
  for (const material of json.materials ?? []) {
    material.doubleSided = true;
    material.pbrMetallicRoughness ??= {};
    material.pbrMetallicRoughness.metallicFactor = 0;
    material.pbrMetallicRoughness.roughnessFactor = 1;
    material.extensions = {
      ...material.extensions,
      KHR_materials_unlit: {},
    };
  }
  json.extensionsUsed = Array.from(
    new Set([...(json.extensionsUsed ?? []), "KHR_materials_unlit"]),
  );
  json.asset.generator = [
    json.asset.generator,
    "Agent Forest smooth cartoon palette v1",
  ]
    .filter(Boolean)
    .join("; ");
  return nextBinary;
}

await fs.mkdir(outputDirectory, { recursive: true });
await fs.mkdir(previewDirectory, { recursive: true });
const manifest = {
  version: 1,
  mode: "smooth-full-color-cartoon-palette",
  palette: illustrationPalette,
  models: [],
};

for (const model of models) {
  const sourceBuffer = await fs.readFile(model.input);
  const { json, binary } = parseGlb(sourceBuffer);
  const textureSourceBuffer =
    model.textureInput === undefined
      ? sourceBuffer
      : await fs.readFile(model.textureInput);
  const textureSource =
    textureSourceBuffer === sourceBuffer
      ? { json, binary }
      : parseGlb(textureSourceBuffer);
  const sourceTexture = extractEmbeddedTexture(
    textureSource.json,
    textureSource.binary,
  );
  const texture = await createSmoothCartoonTexture(
    sourceTexture.bytes,
    model.paletteStrength,
  );
  const nextBinary = replaceEmbeddedTexture(json, binary, texture.webp);
  const output = encodeGlb(json, nextBinary);
  await fs.writeFile(model.output, output);
  await fs.writeFile(model.preview, texture.png);
  manifest.models.push({
    id: model.id,
    input: path.relative(projectRoot, model.input),
    textureInput: path.relative(
      projectRoot,
      model.textureInput ?? model.input,
    ),
    output: path.relative(projectRoot, model.output),
    preview: path.relative(projectRoot, model.preview),
    paletteStrength: model.paletteStrength,
    textureSize: [texture.width, texture.height],
    sourceBytes: sourceBuffer.length,
    outputBytes: output.length,
  });
}

await fs.writeFile(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(JSON.stringify(manifest, null, 2));
