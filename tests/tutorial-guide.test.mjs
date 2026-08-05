import assert from "node:assert/strict";
import test from "node:test";

import {
  TUTORIAL_NAMING_REWARD,
  TUTORIAL_STEPS,
  completeTutorialStep,
  createTutorialState,
  currentTutorialStep,
  parseTutorialState,
  skipTutorial,
} from "../app/tutorial-guide.mjs";
import {
  PM_WORKER_DAILY_LIMIT,
  canUsePmWorker,
  consumeQuota,
  parseQuota,
  quotaNotice,
  quotaRemaining,
  seoulDayKey,
} from "../app/pm-worker-quota.mjs";
import { AI_CHAT_SHELL_COST } from "../app/ai-chat-economy.mjs";

test("가이드는 이름짓기 → 조개줍기 → 첫업무 순서다", () => {
  assert.deepEqual(
    TUTORIAL_STEPS.map((step) => step.id),
    ["name-cat", "collect-shell", "first-task"],
  );
});

test("이름 보상은 업무 1회 비용과 같다", () => {
  assert.equal(TUTORIAL_NAMING_REWARD, AI_CHAT_SHELL_COST);
});

test("세 단계를 마치면 조개가 1개 남는다", () => {
  // 조개를 사이에 줍게 한 이유 — 업무 뒤에도 잔액이 남아야 다음 행동으로 이어진다.
  let shells = 0;
  let state = createTutorialState();

  const naming = completeTutorialStep(state, "name-cat");
  shells += naming.reward;
  state = naming.state;
  assert.equal(shells, 5);

  const picked = completeTutorialStep(state, "collect-shell");
  state = picked.state;
  shells += 1; // 월드에서 주운 조개

  const task = completeTutorialStep(state, "first-task");
  state = task.state;
  shells -= AI_CHAT_SHELL_COST;

  assert.equal(shells, 1);
  assert.equal(state.done, true);
});

test("순서를 건너뛴 완료는 무시한다", () => {
  const state = createTutorialState();
  const jumped = completeTutorialStep(state, "first-task");
  assert.equal(jumped.reward, 0);
  assert.equal(jumped.state.stepIndex, 0);
});

test("같은 단계를 두 번 해도 보상은 한 번만", () => {
  let state = createTutorialState();
  const first = completeTutorialStep(state, "name-cat");
  assert.equal(first.reward, 5);
  // 되돌린 상태에서 다시 시도해도 이미 받은 보상은 다시 주지 않는다
  const replayed = completeTutorialStep(
    { ...first.state, stepIndex: 0, done: false },
    "name-cat",
  );
  assert.equal(replayed.reward, 0);
});

test("건너뛰면 더 이상 단계가 없다", () => {
  const state = skipTutorial(createTutorialState());
  assert.equal(currentTutorialStep(state), null);
  assert.equal(state.done, true);
});

test("저장값이 깨져도 처음부터 시작한다", () => {
  assert.deepEqual(parseTutorialState("{{"), createTutorialState());
  assert.deepEqual(parseTutorialState(null), createTutorialState());
});

test("pm_worker 하루 상한은 5회다", () => {
  assert.equal(PM_WORKER_DAILY_LIMIT, 5);
  let quota = parseQuota(null);
  for (let i = 0; i < 5; i += 1) {
    assert.equal(canUsePmWorker(quota), true);
    quota = consumeQuota(quota);
  }
  assert.equal(canUsePmWorker(quota), false);
  assert.equal(quotaRemaining(quota), 0);
});

test("날짜가 바뀌면 상한이 풀린다", () => {
  const day1 = Date.parse("2026-08-02T05:00:00Z");
  const day2 = Date.parse("2026-08-03T05:00:00Z");
  let quota = parseQuota(null, day1);
  for (let i = 0; i < 5; i += 1) quota = consumeQuota(quota, day1);
  assert.equal(canUsePmWorker(quota), false);

  const carried = parseQuota(JSON.stringify(quota), day2);
  assert.equal(carried.used, 0);
  assert.equal(canUsePmWorker(carried), true);
});

test("하루 경계는 한국 시각을 따른다", () => {
  // 2026-08-02 15:00Z = 2026-08-03 00:00 KST → 한국 기준 다음 날
  assert.equal(seoulDayKey(Date.parse("2026-08-02T14:59:00Z")), "2026-08-02");
  assert.equal(seoulDayKey(Date.parse("2026-08-02T15:00:00Z")), "2026-08-03");
});

test("남은 횟수 안내 문구", () => {
  assert.match(quotaNotice(parseQuota(null)), /5회/);
  let quota = parseQuota(null);
  for (let i = 0; i < 5; i += 1) quota = consumeQuota(quota);
  assert.match(quotaNotice(quota), /내일 다시/);
});
