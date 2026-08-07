import assert from "node:assert/strict";
import test from "node:test";
import {
  CAT_PERSONALITY_PROFILES,
  CAT_STYLE_PERSONALITIES,
  catPersonalityForStyle,
  pickPersonalityAmbientKey,
  pickPersonalityYieldAnimation,
} from "../app/cat-personalities.mjs";

const CAT_STYLE_IDS = [
  "Abyssian",
  "Black",
  "BlackWhite",
  "Blue",
  "Bobtail",
  "British",
  "Cream",
  "Maine",
  "Persian",
  "Red",
  "RedWhite",
  "Siamese",
  "Simple",
  "Sphynx",
  "White",
];

test("every selectable cat style has a stable personality", () => {
  for (const styleId of CAT_STYLE_IDS) {
    assert.ok(CAT_STYLE_PERSONALITIES[styleId], styleId);
    assert.equal(
      catPersonalityForStyle(styleId).id,
      CAT_STYLE_PERSONALITIES[styleId],
    );
  }
});

test("sleepy cats rest and yield more while energetic cats move more", () => {
  const energetic = CAT_PERSONALITY_PROFILES.energetic;
  const sleepy = CAT_PERSONALITY_PROFILES.sleepy;

  assert.ok(sleepy.restDurationMultiplier > energetic.restDurationMultiplier);
  assert.ok(sleepy.yieldBias > energetic.yieldBias);
  assert.ok(sleepy.moveSpeedMultiplier < energetic.moveSpeedMultiplier);
  assert.equal(pickPersonalityAmbientKey(sleepy, 0.999), "lie");
});

test("collision yielding only selects a calm stationary animation", () => {
  const allowed = new Set(["idle-look", "idle-relax", "sit"]);
  for (const profile of Object.values(CAT_PERSONALITY_PROFILES)) {
    for (const randomValue of [0, 0.25, 0.5, 0.75, 0.999]) {
      assert.ok(
        allowed.has(pickPersonalityYieldAnimation(profile, randomValue)),
      );
    }
  }
});
