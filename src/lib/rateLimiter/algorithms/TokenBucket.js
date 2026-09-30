import BaseAlgorithm from './BaseAlgorithm.js';

/**
 * Token Bucket
 *
 * Each key has a bucket holding up to `max` tokens. Tokens refill continuously
 * at `max / windowMs` per millisecond. Each request spends one token; with no
 * tokens left the request is rejected.
 *
 * Behavior: allows short bursts up to `max`, while enforcing an average rate
 * of `max` per `windowMs` over time.
 * Memory: O(1) per key.
 */
export default class TokenBucket extends BaseAlgorithm {
  constructor(options) {
    super(options);
    this.refillPerMs = this.max / this.windowMs;
  }

  consume(key, now = Date.now()) {
    let bucket = this.store.get(key);

    if (!bucket) {
      bucket = { tokens: this.max, lastRefill: now };
      this.store.set(key, bucket);
    } else {
      const elapsed = now - bucket.lastRefill;
      bucket.tokens = Math.min(this.max, bucket.tokens + elapsed * this.refillPerMs);
      bucket.lastRefill = now;
    }

    if (bucket.tokens < 1) {
      const msUntilToken = Math.ceil((1 - bucket.tokens) / this.refillPerMs);
      return { allowed: false, remaining: 0, resetMs: msUntilToken };
    }

    bucket.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      // Time until the bucket is completely full again
      resetMs: Math.ceil((this.max - bucket.tokens) / this.refillPerMs),
    };
  }

  isExpired(bucket, now) {
    // A bucket that would be full again is identical to a fresh one.
    return bucket.tokens + (now - bucket.lastRefill) * this.refillPerMs >= this.max;
  }
}
