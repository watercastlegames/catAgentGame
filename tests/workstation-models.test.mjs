import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const JSON_CHUNK_TYPE = 0x4e4f534a;
const MODEL_PATHS = [
  "../public/models/camping-style-hybrid-v1/tent-workstation-smooth-cartoon-v1.glb",
  "../public/models/camping-style-hybrid-v1/round-laptop-workstation-smooth-cartoon-v1.glb",
  "../public/models/camping-style-hybrid-v1/folding-laptop-radio-workstation-smooth-cartoon-v1.glb",
];

function readGlbJson(buffer) {
  assert.equal(buffer.readUInt32LE(16), JSON_CHUNK_TYPE);
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(
    buffer
      .subarray(20, 20 + jsonLength)
      .toString("utf8")
      .replace(/\0+$/, "")
      .trimEnd(),
  );
}

test("upper workstations do not contain injected keyboard plates", async () => {
  for (const relativePath of MODEL_PATHS) {
    const buffer = await readFile(new URL(relativePath, import.meta.url));
    const glb = readGlbJson(buffer);
    const primitives = glb.meshes?.flatMap((mesh) => mesh.primitives ?? []) ?? [];
    const materialNames = (glb.materials ?? []).map(
      (material) => material.name ?? "",
    );

    assert.equal(primitives.length, 1, relativePath);
    assert.deepEqual(materialNames, ["flat-illustration-source"], relativePath);
    assert.equal(materialNames.includes("single-color-keyboard-source"), false);
    assert.equal(materialNames.includes("single-trackpad-source"), false);
  }
});
