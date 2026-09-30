import BaseAlgorithm from './BaseAlgorithm.js';

/**
 * Fixed Window Counter
 *
 * Time is split into windows aligned to the clock (e.g. 12:00–12:15, 12:15–12:30).
 * Each key has one counter per window; it resets when a new window begins.
 *
 * Memory: O(1) per key.
 * Weakness: up to 2x `max` can pass around a window boundary.
 */
export default class FixedWindow extends BaseAlgorithm {
  consume(key, now = Date.now()) {
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    let state = this.store.get(key);

    if (!state || state.windowStart !== windowStart) {
      state = { windowStart, count: 0 };
      this.store.set(key, state);
    }

    const resetMs = windowStart + this.windowMs - now;

    if (state.count >= this.max) {
      return { allowed: false, remaining: 0, resetMs };
    }

    state.count += 1;
    return { allowed: true, remaining: this.max - state.count, resetMs };
  }

  isExpired(state, now) {
    return state.windowStart + this.windowMs <= now;
  }
}
