import fs from "node:fs/promises";
import path from "node:path";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourceDirectory = path.join(
  projectRoot,
  "public",
  "models",
  "camping-style-locked-v3",
);
const outputDirectory = path.join(
  projectRoot,
  "public",
  "models",
  "camping-style-locked-v4",
);
const previewDirectory = path.join(
  projectRoot,
  "tmp",
  "style-analysis",
  "workstation-source-v4",
);

const models = [
  {
    input: "tent-workstation-meshy6-web-v3.glb",
    output: "tent-workstation-flat-source-v4.glb",
    preview: "tent-workstation-flat-source-v4.png",
    renderedHeight: 1.82,
    keyboard: {
      position: [-0.03, 0.825, -0.02],
      width: 0.58,
      depth: 0.22,
    },
  },
  {
    input: "round-laptop-workstation-meshy6-web-v3.glb",
    output: "round-laptop-workstation-flat-source-v4.glb",
    preview: "round-laptop-workstation-flat-source-v4.png",
    renderedHeight: 1.04,
    keyboard: {
      position: [-0.09, 0.44, -0.28],
      width: 0.56,
      depth: 0.3,
    },
  },
  {
    input: "folding-laptop-radio-workstation-meshy6-web-v3.glb",
    output: "folding-laptop-radio-workstation-flat-source-v4.glb",
    preview: "folding-laptop-radio-workstation-flat-source-v4.png",
    renderedHeight: 1.08,
    keyboard: {
      position: [-0.48, 0.67, -0.02],
      width: 0.56,
      depth: 0.29,
    },
  },
  {
    input: "low-monitor-cat-keycap-workstation-meshy6-web-v3.glb",
    output: "low-monitor-cat-keycap-workstation-flat-source-v4.glb",
    preview: "low-monitor-cat-keycap-workstation-flat-source-v4.png",
    renderedHeight: 1.12,
  },
];

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

const componentDefinitions = {
  5120: {
    ArrayType: Int8Array,
    bytes: 1,
    scale: 127,
    read: (view, offset) => view.getInt8(offset),
  },
  5121: {
    ArrayType: Uint8Array,
    bytes: 1,
    scale: 255,
    read: (view, offset) => view.getUint8(offset),
  },
  5122: {
    ArrayType: Int16Array,
    bytes: 2,
    scale: 32767,
    read: (view, offset) => view.getInt16(offset, true),
  },
  5123: {
    ArrayType: Uint16Array,
    bytes: 2,
    scale: 65535,
    read: (view, offset) => view.getUint16(offset, true),
  },
  5125: {
    ArrayType: Uint32Array,
    bytes: 4,
    scale: 4294967295,
    read: (view, offset) => view.getUint32(offset, true),
  },
  5126: {
    ArrayType: Float32Array,
    bytes: 4,
    scale: 1,
    read: (view, offset) => view.getFloat32(offset, true),
  },
};
const typeSizes = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};
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

function align4(value) {
  return Math.ceil(value / 4) * 4;
}

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("Invalid GLB magic.");
  }
  if (buffer.readUInt32LE(4) !== GLB_VERSION) {
    throw new Error("Only GLB v2 assets are supported.");
  }

  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== JSON_CHUNK_TYPE) {
    throw new Error("The first GLB chunk is not JSON.");
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
    throw new Error("The second GLB chunk is not binary.");
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

function decodeAccessor(json, binary, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  const definition = componentDefinitions[accessor.componentType];
  const itemSize = typeSizes[accessor.type];
  if (!definition || !itemSize) {
    throw new Error(`Unsupported accessor ${accessorIndex}.`);
  }

  let viewBytes;
  const meshopt = view.extensions?.EXT_meshopt_compression;
  if (meshopt) {
    viewBytes = new Uint8Array(view.byteLength);
    MeshoptDecoder.decodeGltfBuffer(
      viewBytes,
      meshopt.count,
      meshopt.byteStride,
      binary.subarray(
        meshopt.byteOffset,
        meshopt.byteOffset + meshopt.byteLength,
      ),
      meshopt.mode,
      meshopt.filter,
    );
  } else {
    const start = view.byteOffset ?? 0;
    viewBytes = new Uint8Array(
      binary.subarray(start, start + view.byteLength),
    );
  }

  const values = new definition.ArrayType(accessor.count * itemSize);
  const dataView = new DataView(
    viewBytes.buffer,
    viewBytes.byteOffset,
    viewBytes.byteLength,
  );
  const byteStride = view.byteStride ?? definition.bytes * itemSize;
  const accessorOffset = accessor.byteOffset ?? 0;
  for (let item = 0; item < accessor.count; item += 1) {
    for (let component = 0; component < itemSize; component += 1) {
      values[item * itemSize + component] = definition.read(
        dataView,
        accessorOffset + item * byteStride + component * definition.bytes,
      );
    }
  }

  return {
    accessor,
    itemSize,
    values,
    normalize(value) {
      if (!accessor.normalized || accessor.componentType === 5126) {
        return value;
      }
      if (definition.ArrayType === Int8Array || definition.ArrayType === Int16Array) {
        return Math.max(-1, value / definition.scale);
      }
      return value / definition.scale;
    },
  };
}

function readSourceGeometry(json, binary) {
  const primitive = json.meshes[0].primitives[0];
  const positionsSource = decodeAccessor(
    json,
    binary,
    primitive.attributes.POSITION,
  );
  const normalsSource = decodeAccessor(
    json,
    binary,
    primitive.attributes.NORMAL,
  );
  const uvsSource = decodeAccessor(
    json,
    binary,
    primitive.attributes.TEXCOORD_0,
  );
  const indicesSource = decodeAccessor(json, binary, primitive.indices);

  return {
    positions: Float32Array.from(positionsSource.values, (value) =>
      positionsSource.normalize(value),
    ),
    normals: Float32Array.from(normalsSource.values, (value) =>
      normalsSource.normalize(value),
    ),
    uvs: Float32Array.from(uvsSource.values, (value) =>
      uvsSource.normalize(value),
    ),
    indices: Uint32Array.from(indicesSource.values),
  };
}

function computeRenderTransform(positions, sourceNode, renderedHeight) {
  const translation = sourceNode.translation ?? [0, 0, 0];
  const scale = sourceNode.scale ?? [1, 1, 1];
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];

  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value =
        positions[index + axis] * scale[axis] + translation[axis];
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

  return {
    toRendered(local, target = [0, 0, 0]) {
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
    },
    toLocal(rendered, target = [0, 0, 0]) {
      target[0] =
        (rendered[0] / (unitScale * renderedHeight) +
          center[0] -
          translation[0]) /
        scale[0];
      target[1] =
        (rendered[1] / (unitScale * renderedHeight) +
          minimum[1] -
          translation[1]) /
        scale[1];
      target[2] =
        (rendered[2] / (unitScale * renderedHeight) +
          center[2] -
          translation[2]) /
        scale[2];
      return target;
    },
    renderedLengthToLocal(length, axis) {
      return length / (unitScale * renderedHeight * scale[axis]);
    },
  };
}

function removeKeyboardGeometry(geometry, transform, keyboard) {
  if (!keyboard) {
    return { indices: geometry.indices, removedTriangles: 0 };
  }

  const nextIndices = [];
  const rendered = [0, 0, 0];
  let removedTriangles = 0;
  let candidateMinimumY = Infinity;
  let candidateMaximumY = -Infinity;
  for (let offset = 0; offset < geometry.indices.length; offset += 3) {
    const centroid = [0, 0, 0];
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = geometry.indices[offset + corner] * 3;
      transform.toRendered(
        [
          geometry.positions[vertex],
          geometry.positions[vertex + 1],
          geometry.positions[vertex + 2],
        ],
        rendered,
      );
      centroid[0] += rendered[0] / 3;
      centroid[1] += rendered[1] / 3;
      centroid[2] += rendered[2] / 3;
    }

    const insideFootprint =
      Math.abs(centroid[0] - keyboard.position[0]) <= keyboard.width * 0.52 &&
      Math.abs(centroid[2] - keyboard.position[2]) <= keyboard.depth * 0.55;
    if (insideFootprint) {
      candidateMinimumY = Math.min(candidateMinimumY, centroid[1]);
      candidateMaximumY = Math.max(candidateMaximumY, centroid[1]);
    }
    const insideKeyboard =
      insideFootprint &&
      centroid[1] >= keyboard.position[1] - 0.15 &&
      centroid[1] <= keyboard.position[1] + 0.06;
    if (insideKeyboard) {
      removedTriangles += 1;
    } else {
      nextIndices.push(
        geometry.indices[offset],
        geometry.indices[offset + 1],
        geometry.indices[offset + 2],
      );
    }
  }
  return {
    indices: Uint32Array.from(nextIndices),
    removedTriangles,
    candidateYRange: [candidateMinimumY, candidateMaximumY],
  };
}

function geometryToPrimitiveData(geometry, transform, renderedPosition) {
  const positionAttribute = geometry.getAttribute("position");
  const normalAttribute = geometry.getAttribute("normal");
  const uvAttribute = geometry.getAttribute("uv");
  const positions = new Float32Array(positionAttribute.array.length);
  const localCenter = transform.toLocal(renderedPosition);

  for (let index = 0; index < positionAttribute.count; index += 1) {
    positions[index * 3] = positionAttribute.getX(index) + localCenter[0];
    positions[index * 3 + 1] =
      positionAttribute.getY(index) + localCenter[1];
    positions[index * 3 + 2] =
      positionAttribute.getZ(index) + localCenter[2];
  }

  const indices = geometry.index
    ? Uint32Array.from(geometry.index.array)
    : Uint32Array.from(
        { length: positionAttribute.count },
        (_, index) => index,
      );
  return {
    positions,
    normals: Float32Array.from(normalAttribute.array),
    uvs: uvAttribute
      ? Float32Array.from(uvAttribute.array)
      : new Float32Array(positionAttribute.count * 2),
    indices,
  };
}

function createKeyboardPrimitives(transform, keyboard) {
  if (!keyboard) return [];

  const width = transform.renderedLengthToLocal(keyboard.width, 0);
  const depth = transform.renderedLengthToLocal(keyboard.depth, 2);
  const height = transform.renderedLengthToLocal(0.028, 1);
  const radius = Math.min(width, depth) * 0.09;
  const keyboardGeometry = new RoundedBoxGeometry(
    width,
    height,
    depth,
    3,
    radius,
  );
  const keyboardPrimitive = geometryToPrimitiveData(
    keyboardGeometry,
    transform,
    keyboard.position,
  );
  keyboardGeometry.dispose();

  const trackpadWidth = transform.renderedLengthToLocal(
    keyboard.width * 0.24,
    0,
  );
  const trackpadDepth = transform.renderedLengthToLocal(
    keyboard.depth * 0.28,
    2,
  );
  const trackpadHeight = transform.renderedLengthToLocal(0.008, 1);
  const trackpadGeometry = new RoundedBoxGeometry(
    trackpadWidth,
    trackpadHeight,
    trackpadDepth,
    2,
    Math.min(trackpadWidth, trackpadDepth) * 0.08,
  );
  const trackpadPrimitive = geometryToPrimitiveData(
    trackpadGeometry,
    transform,
    [
      keyboard.position[0],
      keyboard.position[1] + 0.018,
      keyboard.position[2] + keyboard.depth * 0.2,
    ],
  );
  trackpadGeometry.dispose();
  return [keyboardPrimitive, trackpadPrimitive];
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

function encodeSourceGlb({
  texture,
  sourceNode,
  sourceGeometry,
  keyboardPrimitives,
  removedTriangles,
  sourceName,
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

  function appendAccessor(values, type, componentType, target) {
    const itemSize = typeSizes[type];
    const viewIndex = appendBuffer(values, target);
    const { minimum, maximum } = findMinimumMaximum(values, itemSize);
    accessors.push({
      bufferView: viewIndex,
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
  const primitiveData = [
    { ...sourceGeometry, material: 0 },
    ...keyboardPrimitives.map((primitive, index) => ({
      ...primitive,
      material: index + 1,
    })),
  ];
  const primitives = primitiveData.map((primitive) => ({
    attributes: {
      POSITION: appendAccessor(
        primitive.positions,
        "VEC3",
        5126,
        ARRAY_BUFFER,
      ),
      NORMAL: appendAccessor(
        primitive.normals,
        "VEC3",
        5126,
        ARRAY_BUFFER,
      ),
      TEXCOORD_0: appendAccessor(
        primitive.uvs,
        "VEC2",
        5126,
        ARRAY_BUFFER,
      ),
    },
    indices: appendAccessor(
      primitive.indices,
      "SCALAR",
      5125,
      ELEMENT_ARRAY_BUFFER,
    ),
    material: primitive.material,
    mode: 4,
  }));

  const binary = Buffer.alloc(align4(nextByteOffset));
  chunks.forEach((chunk, index) => {
    chunk.copy(binary, bufferViews[index].byteOffset);
  });

  const materials = [
    {
      name: "flat-illustration-source",
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      extensions: { KHR_materials_unlit: {} },
    },
  ];
  if (keyboardPrimitives.length > 0) {
    materials.push(
      {
        name: "single-color-keyboard-source",
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: [0.956, 0.918, 0.847, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        extensions: { KHR_materials_unlit: {} },
      },
      {
        name: "single-trackpad-source",
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: [0.78, 0.706, 0.62, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        extensions: { KHR_materials_unlit: {} },
      },
    );
  }

  const json = {
    asset: {
      version: "2.0",
      generator: "Agent Forest workstation source rebuilder v4",
    },
    extensionsUsed: ["EXT_texture_webp", "KHR_materials_unlit"],
    extensionsRequired: ["EXT_texture_webp"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        name: sourceName,
        mesh: 0,
        translation: sourceNode.translation ?? [0, 0, 0],
        scale: sourceNode.scale ?? [1, 1, 1],
      },
    ],
    meshes: [
      {
        name: `${sourceName}-rebuilt`,
        primitives,
        extras: { removedKeyboardTriangles: removedTriangles },
      },
    ],
    materials,
    textures: [
      {
        sampler: 0,
        extensions: { EXT_texture_webp: { source: 0 } },
      },
    ],
    samplers: [
      {
        magFilter: 9729,
        minFilter: 9987,
        wrapS: 10497,
        wrapT: 10497,
      },
    ],
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

function nearestPaletteColor(red, green, blue) {
  let best = illustrationPalette[0];
  let bestDistance = Infinity;
  for (const color of illustrationPalette) {
    const distance =
      (red - color[0]) ** 2 +
      (green - color[1]) ** 2 +
      (blue - color[2]) ** 2;
    if (distance < bestDistance) {
      best = color;
      bestDistance = distance;
    }
  }
  return best;
}

async function createFlatSourceTexture(originalTexture) {
  const { data, info } = await sharp(originalTexture)
    .ensureAlpha()
    .median(7)
    .blur(13)
    .modulate({ brightness: 1.04, saturation: 0.68 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mapped = Buffer.alloc(data.length);
  for (let offset = 0; offset < data.length; offset += 4) {
    const color = nearestPaletteColor(
      data[offset],
      data[offset + 1],
      data[offset + 2],
    );
    mapped[offset] = color[0];
    mapped[offset + 1] = color[1];
    mapped[offset + 2] = color[2];
    mapped[offset + 3] = data[offset + 3];
  }
  const palettePng = await sharp(mapped, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png({
      palette: true,
      colours: illustrationPalette.length,
      dither: 0,
      compressionLevel: 9,
    })
    .toBuffer();
  return {
    palettePng,
    embeddedWebp: await sharp(palettePng)
      .webp({ lossless: true, effort: 6 })
      .toBuffer(),
  };
}

await MeshoptDecoder.ready;
await fs.mkdir(outputDirectory, { recursive: true });
await fs.mkdir(previewDirectory, { recursive: true });
const manifest = {
  version: 4,
  mode: "source-glb-rebuild",
  runtimeCoverMeshes: false,
  paletteColors: illustrationPalette.length,
  models: [],
};

for (const model of models) {
  const sourceBuffer = await fs.readFile(
    path.join(sourceDirectory, model.input),
  );
  const { json, binary } = parseGlb(sourceBuffer);
  const image = json.images[0];
  const imageView = json.bufferViews[image.bufferView];
  const imageStart = imageView.byteOffset ?? 0;
  const originalTexture = binary.subarray(
    imageStart,
    imageStart + imageView.byteLength,
  );
  const { palettePng, embeddedWebp } =
    await createFlatSourceTexture(originalTexture);
  const sourceGeometry = readSourceGeometry(json, binary);
  const sourceNode = json.nodes[0];
  const transform = computeRenderTransform(
    sourceGeometry.positions,
    sourceNode,
    model.renderedHeight,
  );
  const { indices, removedTriangles, candidateYRange } = removeKeyboardGeometry(
    sourceGeometry,
    transform,
    model.keyboard,
  );
  sourceGeometry.indices = indices;
  const keyboardPrimitives = createKeyboardPrimitives(
    transform,
    model.keyboard,
  );

  await fs.writeFile(path.join(previewDirectory, model.preview), palettePng);
  await fs.writeFile(
    path.join(outputDirectory, model.output),
    encodeSourceGlb({
      texture: embeddedWebp,
      sourceNode,
      sourceGeometry,
      keyboardPrimitives,
      removedTriangles,
      sourceName: path.parse(model.output).name,
    }),
  );
  manifest.models.push({
    source: model.input,
    output: model.output,
    embeddedTexture: true,
    unlitMaterial: true,
    primitiveCount: 1 + keyboardPrimitives.length,
    removedKeyboardTriangles: removedTriangles,
  });
  console.log(
    `${model.output}: removed ${removedTriangles} noisy keyboard triangles; footprint y ${candidateYRange?.join("..") ?? "n/a"}`,
  );
}

await fs.writeFile(
  path.join(outputDirectory, "source-rebuild-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(outputDirectory);
