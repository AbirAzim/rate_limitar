import BaseAlgorithm from './BaseAlgorithm.js';

/**
 * Sliding Window Counter
 *
 * Keeps counts for the current and previous fixed windows and estimates the
 * number of requests in the last `windowMs` by weighting the previous window
 * by how much of it still overlaps the sliding window:
 *
 *   estimate = prevCount * (1 - elapsedInCurrent / windowMs) + currCount
 *
 * Accuracy: approximate (assumes the previous window's requests were evenly
 * spread), but removes most of the fixed-window boundary burst.
 * Memory: O(1) per key.
 */
export default class SlidingWindowCounter extends BaseAlgorithm {
  consume(key, now = Date.now()) {
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    let state = this.store.get(key);

    if (!state) {
      state = { windowStart, prevCount: 0, currCount: 0 };
      this.store.set(key, state);
    } else if (state.windowStart !== windowStart) {
      // Roll forward: the old current window becomes the previous one only if adjacent.
      const adjacent = windowStart - state.windowStart === this.windowMs;
      state.prevCount = adjacent ? state.currCount : 0;
      state.currCount = 0;
      state.windowStart = windowStart;
    }

    const elapsed = now - windowStart;
    const prevWeight = (this.windowMs - elapsed) / this.windowMs;
    const estimate = state.prevCount * prevWeight + state.currCount;

    if (estimate + 1 > this.max) {
      return { allowed: false, remaining: 0, resetMs: this.#retryAfterMs(state, elapsed) };
    }

    state.currCount += 1;
    return {
      allowed: true,
      remaining: Math.max(0, Math.floor(this.max - (estimate + 1))),
      resetMs: this.windowMs - elapsed,
    };
  }

  // Solve prevCount * (1 - t / windowMs) + currCount + 1 <= max for t.
  #retryAfterMs(state, elapsed) {
    const headroom = this.max - state.currCount - 1;
    if (headroom < 0 || state.prevCount === 0) {
      // Current window alone is full: wait for the next window.
      return this.windowMs - elapsed;
    }
    const t = this.windowMs * (1 - headroom / state.prevCount);
    return Math.max(1, Math.ceil(t - elapsed));
  }

  isExpired(state, now) {
    // Once two windows have passed, both counts contribute nothing.
    return state.windowStart + 2 * this.windowMs <= now;
  }
}
