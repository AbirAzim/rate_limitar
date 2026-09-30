import BaseAlgorithm from './BaseAlgorithm.js';

/**
 * Sliding Window Log
 *
 * Stores the timestamp of every accepted request. A request is allowed when
 * fewer than `max` timestamps fall inside the last `windowMs`.
 *
 * Accuracy: exact — no boundary bursts.
 * Memory: O(max) per key.
 */
export default class SlidingWindowLog extends BaseAlgorithm {
  consume(key, now = Date.now()) {
    let log = this.store.get(key);
    if (!log) {
      log = [];
      this.store.set(key, log);
    }

    // Timestamps are appended in order, so expired ones are always at the front.
    const cutoff = now - this.windowMs;
    let expired = 0;
    while (expired < log.length && log[expired] <= cutoff) expired += 1;
    if (expired) log.splice(0, expired);

    if (log.length >= this.max) {
      // A slot frees up when the oldest request leaves the window.
      return { allowed: false, remaining: 0, resetMs: log[0] + this.windowMs - now };
    }

    log.push(now);
    return {
      allowed: true,
      remaining: this.max - log.length,
      resetMs: log[0] + this.windowMs - now,
    };
  }

  isExpired(log, now) {
    return log.length === 0 || log[log.length - 1] + this.windowMs <= now;
  }
}
