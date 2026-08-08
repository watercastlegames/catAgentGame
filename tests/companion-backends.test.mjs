import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/companion-backends.ts", import.meta.url),
  "utf8",
);
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    /export const APP_EDITION =[\s\S]*?;\nexport const COMPANION_BACKENDS/,
    'export const APP_EDITION = "public";\nexport const COMPANION_BACKENDS',
  );
const backends = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("public builds expose both local coding CLIs and start on the shared worker", () => {
  const visible = backends.visibleCompanionBackends("public");
  assert.deepEqual(
    visible.map((backend) => backend.id),
    ["local-session", "local-claude", "puter", "pm-worker"],
  );
  assert.equal(visible[0].title, "ChatGPT Codex (내 PC)");
  assert.equal(visible[1].title, "Claude Code (내 PC)");
  // 처음 들어온 사람이 설치·페어링 없이 바로 한 번 시켜볼 수 있어야 해서
  // 두 판 모두 pm-worker 로 시작한다. 내 PC 연결은 고르는 선택지로 남는다.
  assert.equal(backends.defaultCompanionBackend("public"), "pm-worker");
});

test("service builds expose all six backends but do not fake owner CLI readiness", () => {
  const visible = backends.visibleCompanionBackends("service");
  assert.equal(visible.length, 6);
  assert.equal(visible[0].available, "server-pending");
  assert.equal(visible[1].available, "server-pending");
  assert.equal(
    visible.find((backend) => backend.id === "local-claude")?.available,
    "requires-pairing",
  );
  assert.equal(backends.defaultCompanionBackend("service"), "pm-worker");
});

test("stored backend selection is constrained to the current edition", () => {
  // public 판에 없는 값이 저장돼 있으면 기본값으로 되돌린다.
  assert.equal(
    backends.parseCompanionBackend("chatgpt-cli", "public"),
    "pm-worker",
  );
  assert.equal(
    backends.parseCompanionBackend("local-session", "public"),
    "local-session",
  );
  assert.equal(
    backends.parseCompanionBackend("local-claude", "public"),
    "local-claude",
  );
});

test("all public chat backends disclose the five-shell conversation cost", () => {
  for (const backend of backends.visibleCompanionBackends("public")) {
    assert.match(backend.badge, /조개 5/);
    assert.match(backend.description, /조개 5개/);
  }
});
