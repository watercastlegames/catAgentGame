"use client";

import type { CatNeedsStore } from "./cat-needs";

const SYNC_QUEUE_KEY = "agent-forest-cloud-sync-queue-v1";
const SYNC_IMPORTED_KEY = "agent-forest-cloud-sync-imported-v1";
const FLUSH_DELAY_MS = 1_200;

export type CloudDecorState = {
  ownedItemIds: string[];
  seats: Record<string, unknown>;
  updatedAt: number;
};

export type CloudPlayerState = {
  shellBalance: number;
  catNeeds: CatNeedsStore;
  decor: CloudDecorState | null;
};

type ShellDelta = {
  id: string;
  amount: number;
  reason: string;
  appliedAt: number;
};

type SyncQueue = {
  shellDeltas: ShellDelta[];
  catNeeds: CatNeedsStore | null;
  decor: CloudDecorState | null;
};

const EMPTY_QUEUE: SyncQueue = {
  shellDeltas: [],
  catNeeds: null,
  decor: null,
};

function readQueue(): SyncQueue {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SYNC_QUEUE_KEY) ?? "{}",
    ) as Partial<SyncQueue>;
    return {
      shellDeltas: Array.isArray(parsed.shellDeltas)
        ? parsed.shellDeltas.filter(
            (item): item is ShellDelta =>
              Boolean(
                item &&
                  typeof item.id === "string" &&
                  Number.isFinite(Number(item.amount)),
              ),
          )
        : [],
      catNeeds:
        parsed.catNeeds && typeof parsed.catNeeds === "object"
          ? parsed.catNeeds
          : null,
      decor:
        parsed.decor && typeof parsed.decor === "object"
          ? parsed.decor
          : null,
    };
  } catch {
    return { ...EMPTY_QUEUE };
  }
}

function writeQueue(queue: SyncQueue) {
  window.localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

function mergeCatNeeds(local: CatNeedsStore, remote: CatNeedsStore) {
  const merged: CatNeedsStore = { ...remote };
  for (const [threadId, localState] of Object.entries(local)) {
    const remoteState = merged[threadId];
    if (
      !remoteState ||
      localState.lastComputedAt >= remoteState.lastComputedAt
    ) {
      merged[threadId] = localState;
    }
  }
  return merged;
}

export function createPlayerCloudSync() {
  let disposed = false;
  let flushTimer: number | null = null;
  let flushing: Promise<void> | null = null;
  let queue = readQueue();

  const scheduleFlush = () => {
    if (disposed || flushTimer !== null) return;
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void flush();
    }, FLUSH_DELAY_MS);
  };

  const flush = async () => {
    if (disposed || flushing) return flushing;
    if (
      queue.shellDeltas.length === 0 &&
      !queue.catNeeds &&
      !queue.decor
    ) {
      return;
    }
    const snapshot = queue;
    flushing = fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
      keepalive: true,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const sentIds = new Set(snapshot.shellDeltas.map((item) => item.id));
        queue = {
          shellDeltas: queue.shellDeltas.filter(
            (item) => !sentIds.has(item.id),
          ),
          catNeeds:
            queue.catNeeds === snapshot.catNeeds ? null : queue.catNeeds,
          decor: queue.decor === snapshot.decor ? null : queue.decor,
        };
        writeQueue(queue);
      })
      .catch(() => undefined)
      .finally(() => {
        flushing = null;
        if (
          queue.shellDeltas.length > 0 ||
          queue.catNeeds ||
          queue.decor
        ) {
          scheduleFlush();
        }
      });
    return flushing;
  };

  const handleVisibility = () => {
    if (document.visibilityState === "hidden") void flush();
  };
  document.addEventListener("visibilitychange", handleVisibility);

  return {
    async bootstrap(local: CloudPlayerState): Promise<CloudPlayerState | null> {
      try {
        const response = await fetch("/api/sync/bootstrap", {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return null;
        const payload = (await response.json()) as {
          authenticated?: boolean;
          state?: CloudPlayerState;
        };
        if (!payload.authenticated || !payload.state) return null;
        const remote = payload.state;
        const imported =
          window.localStorage.getItem(SYNC_IMPORTED_KEY) === "done";
        if (!imported) {
          const initialDelta = Math.round(
            local.shellBalance - remote.shellBalance,
          );
          if (initialDelta !== 0) {
            queue.shellDeltas.push({
              id: crypto.randomUUID(),
              amount: initialDelta,
              reason: "initial-local-import",
              appliedAt: Date.now(),
            });
          }
          window.localStorage.setItem(SYNC_IMPORTED_KEY, "done");
        }
        const pendingShellDelta = queue.shellDeltas.reduce(
          (sum, item) => sum + item.amount,
          0,
        );
        const merged: CloudPlayerState = {
          shellBalance: remote.shellBalance + pendingShellDelta,
          catNeeds: mergeCatNeeds(
            queue.catNeeds ?? local.catNeeds,
            remote.catNeeds ?? {},
          ),
          decor:
            queue.decor &&
            (!remote.decor ||
              queue.decor.updatedAt >= remote.decor.updatedAt)
              ? queue.decor
              : (remote.decor ?? local.decor),
        };
        queue.catNeeds = merged.catNeeds;
        queue.decor = merged.decor;
        writeQueue(queue);
        scheduleFlush();
        return merged;
      } catch {
        return null;
      }
    },
    recordShellDelta(amount: number, reason = "balance-change") {
      const normalized = Math.round(amount);
      if (!Number.isFinite(normalized) || normalized === 0) return;
      queue.shellDeltas.push({
        id: crypto.randomUUID(),
        amount: normalized,
        reason,
        appliedAt: Date.now(),
      });
      writeQueue(queue);
      scheduleFlush();
    },
    recordCatNeeds(catNeeds: CatNeedsStore) {
      queue.catNeeds = catNeeds;
      writeQueue(queue);
      scheduleFlush();
    },
    recordDecor(decor: CloudDecorState) {
      queue.decor = decor;
      writeQueue(queue);
      scheduleFlush();
    },
    flush,
    dispose() {
      void flush();
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      flushTimer = null;
    },
  };
}

export type PlayerCloudSync = ReturnType<typeof createPlayerCloudSync>;
