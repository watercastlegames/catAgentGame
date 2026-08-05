export type PmWorkerQuota = {
  day: string;
  used: number;
};

export declare const PM_WORKER_QUOTA_KEY: string;
export declare const PM_WORKER_DAILY_LIMIT: number;

export declare function seoulDayKey(now?: number): string;
export declare function parseQuota(
  raw: string | null,
  now?: number,
): PmWorkerQuota;
export declare function quotaRemaining(
  quota: PmWorkerQuota | null,
  limit?: number,
): number;
export declare function canUsePmWorker(
  quota: PmWorkerQuota | null,
  limit?: number,
): boolean;
export declare function consumeQuota(
  quota: PmWorkerQuota | null,
  now?: number,
  limit?: number,
): PmWorkerQuota;
export declare function readQuota(now?: number): PmWorkerQuota;
export declare function writeQuota(quota: PmWorkerQuota): void;
export declare function quotaNotice(
  quota: PmWorkerQuota | null,
  limit?: number,
): string;
