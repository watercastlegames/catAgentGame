export const CAT_PROGRESSION_KEY = "agent-forest-cat-progression-v1";
export const CAT_MAX_LEVEL = 50;

export const CAT_XP_REWARDS = Object.freeze({
  visit: 8,
  chat: 15,
  play: 12,
  style: 8,
  care: 10,
  image: 25,
});

const ACTIONS = Object.freeze(Object.keys(CAT_XP_REWARDS));

function finiteNonNegative(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function dayKeyAt(now) {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function catXpRequiredForLevel(level) {
  const normalized = Math.max(1, Math.min(CAT_MAX_LEVEL, Math.trunc(level)));
  return 60 + (normalized - 1) * 20;
}

export function catLevelProgress(totalXp) {
  let remaining = Math.max(0, Math.trunc(finiteNonNegative(totalXp)));
  let level = 1;
  while (level < CAT_MAX_LEVEL) {
    const required = catXpRequiredForLevel(level);
    if (remaining < required) break;
    remaining -= required;
    level += 1;
  }
  if (level >= CAT_MAX_LEVEL) {
    return { level: CAT_MAX_LEVEL, currentXp: 0, requiredXp: 0, percent: 100 };
  }
  const requiredXp = catXpRequiredForLevel(level);
  return {
    level,
    currentXp: remaining,
    requiredXp,
    percent: Math.min(100, Math.round((remaining / requiredXp) * 100)),
  };
}

export function createCatProgressionProfile() {
  return {
    totalXp: 0,
    lastVisitDay: null,
    actions: Object.fromEntries(ACTIONS.map((action) => [action, 0])),
    updatedAt: 0,
  };
}

function normalizeProfile(value) {
  const source = value && typeof value === "object" ? value : {};
  const actionsSource =
    source.actions && typeof source.actions === "object" ? source.actions : {};
  return {
    totalXp: Math.trunc(finiteNonNegative(source.totalXp)),
    lastVisitDay:
      typeof source.lastVisitDay === "string" ? source.lastVisitDay : null,
    actions: Object.fromEntries(
      ACTIONS.map((action) => [
        action,
        Math.trunc(finiteNonNegative(actionsSource[action])),
      ]),
    ),
    updatedAt: Math.trunc(finiteNonNegative(source.updatedAt)),
  };
}

export function parseCatProgressionStore(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([catId]) => Boolean(catId))
        .map(([catId, profile]) => [catId, normalizeProfile(profile)]),
    );
  } catch {
    return {};
  }
}

export function ensureCatProgressionProfile(store, catId) {
  return normalizeProfile(store?.[catId] ?? createCatProgressionProfile());
}

export function grantCatExperience(store, catId, action, now = Date.now()) {
  if (!catId || !ACTIONS.includes(action)) {
    const profile = ensureCatProgressionProfile(store, catId || "unknown");
    const progress = catLevelProgress(profile.totalXp);
    return {
      store: store ?? {},
      profile,
      gained: 0,
      levelBefore: progress.level,
      levelAfter: progress.level,
      leveledUp: false,
      progress,
    };
  }

  const profile = ensureCatProgressionProfile(store, catId);
  const today = dayKeyAt(now);
  if (action === "visit" && profile.lastVisitDay === today) {
    const progress = catLevelProgress(profile.totalXp);
    return {
      store,
      profile,
      gained: 0,
      levelBefore: progress.level,
      levelAfter: progress.level,
      leveledUp: false,
      progress,
    };
  }

  const gained = CAT_XP_REWARDS[action];
  const before = catLevelProgress(profile.totalXp);
  const nextProfile = {
    ...profile,
    totalXp: profile.totalXp + gained,
    lastVisitDay: action === "visit" ? today : profile.lastVisitDay,
    actions: {
      ...profile.actions,
      [action]: profile.actions[action] + 1,
    },
    updatedAt: now,
  };
  const progress = catLevelProgress(nextProfile.totalXp);
  return {
    store: { ...(store ?? {}), [catId]: nextProfile },
    profile: nextProfile,
    gained,
    levelBefore: before.level,
    levelAfter: progress.level,
    leveledUp: progress.level > before.level,
    progress,
  };
}
