import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const [, , inputArgument, outputArgument, modeArgument] = process.argv;
const removeMonitor = modeArgument === "remove-monitor";
const inputPath = inputArgument
  ? path.resolve(inputArgument)
  : path.join(
      projectRoot,
      "public",
      "models",
      "camping-style-locked-v4",
      "low-monitor-cat-keycap-workstation-flat-source-v4.glb",
    );
const outputPath = outputArgument
  ? path.resolve(outputArgument)
  : path.join(
      projectRoot,
      "public",
      "models",
      "camping-style-locked-v4-clean",
      "low-monitor-cat-keycap-workstation-noise-clean-v3.glb",
    );
const outputDirectory = path.dirname(outputPath);

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const RENDERED_HEIGHT = 1.12;
const POSITION_WELD_PRECISION = 100000;

const materials = [
  null,
  {
    name: "clean-monitor-screen",
    rgb: [145, 187, 217],
  },
  {
    name: "clean-monitor-frame",
    rgb: [161, 150, 126],
  },
  {
    name: "clean-four-key-keycaps",
    rgb: [225, 191, 144],
  },
  {
    name: "clean-table-top",
    rgb: [174, 140, 100],
  },
  {
    name: "clean-table-apron",
    rgb: [154, 119, 84],
  },
  {
    name: "clean-table-legs",
    rgb: [145, 108, 76],
  },
];

function align4(value) {
  return Math.ceil(value / 4) * 4;
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
  const binaryLength = buffer.readUInt32LE(binaryHeaderOffset);
  if (buffer.readUInt32LE(binaryHeaderOffset + 4) !== BIN_CHUNK_TYPE) {
    throw new Error("Missing GLB binary chunk.");
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
  if (accessor.componentType !== 5126 || view.extensions) {
    throw new Error(`Accessor ${accessorIndex} must be uncompressed float32.`);
  }
  const byteOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return new Float32Array(
    binary.buffer,
    binary.byteOffset + byteOffset,
    accessor.count * itemSize,
  ).slice();
}

function readIndexAccessor(json, binary, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  if (view.extensions) {
    throw new Error(`Index accessor ${accessorIndex} must be uncompressed.`);
  }
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
  throw new Error(`Unsupported index component ${accessor.componentType}.`);
}

function createRenderTransform(positions, node) {
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
      RENDERED_HEIGHT;
    target[1] =
      (local[1] * scale[1] + translation[1] - minimum[1]) *
      unitScale *
      RENDERED_HEIGHT;
    target[2] =
      (local[2] * scale[2] + translation[2] - center[2]) *
      unitScale *
      RENDERED_HEIGHT;
    return target;
  };
}

function isInside(value, minimum, maximum) {
  return value >= minimum && value <= maximum;
}

function classifyMaterial(
  [x, y, z],
  [, normalY, normalZ],
  component,
  cushionComponent,
) {
  if (component === cushionComponent) return 0;

  const monitorRegion =
    isInside(x, -0.46, 0.55) &&
    isInside(y, 0.55, 1.13) &&
    isInside(z, -0.8, -0.3);
  if (monitorRegion) {
    const screenRegion =
      isInside(x, -0.32, 0.42) &&
      isInside(y, 0.66, 1.03) &&
      z >= -0.52 &&
      normalZ >= 0.38;
    return screenRegion ? 1 : 2;
  }

  if (
    isInside(x, -0.44, 0.5) &&
    isInside(y, 0.5, 0.69) &&
    isInside(z, -0.4, 0.06)
  ) {
    return 3;
  }

  const tableFootprint =
    isInside(x, -0.88, 0.88) && isInside(z, -0.8, 0.42);
  if (
    tableFootprint &&
    isInside(y, 0.37, 0.5) &&
    Math.abs(normalY) >= 0.72
  ) {
    return 4;
  }
  if (
    tableFootprint &&
    isInside(y, 0.29, 0.44) &&
    Math.abs(normalY) < 0.72
  ) {
    return 5;
  }
  if (
    isInside(y, 0.02, 0.39) &&
    isInside(z, -0.8, 0.42) &&
    Math.abs(x) >= 0.48
  ) {
    return 6;
  }
  if (
    isInside(y, 0.02, 0.39) &&
    isInside(x, -0.88, 0.88) &&
    z <= -0.38
  ) {
    return 6;
  }
  return 0;
}

function positionKey(positions, vertex) {
  const offset = vertex * 3;
  return `${Math.round(
    positions[offset] * POSITION_WELD_PRECISION,
  )},${Math.round(
    positions[offset + 1] * POSITION_WELD_PRECISION,
  )},${Math.round(positions[offset + 2] * POSITION_WELD_PRECISION)}`;
}

function buildTriangleComponents(positions, indices) {
  const triangleCount = indices.length / 3;
  const weldedVertexTriangles = new Map();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = indices[triangle * 3 + corner];
      const key = positionKey(positions, vertex);
      let list = weldedVertexTriangles.get(key);
      if (!list) {
        list = [];
        weldedVertexTriangles.set(key, list);
      }
      list.push(triangle);
    }
  }

  const componentByTriangle = new Int32Array(triangleCount).fill(-1);
  const componentSizes = [];
  for (let seed = 0; seed < triangleCount; seed += 1) {
    if (componentByTriangle[seed] !== -1) continue;
    const component = componentSizes.length;
    const queue = [seed];
    componentByTriangle[seed] = component;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const triangle = queue[cursor];
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = indices[triangle * 3 + corner];
        const key = positionKey(positions, vertex);
        for (const neighbor of weldedVertexTriangles.get(key) ?? []) {
          if (componentByTriangle[neighbor] === -1) {
            componentByTriangle[neighbor] = component;
            queue.push(neighbor);
          }
        }
      }
    }
    componentSizes.push(queue.length);
  }

  return {
    componentByTriangle,
    componentSizes,
    cushionComponent: componentSizes.indexOf(Math.min(...componentSizes)),
  };
}

function findMinimumMaximum(values, itemSize) {
  const minimum = Array(itemSize).fill(Infinity);
  const maximum = Array(itemSize).fill(-Infinity);
  for (let offset = 0; offset < values.length; offset += itemSize) {
    for (let axis = 0; axis < itemSize; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], values[offset + axis]);
      maximum[axis] = Math.max(maximum[axis], values[offset + axis]);
    }
  }
  return { minimum, maximum };
}

function solidMaterial({ name, rgb }) {
  const srgbToLinear = (channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };
  return {
    name,
    doubleSided: true,
    pbrMetallicRoughness: {
      baseColorFactor: [
        srgbToLinear(rgb[0]),
        srgbToLinear(rgb[1]),
        srgbToLinear(rgb[2]),
        1,
      ],
      metallicFactor: 0,
      roughnessFactor: 1,
    },
    extensions: { KHR_materials_unlit: {} },
  };
}

function encodeGlb({
  sourceJson,
  texture,
  positions,
  normals,
  uvs,
  groupedIndices,
  counts,
}) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let nextByteOffset = 0;

  function appendBuffer(data, target) {
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const byteOffset = align4(nextByteOffset);
    nextByteOffset = byteOffset + buffer.length;
    chunks.push(buffer);
    const view = { buffer: 0, byteOffset, byteLength: buffer.length };
    if (target) view.target = target;
    bufferViews.push(view);
    return bufferViews.length - 1;
  }

  function appendAccessor(values, type, itemSize, componentType, target) {
    const bufferView = appendBuffer(values, target);
    const { minimum, maximum } = findMinimumMaximum(values, itemSize);
    accessors.push({
      bufferView,
      byteOffset: 0,
      componentType,
      count: values.length / itemSize,
      type,
      min: minimum,
      max: maximum,
    });
    return accessors.length - 1;
  }

  const textureView = appendBuffer(texture);
  const attributes = {
    POSITION: appendAccessor(
      positions,
      "VEC3",
      3,
      5126,
      ARRAY_BUFFER,
    ),
    NORMAL: appendAccessor(normals, "VEC3", 3, 5126, ARRAY_BUFFER),
    TEXCOORD_0: appendAccessor(uvs, "VEC2", 2, 5126, ARRAY_BUFFER),
  };
  const primitives = groupedIndices
    .map((indices, material) => ({ indices, material }))
    .filter(({ indices }) => indices.length > 0)
    .map(({ indices, material }) => ({
      attributes,
      indices: appendAccessor(
        indices,
        "SCALAR",
        1,
        5125,
        ELEMENT_ARRAY_BUFFER,
      ),
      material,
      mode: 4,
    }));

  const binary = Buffer.alloc(align4(nextByteOffset));
  chunks.forEach((chunk, index) => {
    chunk.copy(binary, bufferViews[index].byteOffset);
  });
  const json = {
    asset: {
      version: "2.0",
      generator: "Agent Forest semantic noise cleaner v3",
    },
    extensionsUsed: ["EXT_texture_webp", "KHR_materials_unlit"],
    extensionsRequired: ["EXT_texture_webp"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        name: "low-monitor-cat-keycap-workstation-noise-clean-v3",
        mesh: 0,
        translation: sourceJson.nodes[0].translation,
        scale: sourceJson.nodes[0].scale,
      },
    ],
    meshes: [
      {
        name: "low-monitor-workstation-semantic-cleanup",
        primitives,
        extras: {
          originalTexturePreserved: true,
          selectiveMaterialTriangleCounts: counts,
        },
      },
    ],
    materials: [
      sourceJson.materials[0],
      ...materials.slice(1).map(solidMaterial),
    ],
    textures: sourceJson.textures,
    samplers: sourceJson.samplers,
    images: [{ mimeType: "image/webp", bufferView: textureView }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binary.length }],
  };

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

const sourceBuffer = await fs.readFile(inputPath);
const { json, binary } = parseGlb(sourceBuffer);
const primitive = json.meshes[0].primitives[0];
const positions = readFloatAccessor(
  json,
  binary,
  primitive.attributes.POSITION,
  3,
);
const normals = readFloatAccessor(
  json,
  binary,
  primitive.attributes.NORMAL,
  3,
);
const uvs = readFloatAccessor(
  json,
  binary,
  primitive.attributes.TEXCOORD_0,
  2,
);
const indices = readIndexAccessor(json, binary, primitive.indices);
const imageView = json.bufferViews[json.images[0].bufferView];
const imageStart = imageView.byteOffset ?? 0;
const texture = binary.subarray(
  imageStart,
  imageStart + imageView.byteLength,
);
const toRendered = createRenderTransform(positions, json.nodes[0]);
const grouped = Array.from(
  { length: removeMonitor ? 1 : materials.length },
  () => [],
);
const { componentByTriangle, componentSizes, cushionComponent } =
  buildTriangleComponents(positions, indices);
let removedMonitorTriangles = 0;

for (let offset = 0; offset < indices.length; offset += 3) {
  const triangle = offset / 3;
  const centroid = [0, 0, 0];
  const corners = [];
  for (let corner = 0; corner < 3; corner += 1) {
    const vertex = indices[offset + corner] * 3;
    const rendered = toRendered([
      positions[vertex],
      positions[vertex + 1],
      positions[vertex + 2],
    ]);
    corners.push([...rendered]);
    centroid[0] += rendered[0] / 3;
    centroid[1] += rendered[1] / 3;
    centroid[2] += rendered[2] / 3;
  }
  const ab = corners[1].map((value, axis) => value - corners[0][axis]);
  const ac = corners[2].map((value, axis) => value - corners[0][axis]);
  const rawNormal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const normalLength = Math.hypot(...rawNormal) || 1;
  const normal = rawNormal.map((value) => value / normalLength);
  const isMonitorTriangle =
    isInside(centroid[0], -0.46, 0.55) &&
    isInside(centroid[1], 0.55, 1.13) &&
    isInside(centroid[2], -0.8, -0.42);
  if (removeMonitor && isMonitorTriangle) {
    removedMonitorTriangles += 1;
    continue;
  }
  const material = removeMonitor
    ? 0
    : classifyMaterial(
        centroid,
        normal,
        componentByTriangle[triangle],
        cushionComponent,
      );
  grouped[material].push(
    indices[offset],
    indices[offset + 1],
    indices[offset + 2],
  );
}

const groupedIndices = grouped.map((values) => Uint32Array.from(values));
const counts = removeMonitor
  ? { "original-texture": groupedIndices[0].length / 3 }
  : Object.fromEntries(
      materials.map((material, index) => [
        material?.name ?? "original-texture",
        groupedIndices[index].length / 3,
      ]),
    );
await fs.mkdir(outputDirectory, { recursive: true });
await fs.writeFile(
  outputPath,
  encodeGlb({
    sourceJson: json,
    texture,
    positions,
    normals,
    uvs,
    groupedIndices,
    counts,
  }),
);
const manifestPath = path.join(
  outputDirectory,
  removeMonitor
    ? "monitor-removal-manifest-v1.json"
    : "selective-cleanup-manifest-v3.json",
);
await fs.writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      version: removeMonitor ? 1 : 3,
      mode: removeMonitor ? "remove-monitor" : "semantic-cleanup",
      input: path.relative(projectRoot, inputPath),
      output: path.relative(projectRoot, outputPath),
      originalTexturePreserved: true,
      componentSizes,
      cushionComponent,
      changedObjectCount: 1,
      removedMonitorTriangles,
      triangleCounts: counts,
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify({ outputPath, counts }, null, 2));
