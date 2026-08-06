import type { SeatId } from "./agent-world-3d";

export type CatSessionBindings = Partial<Record<SeatId, string>>;

export const CAT_SESSION_BINDINGS_STORAGE_KEY: string;
export function parseCatSessionBindings(value: unknown): CatSessionBindings;
export function migrateRuntimeAssignments(
  assignments: Record<string, SeatId> | null | undefined,
): CatSessionBindings;
export function bindSessionToCat(
  bindings: CatSessionBindings,
  seatId: SeatId,
  threadId: string,
): CatSessionBindings;
export function unbindSessionFromCat(
  bindings: CatSessionBindings,
  seatId: SeatId,
): CatSessionBindings;
export function seatForSession(
  bindings: CatSessionBindings,
  threadId: string | null | undefined,
): SeatId | null;
