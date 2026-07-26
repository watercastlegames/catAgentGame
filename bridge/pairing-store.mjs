import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const STORE_VERSION = 1;

function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function constantTimeHexEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export class PairingStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = this.#load();
  }

  #load() {
    if (existsSync(this.filePath)) {
      try {
        const parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
        if (
          parsed?.version === STORE_VERSION &&
          /^\d{6}$/.test(String(parsed.pairingCode ?? ""))
        ) {
          return {
            version: STORE_VERSION,
            pairingCode: String(parsed.pairingCode),
            tokenHashes: Array.isArray(parsed.tokenHashes)
              ? parsed.tokenHashes.filter((value) =>
                  /^[a-f0-9]{64}$/i.test(String(value)),
                )
              : [],
          };
        }
      } catch {
        // Replace malformed local state with a fresh, valid store.
      }
    }
    const state = {
      version: STORE_VERSION,
      pairingCode: String(randomInt(100_000, 1_000_000)),
      tokenHashes: [],
    };
    this.#save(state);
    return state;
  }

  #save(state = this.state) {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporaryPath, this.filePath);
  }

  get pairingCode() {
    return this.state.pairingCode;
  }

  hasToken(token) {
    if (!token) return false;
    const candidate = hashToken(token);
    return this.state.tokenHashes.some((stored) =>
      constantTimeHexEqual(stored, candidate),
    );
  }

  addToken(token) {
    const digest = hashToken(token);
    if (!this.state.tokenHashes.includes(digest)) {
      this.state.tokenHashes.push(digest);
      this.state.tokenHashes = this.state.tokenHashes.slice(-24);
      this.#save();
    }
  }
}

export class PairingAttemptLimiter {
  constructor({ limit = 20, windowMs = 10 * 60_000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.attempts = new Map();
  }

  check(key, now = Date.now()) {
    const recent = (this.attempts.get(key) ?? []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    );
    if (recent.length >= this.limit) {
      this.attempts.set(key, recent);
      return false;
    }
    recent.push(now);
    this.attempts.set(key, recent);
    return true;
  }

  clear(key) {
    this.attempts.delete(key);
  }
}

export function pairingStoreContainsPlaintext(filePath, token) {
  if (!existsSync(filePath) || !token) return false;
  return readFileSync(filePath, "utf8").includes(token);
}
