export const AI_CHAT_SHELL_COST = 5;

const BILLABLE_BACKENDS = new Set([
  "local-session",
  "local-claude",
  "puter",
  "pm-worker",
]);

function shellBalance(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

export function isAiChatShellBackend(backendId) {
  return BILLABLE_BACKENDS.has(backendId);
}

export function chargeAiChat(balance) {
  const current = shellBalance(balance);
  if (current < AI_CHAT_SHELL_COST) {
    return { ok: false, balance: current, cost: AI_CHAT_SHELL_COST };
  }
  return {
    ok: true,
    balance: current - AI_CHAT_SHELL_COST,
    cost: AI_CHAT_SHELL_COST,
  };
}

export function refundAiChat(balance) {
  return shellBalance(balance) + AI_CHAT_SHELL_COST;
}
