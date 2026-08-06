export class SessionListCache {
  constructor({ ttlMs = 4_000, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
  }

  get(key, loader) {
    const cached = this.entries.get(key);
    if (cached?.value !== undefined && this.now() - cached.savedAt < this.ttlMs) {
      return Promise.resolve(cached.value);
    }
    if (cached?.pending) return cached.pending;

    const pending = Promise.resolve()
      .then(loader)
      .then(
        (value) => {
          this.entries.set(key, {
            value,
            savedAt: this.now(),
            pending: null,
          });
          return value;
        },
        (error) => {
          if (this.entries.get(key)?.pending === pending) {
            this.entries.delete(key);
          }
          throw error;
        },
      );

    this.entries.set(key, {
      value: cached?.value,
      savedAt: cached?.savedAt ?? 0,
      pending,
    });
    return pending;
  }

  clear() {
    this.entries.clear();
  }
}
