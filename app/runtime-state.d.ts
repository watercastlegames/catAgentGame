export type SeatId = "seat-1" | "seat-2" | "seat-3" | "seat-4";

export const SEAT_ORDER: SeatId[];

export type RuntimeIdentity = {
  threadId: string;
  taskId?: string | null;
  seatId: SeatId | "queue";
};

export type RuntimeEventIdentity = {
  threadId?: string | null;
  taskId?: string | null;
};

export function resolveRuntimeKey(
  event: RuntimeEventIdentity,
  taskToThread: ReadonlyMap<string, string>,
): string | null;

export function assignSeat(
  runtimes: Readonly<Record<string, RuntimeIdentity>>,
  runtimeKey: string,
  savedAssignments: Readonly<Record<string, SeatId>>,
): SeatId | "queue";

export function rekeyRuntime<T extends RuntimeIdentity>(
  runtimes: Readonly<Record<string, T>>,
  previousKey: string,
  nextThreadId: string,
): Readonly<Record<string, T>>;

export function enqueueUniqueApproval<T extends { requestId?: string }>(
  queue: readonly T[],
  approval: T,
): readonly T[];

export function removeApproval<T extends { requestId?: string }>(
  queue: readonly T[],
  requestId?: string,
): readonly T[];
