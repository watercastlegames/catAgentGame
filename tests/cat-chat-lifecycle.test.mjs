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
  assert.match(world, /reply-ready-exclamation-v1\.png/);
});

test("a delivered reply releases the cat to autonomous movement immediately", () => {
  assert.match(
    page,
    /\["task\.completed", "pm-chat\.completed"\]\.includes\(event\.type\)/,
  );
  assert.match(page, /status = "completed";\s+location = "general";/);
  assert.match(world, /AUTONOMOUS_STATUSES\.has\(motionRef\.current\.status\)/);
});

test("idle cats leave workstations and only active commands use computers", () => {
  assert.match(
    world,
    /const wantsDeskInteraction = !isAutonomous && isPrimaryWorking/,
  );
  assert.match(
    world,
    /characterRoot\.position\.copy\(AMBIENT_WANDER_POINTS\[0\]\)/,
  );
  assert.match(world, /becameSecondaryAutonomous/);
  assert.match(world, /일을 마치고 해변으로 쉬러 나가는 중/);
  assert.doesNotMatch(world, /ambientDestination.*"desk"/);
  assert.doesNotMatch(world, /ambientPhase === "kneading"/);
});
