import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/puter-companion.ts", import.meta.url),
  "utf8",
);

test("Puter script loads without a cross-origin mode its CDN does not support", () => {
  assert.doesNotMatch(source, /script\.crossOrigin\s*=/);
  assert.match(source, /script\.src\s*=\s*PUTER_SCRIPT_URL/);
});

test("free AI requires an explicit signed-in Puter session before chat", () => {
  assert.match(source, /auth\.signIn\(\)/);
  assert.match(source, /auth\?\.isSignedIn\(\)/);
  assert.match(source, /먼저 무료 AI에 로그인/);
});
