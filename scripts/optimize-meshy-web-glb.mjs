import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

const [, , inputArgument, outputArgument, maxDimensionArgument = "2048"] =
  process.argv;

if (!inputArgument || !outputArgument) {
  throw new Error(
    "Usage: node scripts/optimize-meshy-web-glb.mjs <input.glb> <output.glb> [max-texture-dimension]",
  );
}

const inputPath = path.resolve(inputArgument);
const outputPath = path.resolve(outputArgument);
const maxTextureDimension = Number(maxDimensionArgument);
if (
  !Number.isInteger(maxTextureDimension) ||
  maxTextureDimension < 256 ||
  maxTextureDimension > 8192
) {
  throw new Error("Texture dimension must be an integer from 256 to 8192.");
}

function align4(value) {
  return Math.ceil(value / 4) * 4;
}

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("Invalid GLB magic.");
  }
  if (buffer.readUInt32LE(4) !== GLB_VERSION) {
    throw new Error("Only GLB v2 files are supported.");
  }

  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== JSON_CHUNK_TYPE) {
    throw new Error("The first GLB chunk must be JSON.");
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
    throw new Error("The second GLB chunk must be binary.");
  }
  const binaryLength = buffer.readUInt32LE(binaryHeaderOffset);
  const binary = Buffer.from(
    buffer.subarray(
      binaryHeaderOffset + 8,
      binaryHeaderOffset + 8 + binaryLength,
    ),
  );
  return { json, binary };
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

const sourceBuffer = await fs.readFile(inputPath);
const { json, binary } = parseGlb(sourceBuffer);
if (!Array.isArray(json.bufferViews) || !Array.isArray(json.images)) {
  throw new Error("The GLB must contain embedded image buffer views.");
}
if (json.buffers?.length !== 1) {
  throw new Error("Only single-buffer GLB files are supported.");
}

const imageByBufferView = new Map();
for (const [imageIndex, image] of json.images.entries()) {
  if (image.bufferView === undefined) {
    throw new Error(`Image ${imageIndex} is not embedded in the GLB.`);
  }
  imageByBufferView.set(image.bufferView, { image, imageIndex });
}

const replacementByBufferView = new Map();
const textureSummaries = [];
for (const [bufferViewIndex, { image, imageIndex }] of imageByBufferView) {
  const view = json.bufferViews[bufferViewIndex];
  const start = view.byteOffset ?? 0;
  const sourceImage = binary.subarray(start, start + view.byteLength);
  const metadata = await sharp(sourceImage).metadata();
  const optimizedImage = await sharp(sourceImage)
    .resize({
      width: maxTextureDimension,
      height: maxTextureDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 92,
      chromaSubsampling: "4:4:4",
      mozjpeg: true,
    })
    .toBuffer();

  replacementByBufferView.set(bufferViewIndex, optimizedImage);
  image.mimeType = "image/jpeg";
  textureSummaries.push({
    imageIndex,
    sourceDimensions: [metadata.width, metadata.height],
    sourceBytes: sourceImage.length,
    optimizedBytes: optimizedImage.length,
  });
}

const chunks = [];
let nextOffset = 0;
for (const [bufferViewIndex, view] of json.bufferViews.entries()) {
  if ((view.buffer ?? 0) !== 0) {
    throw new Error(`Buffer view ${bufferViewIndex} does not use buffer 0.`);
  }
  const sourceStart = view.byteOffset ?? 0;
  const chunk =
    replacementByBufferView.get(bufferViewIndex) ??
    binary.subarray(sourceStart, sourceStart + view.byteLength);
  const byteOffset = align4(nextOffset);
  chunks.push({ chunk, byteOffset });
  view.byteOffset = byteOffset;
  view.byteLength = chunk.length;
  nextOffset = byteOffset + chunk.length;
}

const rebuiltBinary = Buffer.alloc(align4(nextOffset));
for (const { chunk, byteOffset } of chunks) {
  chunk.copy(rebuiltBinary, byteOffset);
}
json.buffers[0].byteLength = rebuiltBinary.length;
json.asset.generator = [
  json.asset.generator,
  `Agent Forest Meshy web optimizer (${maxTextureDimension}px JPEG)`,
]
  .filter(Boolean)
  .join("; ");

await fs.mkdir(path.dirname(outputPath), { recursive: true });
const optimizedGlb = encodeGlb(json, rebuiltBinary);
await fs.writeFile(outputPath, optimizedGlb);

console.log(
  JSON.stringify(
    {
      inputPath,
      outputPath,
      sourceBytes: sourceBuffer.length,
      optimizedBytes: optimizedGlb.length,
      textureSummaries,
    },
    null,
    2,
  ),
);
