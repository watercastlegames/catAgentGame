import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const [, , inputArgument, outputArgument] = process.argv;
const inputPath = inputArgument
  ? path.resolve(inputArgument)
  : path.join(
      projectRoot,
      "public",
      "models",
      "camping-style-locked-v4",
      "low-monitor-cat-keycap-workstation-flat-source-v4.glb",
    );
const outputDirectory = path.join(
  projectRoot,
  "tmp",
  "style-analysis",
  "low-monitor-topology",
);
const outputPath = outputArgument
  ? path.resolve(outputArgument)
  : path.join(outputDirectory, "component-report.json");

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const RENDERED_HEIGHT = 1.12;
const POSITION_WELD_PRECISION = Number(
  process.env.WORKSTATION_WELD_PRECISION ?? 10000,
);

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

function readFloatAccessor(json, binary, accessorIndex, itemSize) {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  if (accessor.componentType !== 5126 || view.extensions) {
    throw new Error(`Accessor ${accessorIndex} must be float32.`);
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
  return (local) => [
    (local[0] * scale[0] + translation[0] - center[0]) *
      unitScale *
      RENDERED_HEIGHT,
    (local[1] * scale[1] + translation[1] - minimum[1]) *
      unitScale *
      RENDERED_HEIGHT,
    (local[2] * scale[2] + translation[2] - center[2]) *
      unitScale *
      RENDERED_HEIGHT,
  ];
}

function positionKey(positions, vertex) {
  const offset = vertex * 3;
  return `${Math.round(positions[offset] * POSITION_WELD_PRECISION)},${Math.round(
    positions[offset + 1] * POSITION_WELD_PRECISION,
  )},${Math.round(positions[offset + 2] * POSITION_WELD_PRECISION)}`;
}

function roundVector(values) {
  return values.map((value) => Number(value.toFixed(4)));
}

const { json, binary } = parseGlb(await fs.readFile(inputPath));
const primitive = json.meshes[0].primitives[0];
const positions = readFloatAccessor(
  json,
  binary,
  primitive.attributes.POSITION,
  3,
);
const indices = readIndexAccessor(json, binary, primitive.indices);
const toRendered = createRenderTransform(positions, json.nodes[0]);
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

const visited = new Uint8Array(triangleCount);
const components = [];
for (let seed = 0; seed < triangleCount; seed += 1) {
  if (visited[seed]) continue;
  const queue = [seed];
  visited[seed] = 1;
  const triangles = [];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const triangle = queue[cursor];
    triangles.push(triangle);
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = indices[triangle * 3 + corner];
      const key = positionKey(positions, vertex);
      for (const neighbor of weldedVertexTriangles.get(key) ?? []) {
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
  }
  components.push(triangles);
}

const reportComponents = components
  .map((triangles, sourceIndex) => {
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    const center = [0, 0, 0];
    let upwardTriangles = 0;
    let verticalTriangles = 0;
    for (const triangle of triangles) {
      const corners = [];
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = indices[triangle * 3 + corner] * 3;
        const rendered = toRendered([
          positions[vertex],
          positions[vertex + 1],
          positions[vertex + 2],
        ]);
        corners.push(rendered);
        for (let axis = 0; axis < 3; axis += 1) {
          minimum[axis] = Math.min(minimum[axis], rendered[axis]);
          maximum[axis] = Math.max(maximum[axis], rendered[axis]);
          center[axis] += rendered[axis] / (triangles.length * 3);
        }
      }
      const ab = corners[1].map((value, axis) => value - corners[0][axis]);
      const ac = corners[2].map((value, axis) => value - corners[0][axis]);
      const normal = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      const length = Math.hypot(...normal) || 1;
      const absoluteY = Math.abs(normal[1] / length);
      if (absoluteY >= 0.72) upwardTriangles += 1;
      if (absoluteY <= 0.28) verticalTriangles += 1;
    }
    return {
      sourceIndex,
      triangleCount: triangles.length,
      percentage: Number(((triangles.length / triangleCount) * 100).toFixed(3)),
      center: roundVector(center),
      minimum: roundVector(minimum),
      maximum: roundVector(maximum),
      size: roundVector(maximum.map((value, axis) => value - minimum[axis])),
      upwardTriangleRatio: Number(
        (upwardTriangles / triangles.length).toFixed(3),
      ),
      verticalTriangleRatio: Number(
        (verticalTriangles / triangles.length).toFixed(3),
      ),
    };
  })
  .sort((left, right) => right.triangleCount - left.triangleCount)
  .map((component, sortedIndex) => ({ sortedIndex, ...component }));

const report = {
  input: path.relative(projectRoot, inputPath),
  vertexCount: positions.length / 3,
  triangleCount,
  weldedPositionCount: weldedVertexTriangles.size,
  componentCount: components.length,
  weldPrecision: POSITION_WELD_PRECISION,
  components: reportComponents,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
