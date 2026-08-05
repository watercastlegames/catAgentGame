/* pm_worker 는 사장님 개인 구독을 쓴다. 맛보기로 열어두되 한 사람이 하루에
   쓸 수 있는 횟수를 묶어 둔다(기본 5회).

   주의: 이 카운터는 브라우저 localStorage 에만 있다. devtools 로 지우면
   초기화되므로 "정상 사용자 페이싱"이지 부정사용 방지가 아니다.
   진짜 차단은 /api/pm-worker/chat(Worker) 쪽에 같은 상한을 걸어야 한다. */

export const PM_WORKER_QUOTA_KEY = "agent-forest-pm-worker-quota-v1";
export const PM_WORKER_DAILY_LIMIT = 5;

/** 한국 날짜 기준으로 하루를 센다. 자정(KST)에 초기화된다. */
export function seoulDayKey(now = Date.now()) {
  const seoul = new Date(now + 9 * 60 * 60 * 1000);
  return seoul.toISOString().slice(0, 10);
}

export function parseQuota(raw, now = Date.now()) {
  const today = seoulDayKey(now);
  try {
    const parsed = JSON.parse(raw ?? "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { day: today, used: 0 };
    }
    if (parsed.day !== today) return { day: today, used: 0 };
    const used = Number(parsed.used);
    return {
      day: today,
      used: Number.isFinite(used) ? Math.min(Math.max(0, Math.trunc(used)), PM_WORKER_DAILY_LIMIT) : 0,
    };
  } catch {
    return { day: today, used: 0 };
  }
}

export function quotaRemaining(quota, limit = PM_WORKER_DAILY_LIMIT) {
  return Math.max(0, limit - (quota?.used ?? 0));
}

export function canUsePmWorker(quota, limit = PM_WORKER_DAILY_LIMIT) {
  return quotaRemaining(quota, limit) > 0;
}

export function consumeQuota(quota, now = Date.now(), limit = PM_WORKER_DAILY_LIMIT) {
  const today = seoulDayKey(now);
  const used = quota?.day === today ? (quota.used ?? 0) : 0;
  return { day: today, used: Math.min(limit, used + 1) };
}

export function readQuota(now = Date.now()) {
  if (typeof window === "undefined") return { day: seoulDayKey(now), used: 0 };
  try {
    return parseQuota(window.localStorage.getItem(PM_WORKER_QUOTA_KEY), now);
  } catch {
    return { day: seoulDayKey(now), used: 0 };
  }
}

export function writeQuota(quota) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PM_WORKER_QUOTA_KEY, JSON.stringify(quota));
  } catch {
    /* 저장이 막혀도 이번 방문 동안의 동작은 막지 않는다 */
  }
}

/** 남은 횟수를 사람에게 보여줄 문구. 0이면 안내 문구를 준다. */
export function quotaNotice(quota, limit = PM_WORKER_DAILY_LIMIT) {
  const left = quotaRemaining(quota, limit);
  if (left > 0) return `오늘 남은 무료 업무 ${left}회`;
  return "오늘 무료 업무를 다 썼어요. 내일 다시 열려요.";
}
