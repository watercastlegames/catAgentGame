import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/companion-backends.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText.replace(
  /export const APP_EDITION =[\s\S]*?;\nexport const COMPANION_BACKENDS/,
  'export const APP_EDITION = "public";\nexport const COMPANION_BACKENDS',
);
const backends = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("public builds omit owner-funded CLI backends and prefer the local Agent Forest bridge", () => {
  assert.deepEqual(
    backends.visibleCompanionBackends("public").map((backend) => backend.id),
    ["local-session", "puter"],
  );
  assert.equal(backends.defaultCompanionBackend("public"), "local-session");
});

test("service builds expose all four backends but do not fake server readiness", () => {
  const visible = backends.visibleCompanionBackends("service");
  assert.equal(visible.length, 4);
  assert.equal(visible[0].available, "server-pending");
  assert.equal(visible[1].available, "server-pending");
  assert.equal(backends.defaultCompanionBackend("service"), "chatgpt-cli");
});

test("stored backend selection is constrained to the current edition", () => {
  assert.equal(
    backends.parseCompanionBackend("chatgpt-cli", "public"),
    "local-session",
  );
  assert.equal(
    backends.parseCompanionBackend("local-session", "public"),
    "local-session",
  );
});
