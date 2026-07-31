import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const pageSource = fs.readFileSync(
  path.join(projectRoot, "app", "page.tsx"),
  "utf8",
);

test("clicking a world cat always opens that cat's chat detail", () => {
  const handlerStart = pageSource.indexOf("onSeatClick={(seatId) => {");
  const handlerEnd = pageSource.indexOf(
    "onRadioClick={() => setRadioOpen(true)}",
    handlerStart,
  );

  assert.ok(handlerStart >= 0, "world cat click handler should exist");
  assert.ok(handlerEnd > handlerStart, "world cat click handler should close");

  const handler = pageSource.slice(handlerStart, handlerEnd);
  const openCalls = handler.match(/openCatDetail\(seatId\)/g) ?? [];

  assert.equal(
    openCalls.length,
    2,
    "both unread-reply and ordinary cat clicks should open chat detail",
  );
  assert.doesNotMatch(
    handler,
    /setRadioPage\("status-log"\)/,
    "ordinary cat clicks must not be diverted to the status log",
  );
});
