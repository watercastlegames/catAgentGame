export const WORLD_SHELL_DAILY_KEY = "agent-forest-world-shell-daily-v1";
export const TASK_REWARD_DAILY_KEY = "agent-forest-task-reward-daily-v1";
export const WORLD_SHELL_DAILY_CAP = 40;
export const TASK_REWARD_CAP_COUNT = 20;
export const TASK_REWARD_DAILY_MAX = 145;

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
