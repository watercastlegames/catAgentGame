import fs from "node:fs/promises";
import path from "node:path";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const [, , inputArgument, outputArgument] = process.argv;

if (!inputArgument) {
  throw new Error(
    "Usage: node scripts/inspect-glb-structure.mjs <input.glb> [report.json]",
  );
}

const inputPath = path.resolve(inputArgument);
const outputPath = outputArgument ? path.resolve(outputArgument) : null;
const buffer = await fs.readFile(inputPath);
if (buffer.readUInt32LE(0) !== GLB_MAGIC) {
  throw new Error("Invalid GLB magic.");
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

function accessorCount(index) {
  return index === undefined ? 0 : (json.accessors?.[index]?.count ?? 0);
}

const meshes = (json.meshes ?? []).map((mesh, meshIndex) => {
  const primitives = (mesh.primitives ?? []).map((primitive, primitiveIndex) => {
    const indexCount = accessorCount(primitive.indices);
    const positionCount = accessorCount(primitive.attributes?.POSITION);
    const mode = primitive.mode ?? 4;
    return {
      primitiveIndex,
      materialIndex: primitive.material ?? null,
      materialName:
        primitive.material === undefined
          ? null
          : (json.materials?.[primitive.material]?.name ?? null),
      vertexCount: positionCount,
      indexCount,
      triangleCount:
        mode === 4 ? (indexCount || positionCount) / 3 : null,
      mode,
    };
  });
  return {
    meshIndex,
    name: mesh.name ?? null,
    primitiveCount: primitives.length,
    triangleCount: primitives.reduce(
      (sum, primitive) => sum + (primitive.triangleCount ?? 0),
      0,
    ),
    primitives,
  };
});

const nodes = (json.nodes ?? [])
  .map((node, nodeIndex) => ({
    nodeIndex,
    name: node.name ?? null,
    meshIndex: node.mesh ?? null,
    childCount: node.children?.length ?? 0,
  }))
  .filter((node) => node.meshIndex !== null || node.childCount > 0);

const report = {
  inputPath,
  fileBytes: buffer.length,
  generator: json.asset?.generator ?? null,
  sceneCount: json.scenes?.length ?? 0,
  nodeCount: json.nodes?.length ?? 0,
  meshCount: meshes.length,
  primitiveCount: meshes.reduce(
    (sum, mesh) => sum + mesh.primitiveCount,
    0,
  ),
  materialCount: json.materials?.length ?? 0,
  textureCount: json.textures?.length ?? 0,
  imageCount: json.images?.length ?? 0,
  totalTriangleCount: meshes.reduce(
    (sum, mesh) => sum + mesh.triangleCount,
    0,
  ),
  materials: (json.materials ?? []).map((material, materialIndex) => ({
    materialIndex,
    name: material.name ?? null,
    alphaMode: material.alphaMode ?? "OPAQUE",
    doubleSided: material.doubleSided ?? false,
  })),
  nodes,
  meshes,
};

if (outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
