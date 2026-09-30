import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import {
  ALGORITHMS,
  createAlgorithm,
  createRateLimiter,
  ipToKey,
} from '../src/lib/rateLimiter/index.js';
import { connectTestRedis, deleteKeys, testPrefix } from './helpers/redis.js';

const WINDOW = 1000;
const MAX = 5;
const created = [];

const redis = await connectTestRedis();
const redisPrefix = testPrefix();

after(async () => {
  created.forEach((l) => l.stop());
  if (redis) {
    await deleteKeys(redis, redisPrefix);
    await redis.quit();
  }
});

// Fire `n` requests at time `t`, return how many were allowed
const burst = async (limiter, n, t, key = 'k') => {
  let allowed = 0;
  for (let i = 0; i < n; i += 1) if ((await limiter.consume(key, t)).allowed) allowed += 1;
  return allowed;
};

/**
 * The same behavioral tests run against every store, proving the Redis Lua
 * scripts behave exactly like the in-memory algorithms.
 */
const algorithmSuite = (store, makeLimiter) => {
  let n = 0;
  // Fresh key namespace per limiter so tests don't share state
  const make = (name) => makeLimiter(name, `${(n += 1)}:`);

  describe(`[${store}] all algorithms (common contract)`, () => {
    for (const name of Object.keys(ALGORITHMS)) {
      describe(name, () => {
        it('allows up to max, then rejects', async () => {
          const l = make(name);
          assert.equal(await burst(l, MAX + 3, 0), MAX);
          const res = await l.consume('k', 0);
          assert.equal(res.allowed, false);
          assert.equal(res.remaining, 0);
          assert.ok(res.resetMs > 0);
        });

        it('tracks keys independently', async () => {
          const l = make(name);
          assert.equal(await burst(l, MAX, 0, 'a'), MAX);
          assert.equal((await l.consume('b', 0)).allowed, true);
        });

        it('recovers after enough time passes', async () => {
          const l = make(name);
          await burst(l, MAX, 0);
          assert.equal((await l.consume('k', 0)).allowed, false);
          assert.equal((await l.consume('k', 3 * WINDOW)).allowed, true);
        });

        it('decrements remaining', async () => {
          const l = make(name);
          assert.equal((await l.consume('k', 0)).remaining, MAX - 1);
          assert.equal((await l.consume('k', 0)).remaining, MAX - 2);
        });
      });
    }
  });

  describe(`[${store}] boundary behavior (why the algorithms differ)`, () => {
    // max at the end of one window, then max at the start of the next
    const edgeBurst = async (name) => {
      const l = make(name);
      return (await burst(l, MAX, WINDOW - 1)) + (await burst(l, MAX, WINDOW));
    };

    it('fixed-window lets 2x max through at the boundary', async () => {
      assert.equal(await edgeBurst('fixed-window'), 2 * MAX);
    });

    it('sliding-window-log never exceeds max within any window', async () => {
      assert.equal(await edgeBurst('sliding-window-log'), MAX);
    });

    it('sliding-window-counter smooths the boundary burst', async () => {
      assert.equal(await edgeBurst('sliding-window-counter'), MAX);
    });

    it('token-bucket refills gradually', async () => {
      const l = make('token-bucket');
      await burst(l, MAX, 0);
      // One token refills every WINDOW / MAX = 200ms
      assert.equal((await l.consume('k', 199)).allowed, false);
      assert.equal((await l.consume('k', 200)).allowed, true);
      assert.equal((await l.consume('k', 200)).allowed, false);
    });

    it('leaky-bucket queues a burst and releases it at a constant rate', async () => {
      const l = make('leaky-bucket');
      // Leak interval = WINDOW / MAX = 200ms
      const delays = [];
      for (let i = 0; i < MAX; i += 1) delays.push((await l.consume('k', 0)).delayMs);
      assert.deepEqual(delays, [0, 200, 400, 600, 800]);

      const full = await l.consume('k', 0);
      assert.equal(full.allowed, false);
      assert.equal(full.resetMs, 200); // one slot leaks after 200ms

      const next = await l.consume('k', 200);
      assert.equal(next.allowed, true);
      assert.equal(next.delayMs, 800); // queued behind the 4 still waiting
    });

    it('sliding-window-log frees a slot exactly when the oldest request expires', async () => {
      const l = make('sliding-window-log');
      await l.consume('k', 0);
      await burst(l, MAX - 1, 500);
      const rejected = await l.consume('k', 600);
      assert.equal(rejected.allowed, false);
      assert.equal(rejected.resetMs, 400);
      assert.equal((await l.consume('k', 1000)).allowed, true);
    });
  });
};

algorithmSuite('memory', (name) => {
  const limiter = createAlgorithm(name, { windowMs: WINDOW, max: MAX });
  created.push(limiter);
  return limiter;
});

if (redis) {
  algorithmSuite('redis', (name, ns) =>
    createAlgorithm(name, { windowMs: WINDOW, max: MAX, redis, prefix: redisPrefix + ns }),
  );
} else {
  it('[redis] algorithm suite', { skip: 'no Redis at REDIS_TEST_URL / localhost:6379' });
}

describe('[memory] cleanup', () => {
  for (const name of Object.keys(ALGORITHMS)) {
    it(`${name}: sweep evicts stale keys`, () => {
      const l = createAlgorithm(name, { windowMs: WINDOW, max: MAX });
      created.push(l);
      l.consume('k', 0);
      l.sweep(10 * WINDOW);
      assert.equal(l.store.size, 0);
    });
  }

  it('rejects unknown algorithm', () => {
    assert.throws(() => createAlgorithm('nope', { windowMs: 1, max: 1 }), /Unknown rate limit/);
  });
});

describe('[redis] store behavior', { skip: !redis && 'no Redis available' }, () => {
  it('shares state between limiter instances (like multiple app servers)', async () => {
    const opts = { windowMs: 60_000, max: 3, redis, prefix: `${redisPrefix}shared:` };
    const serverA = createAlgorithm('sliding-window-counter', opts);
    const serverB = createAlgorithm('sliding-window-counter', opts);

    assert.equal((await serverA.consume('ip')).allowed, true);
    assert.equal((await serverB.consume('ip')).allowed, true);
    assert.equal((await serverA.consume('ip')).allowed, true);
    assert.equal((await serverB.consume('ip')).allowed, false); // 4th overall
  });

  it('sets a TTL so Redis cleans up keys itself', async () => {
    const prefix = `${redisPrefix}ttl:`;
    const l = createAlgorithm('token-bucket', { windowMs: 5000, max: 5, redis, prefix });
    await l.consume('ip');
    const ttl = await redis.pttl(`${prefix}token-bucket:ip`);
    assert.ok(ttl > 0 && ttl <= 5000, `expected TTL, got ${ttl}`);
  });

  it('is atomic under concurrent requests', async () => {
    const l = createAlgorithm('fixed-window', {
      windowMs: 60_000,
      max: 10,
      redis,
      prefix: `${redisPrefix}race:`,
    });
    const results = await Promise.all(Array.from({ length: 50 }, () => l.consume('ip')));
    assert.equal(results.filter((r) => r.allowed).length, 10);
  });
});

describe('fail open', () => {
  it('allows requests when the store is down', async () => {
    const errors = [];
    const brokenRedis = {
      defineCommand() {},
      rateLimit_fixed_window: async () => {
        throw new Error('Connection is closed.');
      },
    };
    const app = express();
    app.use(
      createRateLimiter({
        algorithm: 'fixed-window',
        windowMs: 1000,
        max: 1,
        redis: brokenRedis,
        onLimitReached: (req, res) => res.status(429).end(),
        onStoreError: (err) => errors.push(err.message),
      }),
    );
    app.get('/', (req, res) => res.end());

    await request(app).get('/').expect(200);
    await request(app).get('/').expect(200);
    assert.deepEqual(errors, ['Connection is closed.', 'Connection is closed.']);
  });
});

describe('createRateLimiter middleware', () => {
  const buildApp = (algorithm) => {
    const app = express();
    app.set('trust proxy', 1);
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

describe('per-IP limiting', () => {
  it('each IP gets its own limit', async () => {
    const app = express();
    app.set('trust proxy', 1);
    const limiter = createRateLimiter({
      algorithm: 'token-bucket',
      windowMs: 60_000,
      max: 1,
      onLimitReached: (req, res) => res.status(429).end(),
    });
    created.push(limiter.limiter);
    app.use(limiter);
    app.get('/', (req, res) => res.end());

    const as = (ip) => request(app).get('/').set('X-Forwarded-For', ip);

    await as('1.1.1.1').expect(200);
    await as('1.1.1.1').expect(429);
    await as('2.2.2.2').expect(200); // different user unaffected
    await as('::ffff:1.1.1.1').expect(429); // same IPv4, mapped form
    await as('2001:db8::1').expect(200);
    await as('2001:db8::abcd').expect(429); // same /64
    await as('2001:db8:0:1::1').expect(200); // different /64
  });
});

describe('ipToKey', () => {
  const cases = [
    ['1.2.3.4', '1.2.3.4'],
    ['::ffff:1.2.3.4', '1.2.3.4'],
    ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['2001:0db8:0001:0002::', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    [undefined, 'unknown'],
  ];
  for (const [ip, key] of cases) {
    it(`${ip} -> ${key}`, () => assert.equal(ipToKey(ip), key));
  }

  it('supports custom prefix lengths', () => {
    assert.equal(ipToKey('2001:db8:abcd:1234::1', 48), '2001:db8:abcd::/48');
    assert.equal(ipToKey('2001:db8:abff::1', 40), '2001:db8:ab00::/40');
    assert.equal(ipToKey('2001:db8::1', 128), '2001:db8:0:0:0:0:0:1::/128');
  });
});

describe('leaky-bucket middleware', () => {
  it('delays queued requests instead of passing them at once', async () => {
    const app = express();
    const limiter = createRateLimiter({
      algorithm: 'leaky-bucket',
      windowMs: 300,
      max: 3, // one request leaks every 100ms
      onLimitReached: (req, res) => res.status(429).end(),
    });
    created.push(limiter.limiter);
    app.use(limiter);
    app.get('/', (req, res) => res.json({ at: Date.now() }));

    const start = Date.now();
    const results = await Promise.all([1, 2, 3, 4].map(() => request(app).get('/')));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 200, 200, 429]);

    const times = results
      .filter((r) => r.status === 200)
      .map((r) => r.body.at - start)
      .sort((a, b) => a - b);
    assert.ok(times[2] - times[0] >= 190, `expected spacing, got ${times}`);
  });
});
