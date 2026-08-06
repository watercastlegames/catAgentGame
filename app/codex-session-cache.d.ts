export type CachedCodexSession = {
  id: string;
  sessionId: string;
  provider: "codex" | "claude";
  title: string;
  preview: string;
  projectName: string;
  status: string;
  activeFlags: string[];
  source: string;
  modelProvider: string;
  updatedAt: string;
  createdAt: string;
  ephemeral: boolean;
  canAcceptDirectInput: boolean;
};

export const CODEX_SESSION_CACHE_KEY: string;
export function readCodexSessionCache(
  value: unknown,
  now?: number,
): CachedCodexSession[];
export function writeCodexSessionCache(
  sessions: readonly CachedCodexSession[],
  now?: number,
): string;
