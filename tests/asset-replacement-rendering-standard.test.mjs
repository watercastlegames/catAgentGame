import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps the replacement asset pipeline linked and unlit by default", async () => {
  const [agents, standard, world] = await Promise.all([
    readFile(new URL("AGENTS.md", root), "utf8"),
    readFile(
      new URL("docs/asset-replacement-rendering-standard.md", root),
      "utf8",
    ),
    readFile(new URL("app/agent-world-3d.tsx", root), "utf8"),
  ]);

  assert.match(agents, /@docs\/asset-replacement-rendering-standard\.md/);
  assert.match(standard, /KHR_materials_unlit/);
  assert.match(standard, /MeshBasicMaterial/);
  assert.match(standard, /빈 고양이 밥그릇/);
  assert.match(standard, /사료가 가득 찬 고양이 밥그릇/);
  assert.match(standard, /덮개형 고양이 화장실/);
  assert.match(world, /createUnlitMeshyMaterial/);
  assert.match(world, /createCoveredCatLitterBox[\s\S]*createUnlitIllustratedMaterial/);
});
