import BaseAlgorithm from './BaseAlgorithm.js';

// Guards Math.ceil against floating point noise (e.g. 2.0000000001 -> 3)
const EPSILON = 1e-9;

/**
 * Leaky Bucket (as a queue / traffic shaper)
 *
 * Requests pour into a bucket that holds at most `max` of them and leaks
 * (processes) one every `windowMs / max` ms. Instead of letting a burst through
 * at once, each request is delayed until its turn, so downstream sees a smooth,
 * constant rate. When the bucket is full, the request is rejected.
 *
 * Implemented without an actual queue: we only track `nextFreeAt`, the time
 * the next request may leave the bucket. The number of waiting requests is
 * derived as (nextFreeAt - now) / leakIntervalMs.
 *
 * Returns `delayMs` — how long the caller must hold the request before
 * processing it.
 *
 * vs Token Bucket: same long-term rate, but token bucket lets bursts through
 * immediately; leaky bucket spreads them out.
 * Memory: O(1) per key.
 */
export default class LeakyBucket extends BaseAlgorithm {
  constructor(options) {
    super(options);
    this.leakIntervalMs = this.windowMs / this.max;
  }

  #level(nextFreeAt, now) {
    return Math.max(0, (nextFreeAt - now) / this.leakIntervalMs);
  }

  consume(key, now = Date.now()) {
    const state = this.store.get(key) ?? { nextFreeAt: now };
    const level = this.#level(state.nextFreeAt, now);

    if (level + 1 > this.max + EPSILON) {
      // Wait until enough has leaked to fit one more request
      const retryMs = (level + 1 - this.max) * this.leakIntervalMs;
      return { allowed: false, remaining: 0, resetMs: Math.ceil(retryMs), delayMs: 0 };
    }

    const startAt = Math.max(now, state.nextFreeAt);
    state.nextFreeAt = startAt + this.leakIntervalMs;
    this.store.set(key, state);

    const levelAfter = Math.ceil(this.#level(state.nextFreeAt, now) - EPSILON);
    return {
      allowed: true,
      remaining: Math.max(0, this.max - levelAfter),
      // Time until the bucket is completely empty
      resetMs: Math.ceil(state.nextFreeAt - now),
      delayMs: startAt - now,
    };
  }

  isExpired(state, now) {
    return state.nextFreeAt <= now;
  }
}
