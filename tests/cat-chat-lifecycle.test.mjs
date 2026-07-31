import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [page, world, bridge] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/agent-world-3d.tsx", import.meta.url), "utf8"),
  readFile(new URL("../bridge/server.mjs", import.meta.url), "utf8"),
]);

test("sent chat appears immediately and AI receives the cat persona", () => {
  assert.match(page, /type: "chat\.user\.sent"/);
  assert.match(page, /buildCatPersonaPrompt\(\{/);
  assert.match(page, /prompt: personaPrompt/);
  assert.match(page, /displayPrompt: message/);
  assert.match(bridge, /prompt: displayPrompt/);
});

test("sending closes the panel and keeps the cat working at its desk", () => {
  assert.match(page, /status: "working",\s+location: "coding"/);
  assert.match(page, /setPrompt\(""\);\s+setRadioOpen\(false\)/);
  assert.match(page, /\["queued", "briefing", "moving", "reporting"\]/);
  assert.match(
    world,
    /isPrimaryWorking\s+\?\s+codingDeskTarget\s+:\s+worldTargets/,
  );
  assert.match(world, /!isAutonomous && isPrimaryWorking/);
});

test("finished replies light an exclamation beacon until the cat is opened", () => {
  assert.match(page, /setUnreadReplyCatIds/);
  assert.match(page, /next\.add\(event\.threadId as string\)/);
  assert.match(page, /next\.delete\(runtime\.threadId\)/);
  assert.match(page, /if \(targetCat\?\.hasUnreadReply\)/);
  assert.match(
    world,
    /beacon\.visible = seat\.blocked \|\| Boolean\(seat\.hasUnreadReply\)/,
  );
});
