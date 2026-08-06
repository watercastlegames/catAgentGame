import type { CompanionBackendId } from "./companion-backends";

export type LocalSessionProvider = "codex" | "claude";
export const CLAUDE_SESSION_PREFIX: string;
export function isLocalCodeBackend(backendId: CompanionBackendId): boolean;
export function localSessionProviderForBackend(
  backendId: CompanionBackendId,
): LocalSessionProvider | null;
export function isClaudeSessionId(sessionId: string | null | undefined): boolean;
export function sessionMatchesBackend(
  sessionId: string | null | undefined,
  backendId: CompanionBackendId,
): boolean;
