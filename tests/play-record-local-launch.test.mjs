import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/play-record/page.tsx", import.meta.url),
  "utf8",
);

test("녹화 페이지는 자신이 올라간 사이트의 게임을 연다", () => {
  // sidak.kr/.../play-record 에서 열면 sidak.kr 게임을, localhost 에서 열면
  // localhost 게임을 연다 — origin 기반으로 결정한다.
  assert.match(source, /window\.location\.origin/);
  assert.match(source, /window\.location\.pathname\.replace\(/);
  // 개발용 폴백 상수는 그대로 둔다.
  assert.match(source, /const LOCAL_GAME_URL = "http:\/\/localhost:3000\/";/);
});
