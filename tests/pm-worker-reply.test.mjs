import assert from "node:assert/strict";
import test from "node:test";

import { normalizePmWorkerReply } from "../app/pm-worker-reply.mjs";

test("restores PM Worker paragraph breaks damaged into nn", () => {
  const reply =
    "부천 주말 실내 나들이 추천해줄게nn1 도서관은 무료야nn2 만화박물관도 좋아nn특히 두 곳을 같이 둘러보기 좋아";

  assert.equal(
    normalizePmWorkerReply(reply),
    "부천 주말 실내 나들이 추천해줄게\n\n1 도서관은 무료야\n\n2 만화박물관도 좋아\n\n특히 두 곳을 같이 둘러보기 좋아",
  );
});

test("preserves actual and escaped newlines", () => {
  assert.equal(
    normalizePmWorkerReply("첫 문단\\n\\n둘째 문단\r\n셋째 줄"),
    "첫 문단\n\n둘째 문단\n셋째 줄",
  );
});

test("does not split ordinary English words containing nn", () => {
  assert.equal(
    normalizePmWorkerReply("running connection funny"),
    "running connection funny",
  );
});
