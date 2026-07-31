export const WORLD_SHELL_DAILY_KEY = "agent-forest-world-shell-daily-v1";
export const TASK_REWARD_DAILY_KEY = "agent-forest-task-reward-daily-v1";
export const ENGAGEMENT_REWARD_KEY = "agent-forest-engagement-rewards-v1";
export const WORLD_SHELL_DAILY_CAP = 40;
export const TASK_REWARD_CAP_COUNT = 20;
export const TASK_REWARD_DAILY_MAX = 145;
export const DAILY_FIRST_QUESTION_REWARD = 5;
export const FIRST_PURCHASE_REWARD = 5;

export const FIRST_PURCHASE_KINDS = [
  "cat-style",
  "snack",
  "food",
  "food-bowl",
  "litter",
  "seat",
  "workstation-decor",
] as const;

export type FirstPurchaseKind = (typeof FIRST_PURCHASE_KINDS)[number];

export type EngagementRewardState = {
  dailyQuestionDate: string;
  firstPurchases: FirstPurchaseKind[];
};

export type DailyCounter = {
  date: string;
  count: number;
  reward: number;
};

export function localDateStamp(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createDailyCounter(now = new Date()): DailyCounter {
  return { date: localDateStamp(now), count: 0, reward: 0 };
}

export function createEngagementRewardState(): EngagementRewardState {
  return { dailyQuestionDate: "", firstPurchases: [] };
}

export function parseEngagementRewardState(
  raw: string | null,
): EngagementRewardState {
  if (!raw) return createEngagementRewardState();
  try {
    const parsed = JSON.parse(raw) as Partial<EngagementRewardState>;
    const knownKinds = new Set<string>(FIRST_PURCHASE_KINDS);
    return {
      dailyQuestionDate:
        typeof parsed.dailyQuestionDate === "string"
          ? parsed.dailyQuestionDate
          : "",
      firstPurchases: Array.from(
        new Set(
          Array.isArray(parsed.firstPurchases)
            ? parsed.firstPurchases.filter(
                (kind): kind is FirstPurchaseKind =>
                  typeof kind === "string" && knownKinds.has(kind),
              )
            : [],
        ),
      ),
    };
  } catch {
    return createEngagementRewardState();
  }
}

export function claimDailyFirstQuestionReward(
  state: EngagementRewardState,
  now = new Date(),
): { state: EngagementRewardState; reward: number } {
  const today = localDateStamp(now);
  if (state.dailyQuestionDate === today) return { state, reward: 0 };
  return {
    state: { ...state, dailyQuestionDate: today },
    reward: DAILY_FIRST_QUESTION_REWARD,
  };
}

export function claimFirstPurchaseReward(
  state: EngagementRewardState,
  kind: FirstPurchaseKind,
): { state: EngagementRewardState; reward: number } {
  if (state.firstPurchases.includes(kind)) return { state, reward: 0 };
  return {
    state: {
      ...state,
      firstPurchases: [...state.firstPurchases, kind],
    },
    reward: FIRST_PURCHASE_REWARD,
  };
}

export function parseDailyCounter(
  raw: string | null,
  now = new Date(),
): DailyCounter {
  const today = localDateStamp(now);
  if (!raw) return createDailyCounter(now);
  try {
    const parsed = JSON.parse(raw) as Partial<DailyCounter>;
    if (parsed.date !== today) return createDailyCounter(now);
    return {
      date: today,
      count: Math.max(0, Math.trunc(Number(parsed.count) || 0)),
      reward: Math.max(0, Math.trunc(Number(parsed.reward) || 0)),
    };
  } catch {
    return createDailyCounter(now);
  }
}

export function claimWorldShells(
  counter: DailyCounter,
  requested = 1,
): { counter: DailyCounter; reward: number } {
  const remaining = Math.max(0, WORLD_SHELL_DAILY_CAP - counter.count);
  const reward = Math.min(
    remaining,
    Math.max(0, Math.trunc(Number(requested) || 0)),
  );
  return {
    counter: {
      ...counter,
      count: counter.count + reward,
      reward: counter.reward + reward,
    },
    reward,
  };
}

export function taskRewardRate(taskNumber: number) {
  if (taskNumber <= 0 || taskNumber > TASK_REWARD_CAP_COUNT) return 0;
  if (taskNumber <= 5) return 15;
  if (taskNumber <= 10) return 8;
  return 3;
}

export function claimTaskReward(
  counter: DailyCounter,
  mode: "codex" | "simulation" = "codex",
): { counter: DailyCounter; reward: number } {
  if (mode === "simulation" || counter.count >= TASK_REWARD_CAP_COUNT) {
    return { counter, reward: 0 };
  }
  const taskNumber = counter.count + 1;
  const reward = taskRewardRate(taskNumber);
  return {
    counter: {
      ...counter,
      count: taskNumber,
      reward: Math.min(TASK_REWARD_DAILY_MAX, counter.reward + reward),
    },
    reward,
  };
}
