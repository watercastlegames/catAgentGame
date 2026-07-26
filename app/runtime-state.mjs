export const SEAT_ORDER = ["seat-1", "seat-2", "seat-3", "seat-4"];

export function resolveRuntimeKey(event, taskToThread) {
  if (event.threadId) return event.threadId;
  if (event.taskId) {
    return taskToThread.get(event.taskId) ?? `pending:${event.taskId}`;
  }
  return null;
}

export function assignSeat(runtimes, runtimeKey, savedAssignments) {
  const occupied = new Set(
    Object.entries(runtimes)
      .filter(([key]) => key !== runtimeKey)
      .map(([, runtime]) => runtime.seatId)
      .filter((seat) => seat !== "queue"),
  );
  const saved = savedAssignments[runtimeKey];
  if (saved && !occupied.has(saved)) return saved;
  return SEAT_ORDER.find((seat) => !occupied.has(seat)) ?? "queue";
}

export function rekeyRuntime(runtimes, previousKey, nextThreadId) {
  if (previousKey === nextThreadId || !runtimes[previousKey]) return runtimes;
  const next = { ...runtimes };
  const previous = next[previousKey];
  delete next[previousKey];
  next[nextThreadId] = { ...previous, threadId: nextThreadId };
  return next;
}

export function enqueueUniqueApproval(queue, approval) {
  if (
    approval.requestId &&
    queue.some((item) => item.requestId === approval.requestId)
  ) {
    return queue;
  }
  return [...queue, approval];
}

export function removeApproval(queue, requestId) {
  if (!requestId) return queue;
  return queue.filter((item) => item.requestId !== requestId);
}
