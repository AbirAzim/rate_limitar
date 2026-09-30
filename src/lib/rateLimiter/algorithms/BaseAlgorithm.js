/**
 * Shared plumbing for in-memory rate limiting algorithms.
 *
 * Subclasses implement:
 *   consume(key, now) -> { allowed, remaining, resetMs }
 *   isExpired(state, now) -> boolean   (safe to evict from memory)
 *
 * `now` is injectable so algorithms can be unit tested without real timers.
 */
export default class BaseAlgorithm {
  constructor({ windowMs, max }) {
    if (!Number.isInteger(max) || max <= 0) throw new TypeError('max must be a positive integer');
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new TypeError('windowMs must be a positive number');
    }

    this.windowMs = windowMs;
    this.max = max;
    this.store = new Map();

    // Periodically evict stale keys so memory doesn't grow with every unique client.
    // unref() so this timer never keeps the process alive on shutdown.
    this.sweeper = setInterval(() => this.sweep(), windowMs);
    this.sweeper.unref();
  }

  sweep(now = Date.now()) {
    for (const [key, state] of this.store) {
      if (this.isExpired(state, now)) this.store.delete(key);
    }
  }

  reset(key) {
    this.store.delete(key);
  }

  stop() {
    clearInterval(this.sweeper);
    this.store.clear();
  }

  consume() {
    throw new Error('consume() not implemented');
  }

  isExpired() {
    throw new Error('isExpired() not implemented');
  }
}
