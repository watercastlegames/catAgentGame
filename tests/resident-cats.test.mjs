import assert from "node:assert/strict";
import test from "node:test";

import {
  RESIDENT_CAT_NAME_POOL,
  createRandomResidentCatName,
  residentCatIdForSeat,
  residentCatNameForSeat,
  residentCatProfile,
} from "../app/resident-cats.mjs";

test("새 고양이 이름은 기존 이름과 겹치지 않게 한 번 뽑을 수 있다", () => {
  assert.equal(createRandomResidentCatName([], () => 0), "나비");
  assert.equal(createRandomResidentCatName(["나비"], () => 0), "두부");
  assert.ok(RESIDENT_CAT_NAME_POOL.length >= 12);
});

test("열린 자리마다 서로 다른 기본 고양이가 정해진다", () => {
  const seats = ["seat-1", "seat-2", "seat-3", "seat-4"];
  const ids = seats.map(residentCatIdForSeat);
  const names = seats.map(residentCatNameForSeat);

  assert.equal(new Set(ids).size, seats.length);
  assert.equal(new Set(names).size, seats.length);
  assert.deepEqual(names, ["코치 모모", "두부", "콩이", "모카"]);
});

test("알 수 없는 자리는 안전하게 첫 고양이로 대체한다", () => {
  assert.deepEqual(residentCatProfile("seat-99"), {
    id: "agent-forest-demo-cat",
    name: "코치 모모",
  });
});
