import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const worldSource = await readFile(
  new URL("../app/agent-world-3d.tsx", import.meta.url),
  "utf8",
);

test("world overhead tags follow the shared HUD dormant state", () => {
  assert.match(pageSource, /hudDormant \? "hud-dormant" : ""/);
  assert.match(
    worldSource,
    /const worldHudTagsVisible = !host\.closest\("\.hud-dormant"\)/,
  );
  assert.match(
    worldSource,
    /primaryMarker\.marker\.visible = worldHudTagsVisible/,
  );
  assert.match(
    worldSource,
    /entry\.marker\.marker\.visible = worldHudTagsVisible/,
  );
  assert.match(
    worldSource,
    /instance\.gauge\.label\.visible = worldHudTagsVisible/,
  );
});
