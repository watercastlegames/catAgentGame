import type { CompanionBackendId } from "./companion-backends";

export const AI_CHAT_SHELL_COST: number;
export function isAiChatShellBackend(
  backendId: CompanionBackendId,
): boolean;
export function chargeAiChat(balance: number): {
  ok: boolean;
  balance: number;
  cost: number;
};
export function refundAiChat(balance: number): number;
