import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../app/page.tsx", import.meta.url);
const puterPath = new URL("../app/puter-companion.ts", import.meta.url);
const imagePlayPath = new URL("../app/image-play.ts", import.meta.url);

test("선택한 고양이의 자리와 이름을 모든 작업 이벤트에 고정한다", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /const taskSeatId = focusedSeatId/);
  assert.equal((source.match(/seatId: taskSeatId/g) ?? []).length, 5);
  assert.equal((source.match(/agentName: catName/g) ?? []).length, 5);
  assert.match(source, /requestedSeatId \?\?\s*existing\?\.seatId/);
  assert.match(source, /event\.agentName \?\?\s*existing\?\.agentName/);
  assert.match(source, /buildCatPersonaPrompt\(\{\s*catName,/);
});

test("표시 이름은 주민 ID와 작업 스레드 ID 양쪽에 함께 저장한다", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /\[focusedCatId\]: nextName,[\s\S]*?\[focusedResidentCatId\]: nextName/);
  assert.match(source, /createRandomResidentCatName\(\s*Object\.values\(nextNames\)/);
  assert.match(source, /window\.localStorage\.setItem\(CAT_NAME_KEY/);
});

test("이미지 놀이는 사진·촬영 입력과 성공 후 10조개 차감을 제공한다", async () => {
  const [page, puter, imagePlay] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(puterPath, "utf8"),
    readFile(imagePlayPath, "utf8"),
  ]);
  assert.match(imagePlay, /IMAGE_PLAY_SHELL_COST = 10/);
  assert.match(page, /accept="image\/\*"/);
  assert.match(page, /capture="environment"/);
  assert.match(page, /await generatePuterImage/);
  assert.match(page, /const nextShells = shells - IMAGE_PLAY_SHELL_COST/);
  assert.match(puter, /txt2img/);
  assert.match(puter, /input_image: inputImage/);
  assert.match(puter, /model: "gpt-image-1-mini"/);
});
