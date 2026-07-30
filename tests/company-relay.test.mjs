import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../worker/company-relay.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const companyRelay = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("company CLI quota uses the documented 3/hour and 40/day caps", () => {
  assert.equal(companyRelay.COMPANY_CLI_HOURLY_CAP_PER_DEVICE, 3);
  assert.equal(companyRelay.COMPANY_CLI_DAILY_CAP_GLOBAL, 40);
  assert.equal(companyRelay.COMPANY_CLI_QUEUE_MAX_DEPTH, 10);
});

test("quota window rejects at cap and reports remaining window", () => {
  const result = companyRelay.evaluateQuotaWindow(
    { window_started_at: 1_000, attempt_count: 3 },
    2_000,
    10_000,
    3,
  );
  assert.equal(result.allowed, false);
  assert.equal(result.retryAfterMs, 9_000);
});

test("expired quota window resets safely", () => {
  const result = companyRelay.evaluateQuotaWindow(
    { window_started_at: 1_000, attempt_count: 99 },
    11_000,
    10_000,
    3,
  );
  assert.deepEqual(result, {
    allowed: true,
    windowStartedAt: 11_000,
    attemptCount: 0,
    retryAfterMs: 10_000,
  });
});

test("company CLI quota tables are represented in the Drizzle schema", async () => {
  const schema = await readFile(
    new URL("../db/schema.ts", import.meta.url),
    "utf8",
  );
  assert.match(schema, /company_cli_quota_hourly/);
  assert.match(schema, /company_cli_quota_daily/);
});
