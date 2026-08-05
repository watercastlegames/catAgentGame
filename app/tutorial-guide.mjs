/* 첫 방문자용 손가락 가이드.

   연결도 설치도 없이 세 번만 누르면 "고양이에게 일을 시킨다"까지 도달하게 한다.
     1) 고양이 이름 지어주기  -> 조개 +5
     2) 바닥에 나타난 조개 줍기 -> 조개 +1
     3) 첫 업무 지시           -> 조개 -5 (AI_CHAT_SHELL_COST)

   2단계를 사이에 넣는 이유: 이름 보상 5개는 업무 1회분과 정확히 같아서,
   바로 업무로 가면 끝나고 잔액이 0이 된다. 조개를 한 번 주워 6개로 만들면
   업무 뒤에도 1개가 남아 "주우면 또 생긴다"가 손으로 남는다. */

export const TUTORIAL_KEY = "agent-forest-tutorial-v1";
export const TUTORIAL_NAMING_REWARD = 5;

/** 순서가 곧 진행 순서다. */
export const TUTORIAL_STEPS = [
  {
    id: "name-cat",
    target: "cat",
    title: "고양이 이름을 지어주세요",
    body: "고양이를 눌러 이름을 지어주면 조개 5개를 드려요.",
    reward: TUTORIAL_NAMING_REWARD,
  },
  {
    id: "collect-shell",
    target: "shell",
    title: "조개를 주워보세요",
    body: "바닥에 조개가 나타나요. 누르면 주머니에 들어가요.",
    reward: 0,
  },
  {
    id: "first-task",
    target: "cat",
    title: "첫 일을 맡겨보세요",
    body: "고양이를 누르고 하고 싶은 말을 적으면 대신 해줘요.",
    reward: 0,
  },
];

export const TUTORIAL_STEP_IDS = TUTORIAL_STEPS.map((step) => step.id);

export function createTutorialState() {
  return { stepIndex: 0, done: false, rewarded: [] };
}

export function parseTutorialState(raw) {
  try {
    const parsed = JSON.parse(raw ?? "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return createTutorialState();
    }
    const index = Number(parsed.stepIndex);
    const rewarded = Array.isArray(parsed.rewarded)
      ? parsed.rewarded.filter((id) => TUTORIAL_STEP_IDS.includes(id))
      : [];
    return {
      stepIndex: Number.isFinite(index)
        ? Math.min(Math.max(0, Math.trunc(index)), TUTORIAL_STEPS.length)
        : 0,
      done: parsed.done === true,
      rewarded: [...new Set(rewarded)],
    };
  } catch {
    return createTutorialState();
  }
}

export function currentTutorialStep(state) {
  if (!state || state.done) return null;
  return TUTORIAL_STEPS[state.stepIndex] ?? null;
}

/** 해당 단계를 실제로 해냈을 때 호출한다. 순서를 건너뛰면 무시한다. */
export function completeTutorialStep(state, stepId) {
  const step = currentTutorialStep(state);
  if (!step || step.id !== stepId) return { state, reward: 0 };

  const alreadyRewarded = state.rewarded.includes(stepId);
  const reward = alreadyRewarded ? 0 : step.reward;
  const stepIndex = state.stepIndex + 1;
  return {
    state: {
      stepIndex,
      done: stepIndex >= TUTORIAL_STEPS.length,
      rewarded: reward > 0 ? [...state.rewarded, stepId] : state.rewarded,
    },
    reward,
  };
}

export function skipTutorial(state) {
  return { ...state, stepIndex: TUTORIAL_STEPS.length, done: true };
}

export function readTutorialState() {
  if (typeof window === "undefined") return createTutorialState();
  try {
    return parseTutorialState(window.localStorage.getItem(TUTORIAL_KEY));
  } catch {
    return createTutorialState();
  }
}

export function writeTutorialState(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TUTORIAL_KEY, JSON.stringify(state));
  } catch {
    /* 저장이 막혀도 이번 방문에서는 그대로 진행된다 */
  }
}
