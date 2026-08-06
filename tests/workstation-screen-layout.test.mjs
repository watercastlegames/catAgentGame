import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  WORKSTATION_SCREEN_LAYOUT_STORAGE_KEY,
  parseWorkstationScreenLayout,
} from "../app/workstation-screen-layout.mjs";

test("monitor calibration storage accepts only complete finite screen poses", () => {
  assert.equal(
    WORKSTATION_SCREEN_LAYOUT_STORAGE_KEY,
    "agent-forest-workstation-screen-layout-v1",
  );
  assert.deepEqual(
    parseWorkstationScreenLayout(
      JSON.stringify({
        "seat-2": {
          x: 0.01,
          y: 0.67,
          z: -0.08,
          width: 0.62,
          height: 0.38,
          rotationX: -0.02,
        },
        "seat-3": {
          x: 0,
          y: 0,
          z: 0,
          width: -1,
          height: 1,
          rotationX: 0,
        },
        "seat-9": {
          x: 0,
          y: 0,
          z: 0,
          width: 1,
          height: 1,
          rotationX: 0,
        },
      }),
    ),
    {
      "seat-2": {
        x: 0.01,
        y: 0.67,
        z: -0.08,
        width: 0.62,
        height: 0.38,
        rotationX: -0.02,
      },
    },
  );
});

test("monitor calibration UI supports keyboard movement and independent sizing", async () => {
  const source = await readFile(
    new URL("../app/agent-world-3d.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /handleMonitorCalibrationKeyDown/);
  assert.match(source, /case "ArrowLeft"/);
  assert.match(source, /case "KeyA"/);
  assert.match(source, /case "KeyW"/);
  assert.match(source, /case "BracketRight"/);
  assert.match(source, /savedMonitorScreenLayout/);
  assert.match(source, /host\.dataset\.savedMonitorScreenLayout/);
});
