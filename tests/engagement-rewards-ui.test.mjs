import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, css, world] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../app/agent-world-3d.tsx", import.meta.url), "utf8"),
]);

test("daily first-question and purchase milestones are wired to visible rewards", () => {
  assert.match(page, /claimDailyQuestionBonus\(\)/);
  for (const kind of [
    "cat-style",
    "snack",
    "food",
    "food-bowl",
    "litter",
    "seat",
    "workstation-decor",
    "world-facility",
  ]) {
    assert.match(
      page,
      new RegExp(`claimFirstPurchaseBonus\\(\\s*"${kind}"`),
    );
  }
  assert.match(page, /className={`shell-reward-burst shell-reward-tier-/);
  assert.match(css, /--reward-duration: 520ms/);
  assert.match(css, /--reward-duration: 750ms/);
  assert.match(css, /--reward-duration: 1400ms/);
  assert.match(css, /@keyframes shellRewardSpark/);
});

test("the reply-ready art is a textured billboard rather than procedural punctuation", () => {
  assert.match(world, /reply-ready-exclamation-v1\.png/);
  assert.match(world, /new THREE\.PlaneGeometry\(0\.44, 0\.44\)/);
  assert.doesNotMatch(world, /new THREE\.RingGeometry\(0\.12, 0\.17/);
});
