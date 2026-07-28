import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const inputDirectory = path.join(
  projectRoot,
  "public",
  "models",
  "camping-style-locked-v4",
);
const outputDirectory = path.join(
  projectRoot,
  "public",
  "models",
  "camping-style-locked-v4-clean",
);

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const ELEMENT_ARRAY_BUFFER = 34963;

const models = [
  {
    id: "tent",
    input: "tent-workstation-flat-source-v4.glb",
    output: "tent-workstation-noise-clean-v1.glb",
    renderedHeight: 1.82,
    regions: [
      {
        name: "clean-tent-table",
        rgb: [194, 163, 127],
        contains: ([x, y, z]) =>
          inside(x, -0.42, 0.42) &&
          inside(y, 0.48, 0.76) &&
          inside(z, -0.36, 0.46),
      },
      {
        name: "clean-tent-cushion",
        rgb: [210, 178, 138],
        contains: ([x, y, z]) =>
          inside(x, -0.54, 0.54) &&
          inside(y, 0.08, 0.58) &&
          inside(z, 0.04, 0.72),
      },
    ],
  },
  {
    id: "round",
    input: "round-laptop-workstation-flat-source-v4.glb",
    output: "round-laptop-workstation-noise-clean-v1.glb",
    renderedHeight: 1.04,
    regions: [
      {
        name: "clean-round-table",
        rgb: [185, 148, 109],
        contains: ([x, y, z]) =>
          inside(x, -0.72, 0.72) &&
          inside(y, 0.22, 0.4) &&
          inside(z, -0.58, 0.58),
      },
    ],
  },
  {
    id: "folding",
    input: "folding-laptop-radio-workstation-flat-source-v4.glb",
    output: "folding-laptop-radio-workstation-noise-clean-v1.glb",
    renderedHeight: 1.08,
    regions: [
      {
        name: "clean-radio-front",
        rgb: [201, 174, 137],
        contains: ([x, y, z]) =>
          inside(x, 0.34, 0.94) &&
          inside(y, 0.27, 1) &&
          inside(z, -0.82, -0.2),
      },
      {
        name: "clean-radio-body",
        rgb: [174, 140, 103],
        contains: ([x, y, z]) =>
          inside(x, 0.34, 0.98) &&
          inside(y, 0.27, 1) &&
          inside(z, -0.82, 0.8),
      },
      {
        name: "clean-folding-table",
        rgb: [194, 163, 127],
        contains: ([x, y, z]) =>
          inside(x, -0.84, 0.84) &&
          inside(y, 0.42, 0.61) &&
          inside(z, -0.62, 0.62),
      },
      {
        name: "clean-folding-stool",
        rgb: [210, 178, 138],
        contains: ([x, y, z]) =>
          inside(x, -0.34, 0.34) &&
          inside(y, 0.08, 0.33) &&
          inside(z, 0.2, 0.76),
      },
    ],
  },
];

function align4(value) {
  return Math.ceil(value / 4) * 4;
}

function inside(value, minimum, maximum) {
  return value >= minimum && value <= maximum;
}

function parseGlb(buffer) {
  if (
    buffer.readUInt32LE(0) !== GLB_MAGIC ||
    buffer.readUInt32LE(4) !== GLB_VERSION
  ) {
    throw new Error("Only GLB v2 is supported.");
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
  const binaryLength = buffer.readUInt32LE(binaryHeaderOffset);
  if (buffer.readUInt32LE(binaryHeaderOffset + 4) !== BIN_CHUNK_TYPE) {
    throw new Error("Missing binary chunk.");
  }
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

function readFloatAccessor(json, binary, accessorIndex, itemSize) {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  const byteOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return new Float32Array(
    binary.buffer,
    binary.byteOffset + byteOffset,
    accessor.count * itemSize,
  ).slice();
}

function readIndices(json, binary, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  const byteOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  if (accessor.componentType === 5125) {
    return new Uint32Array(
      binary.buffer,
      binary.byteOffset + byteOffset,
      accessor.count,
    ).slice();
  }
  if (accessor.componentType === 5123) {
    return Uint32Array.from(
      new Uint16Array(
        binary.buffer,
        binary.byteOffset + byteOffset,
        accessor.count,
      ),
    );
  }
  throw new Error(`Unsupported index type ${accessor.componentType}.`);
}

function createRenderTransform(positions, node, renderedHeight) {
  const translation = node.translation ?? [0, 0, 0];
  const scale = node.scale ?? [1, 1, 1];
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value =
        positions[offset + axis] * scale[axis] + translation[axis];
      minimum[axis] = Math.min(minimum[axis], value);
      maximum[axis] = Math.max(maximum[axis], value);
    }
  }
  const center = [
    (minimum[0] + maximum[0]) / 2,
    (minimum[1] + maximum[1]) / 2,
    (minimum[2] + maximum[2]) / 2,
  ];
  const unitScale = 1 / Math.max(maximum[1] - minimum[1], 0.0001);
  return (local, target = [0, 0, 0]) => {
    target[0] =
      (local[0] * scale[0] + translation[0] - center[0]) *
      unitScale *
      renderedHeight;
    target[1] =
      (local[1] * scale[1] + translation[1] - minimum[1]) *
      unitScale *
      renderedHeight;
    target[2] =
      (local[2] * scale[2] + translation[2] - center[2]) *
      unitScale *
      renderedHeight;
    return target;
  };
}

function srgbToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function solidMaterial(region) {
  return {
    name: region.name,
    doubleSided: true,
    pbrMetallicRoughness: {
      baseColorFactor: [
        srgbToLinear(region.rgb[0]),
        srgbToLinear(region.rgb[1]),
        srgbToLinear(region.rgb[2]),
        1,
      ],
      metallicFactor: 0,
      roughnessFactor: 1,
    },
    extensions: { KHR_materials_unlit: {} },
  };
}

function classifyTriangles({
  positions,
  indices,
  node,
  renderedHeight,
  regions,
}) {
  const groups = Array.from(
    { length: regions.length + 1 },
    () => [],
  );
  const toRendered = createRenderTransform(
    positions,
    node,
    renderedHeight,
  );
  const rendered = [0, 0, 0];
  for (let offset = 0; offset < indices.length; offset += 3) {
    const centroid = [0, 0, 0];
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = indices[offset + corner] * 3;
      toRendered(
        [
          positions[vertex],
          positions[vertex + 1],
          positions[vertex + 2],
        ],
        rendered,
      );
      centroid[0] += rendered[0] / 3;
      centroid[1] += rendered[1] / 3;
      centroid[2] += rendered[2] / 3;
    }
    const region = regions.findIndex((candidate) =>
      candidate.contains(centroid),
    );
    groups[region + 1].push(
      indices[offset],
      indices[offset + 1],
      indices[offset + 2],
    );
  }
  return groups.map((group) => Uint32Array.from(group));
}

function appendIndexGroups({
  json,
  binary,
  primitive,
  groups,
  regions,
}) {
  const nextJson = structuredClone(json);
  const originalMaterial = primitive.material ?? 0;
  const materialStart = nextJson.materials.length;
  nextJson.materials.push(...regions.map(solidMaterial));
  nextJson.extensionsUsed = Array.from(
    new Set([...(nextJson.extensionsUsed ?? []), "KHR_materials_unlit"]),
  );

  const chunks = [];
  let nextOffset = binary.length;
  const groupPrimitives = [];
  for (let index = 0; index < groups.length; index += 1) {
    const indices = groups[index];
    if (indices.length === 0) continue;
    const byteOffset = align4(nextOffset);
    const bytes = Buffer.from(
      indices.buffer,
      indices.byteOffset,
      indices.byteLength,
    );
    chunks.push({ byteOffset, bytes });
    nextOffset = byteOffset + bytes.length;
    const bufferView = nextJson.bufferViews.length;
    nextJson.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: bytes.length,
      target: ELEMENT_ARRAY_BUFFER,
    });
    const accessor = nextJson.accessors.length;
    let minimumIndex = Infinity;
    let maximumIndex = -Infinity;
    for (const value of indices) {
      minimumIndex = Math.min(minimumIndex, value);
      maximumIndex = Math.max(maximumIndex, value);
    }
    nextJson.accessors.push({
      bufferView,
      byteOffset: 0,
      componentType: 5125,
      count: indices.length,
      type: "SCALAR",
      min: [minimumIndex],
      max: [maximumIndex],
    });
    groupPrimitives.push({
      ...primitive,
      indices: accessor,
      material:
        index === 0 ? originalMaterial : materialStart + index - 1,
    });
  }

  nextJson.meshes[0].primitives = [
    ...groupPrimitives,
    ...nextJson.meshes[0].primitives.slice(1),
  ];
  nextJson.asset = {
    ...nextJson.asset,
    generator: "Agent Forest selective workstation cleaner",
  };
  nextJson.buffers[0].byteLength = align4(nextOffset);
  const nextBinary = Buffer.alloc(align4(nextOffset));
  binary.copy(nextBinary);
  for (const chunk of chunks) {
    chunk.bytes.copy(nextBinary, chunk.byteOffset);
  }
  return { json: nextJson, binary: nextBinary };
}

function encodeGlb(json, binary) {
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.alloc(align4(jsonBytes.length), 0x20);
  jsonBytes.copy(paddedJson);
  const totalLength = 12 + 8 + paddedJson.length + 8 + binary.length;
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(GLB_VERSION, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(paddedJson.length, 12);
  output.writeUInt32LE(JSON_CHUNK_TYPE, 16);
  paddedJson.copy(output, 20);
  const binaryHeaderOffset = 20 + paddedJson.length;
  output.writeUInt32LE(binary.length, binaryHeaderOffset);
  output.writeUInt32LE(BIN_CHUNK_TYPE, binaryHeaderOffset + 4);
  binary.copy(output, binaryHeaderOffset + 8);
  return output;
}

await fs.mkdir(outputDirectory, { recursive: true });
const manifest = { version: 1, models: [] };

for (const model of models) {
  const inputPath = path.join(inputDirectory, model.input);
  const outputPath = path.join(outputDirectory, model.output);
  const source = parseGlb(await fs.readFile(inputPath));
  const primitive = source.json.meshes[0].primitives[0];
  const positions = readFloatAccessor(
    source.json,
    source.binary,
    primitive.attributes.POSITION,
    3,
  );
  const indices = readIndices(
    source.json,
    source.binary,
    primitive.indices,
  );
  const groups = classifyTriangles({
    positions,
    indices,
    node: source.json.nodes[0],
    renderedHeight: model.renderedHeight,
    regions: model.regions,
  });
  const rebuilt = appendIndexGroups({
    json: source.json,
    binary: source.binary,
    primitive,
    groups,
    regions: model.regions,
  });
  await fs.writeFile(outputPath, encodeGlb(rebuilt.json, rebuilt.binary));
  const triangleCounts = Object.fromEntries([
    ["original-texture", groups[0].length / 3],
    ...model.regions.map((region, index) => [
      region.name,
      groups[index + 1].length / 3,
    ]),
  ]);
  manifest.models.push({
    id: model.id,
    input: path.relative(projectRoot, inputPath),
    output: path.relative(projectRoot, outputPath),
    triangleCounts,
  });
  console.log(`${model.id}: ${JSON.stringify(triangleCounts)}`);
}

await fs.writeFile(
  path.join(outputDirectory, "remaining-cleanup-manifest-v1.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
