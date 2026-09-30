import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { ALGORITHMS, createAlgorithm, createRateLimiter } from '../src/lib/rateLimiter/index.js';

const WINDOW = 1000;
const MAX = 5;
const created = [];

const make = (name, opts = {}) => {
  const limiter = createAlgorithm(name, { windowMs: WINDOW, max: MAX, ...opts });
  created.push(limiter);
  return limiter;
};

// Fire `n` requests at time `t`, return how many were allowed
const burst = (limiter, n, t, key = 'k') => {
  let allowed = 0;
  for (let i = 0; i < n; i += 1) if (limiter.consume(key, t).allowed) allowed += 1;
  return allowed;
};

after(() => created.forEach((l) => l.stop()));

describe('all algorithms (common contract)', () => {
  for (const name of Object.keys(ALGORITHMS)) {
    describe(name, () => {
      it('allows up to max, then rejects', () => {
        const l = make(name);
        assert.equal(burst(l, MAX + 3, 0), MAX);
        const res = l.consume('k', 0);
        assert.equal(res.allowed, false);
        assert.equal(res.remaining, 0);
        assert.ok(res.resetMs > 0);
      });

      it('tracks keys independently', () => {
        const l = make(name);
        assert.equal(burst(l, MAX, 0, 'a'), MAX);
        assert.equal(l.consume('b', 0).allowed, true);
      });

      it('recovers after enough time passes', () => {
        const l = make(name);
        burst(l, MAX, 0);
        assert.equal(l.consume('k', 0).allowed, false);
        assert.equal(l.consume('k', 3 * WINDOW).allowed, true);
      });

      it('decrements remaining', () => {
        const l = make(name);
        assert.equal(l.consume('k', 0).remaining, MAX - 1);
        assert.equal(l.consume('k', 0).remaining, MAX - 2);
      });

      it('sweep evicts stale keys', () => {
        const l = make(name);
        l.consume('k', 0);
        l.sweep(10 * WINDOW);
        assert.equal(l.store.size, 0);
      });
    });
  }

  it('rejects unknown algorithm', () => {
    assert.throws(() => createAlgorithm('nope', { windowMs: 1, max: 1 }), /Unknown rate limit/);
  });
});

describe('boundary behavior (why the algorithms differ)', () => {
  // max at the end of one window, then max at the start of the next
  const edgeBurst = (name) => {
    const l = make(name);
    return burst(l, MAX, WINDOW - 1) + burst(l, MAX, WINDOW);
  };

  it('fixed-window lets 2x max through at the boundary', () => {
    assert.equal(edgeBurst('fixed-window'), 2 * MAX);
  });

  it('sliding-window-log never exceeds max within any window', () => {
    assert.equal(edgeBurst('sliding-window-log'), MAX);
  });

  it('sliding-window-counter smooths the boundary burst', () => {
    assert.equal(edgeBurst('sliding-window-counter'), MAX);
  });

  it('token-bucket refills gradually', () => {
    const l = make('token-bucket');
    burst(l, MAX, 0);
    // One token refills every WINDOW / MAX = 200ms
    assert.equal(l.consume('k', 199).allowed, false);
    assert.equal(l.consume('k', 200).allowed, true);
    assert.equal(l.consume('k', 200).allowed, false);
  });

  it('sliding-window-log frees a slot exactly when the oldest request expires', () => {
    const l = make('sliding-window-log');
    l.consume('k', 0);
    burst(l, MAX - 1, 500);
    const rejected = l.consume('k', 600);
    assert.equal(rejected.allowed, false);
    assert.equal(rejected.resetMs, 400);
    assert.equal(l.consume('k', 1000).allowed, true);
  });
});

describe('createRateLimiter middleware', () => {
  const buildApp = (algorithm) => {
    const app = express();
    const limiter = createRateLimiter({
      algorithm,
      windowMs: 60_000,
      max: 2,
      onLimitReached: (req, res) => res.status(429).json({ success: false }),
    });
    created.push(limiter.limiter);
    app.use(limiter);
    app.get('/', (req, res) => res.json({ ok: true }));
    return app;
  };

  it('sets RateLimit headers and returns 429 with Retry-After', async () => {
    const app = buildApp('fixed-window');

    const first = await request(app).get('/').expect(200);
    assert.equal(first.headers['ratelimit-limit'], '2');
    assert.equal(first.headers['ratelimit-remaining'], '1');
    assert.ok(Number(first.headers['ratelimit-reset']) > 0);

    await request(app).get('/').expect(200);

    const blocked = await request(app).get('/').expect(429);
    assert.equal(blocked.headers['ratelimit-remaining'], '0');
    assert.ok(Number(blocked.headers['retry-after']) > 0);
  });
});
