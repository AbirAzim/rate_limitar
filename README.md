# rate_limitar

Production-grade Express 5 CRUD template. No database — each service method logs the
operation and returns JSON, so you can drop in a real data layer later.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev        # watch mode
npm start          # production
npm test           # node:test + supertest
npm run lint
```

## Structure

```
src/
├── server.js                 # Entry: starts HTTP server, graceful shutdown, process handlers
├── app.js                    # Express app factory (middleware + routes), importable by tests
├── config/index.js           # Env loading + validation (zod), frozen config object
├── routes/
│   ├── index.js              # Mounts all feature modules under API_PREFIX
│   └── health.routes.js      # GET /health liveness probe
├── modules/                  # Feature-first: one folder per resource
│   └── user/
│       ├── user.routes.js      # HTTP verbs → validation → controller
│       ├── user.controller.js  # req/res handling only
│       ├── user.service.js     # Business logic (replace console log with DB calls)
│       └── user.validation.js  # zod schemas for params/query/body
├── lib/rateLimiter/           # Hand-written rate limiter (no external package)
│   ├── index.js                # createRateLimiter() middleware factory + algorithm registry
│   └── algorithms/             # BaseAlgorithm, FixedWindow, SlidingWindowLog,
│                               # SlidingWindowCounter, TokenBucket, LeakyBucket
├── middlewares/              # requestId, requestLogger, validate, rateLimiter, notFound, errorHandler
└── utils/                    # logger, ApiError, ApiResponse
tests/                        # Integration tests against createApp()
```

## Endpoints (`/api/v1/users`)

| Method | Path   | Body                            |
| ------ | ------ | ------------------------------- |
| GET    | `/`    | — (`?page=&limit=`)             |
| GET    | `/:id` | —                               |
| POST   | `/`    | `{ name, email }`               |
| PUT    | `/:id` | `{ name, email }`               |
| PATCH  | `/:id` | any subset of `{ name, email }` |
| DELETE | `/:id` | —                               |

Success response shape:

```json
{ "success": true, "message": "...", "data": {}, "requestId": "...", "timestamp": "..." }
```

## Adding a new resource

1. Copy `src/modules/user` to `src/modules/<name>` and rename.
2. Register it in `src/routes/index.js`: `router.use('/<name>s', <name>Routes)`.

## Rate limiting

Implemented from scratch in `src/lib/rateLimiter`. Pick the algorithm with `RATE_LIMIT_ALGORITHM`:

| Algorithm                          | Accuracy                           | Memory / key | Notes                                               |
| ---------------------------------- | ---------------------------------- | ------------ | --------------------------------------------------- |
| `fixed-window`                     | Up to 2x `max` at window boundary  | O(1)         | Simplest                                            |
| `sliding-window-log`               | Exact                              | O(max)       | Stores every request timestamp                      |
| `sliding-window-counter` (default) | Close approximation                | O(1)         | Weighted previous + current window counts           |
| `token-bucket`                     | Exact average rate, bursts ≤ `max` | O(1)         | Refills `max / windowMs` tokens per ms              |
| `leaky-bucket`                     | Constant output rate, no bursts    | O(1)         | Queues up to `max`, delays each by `windowMs / max` |

Limits are applied **per client IP** (`src/lib/rateLimiter/ipKey.js`): IPv4-mapped IPv6 is collapsed
to IPv4, and IPv6 is grouped by `/64` (`RATE_LIMIT_IPV6_SUBNET`) so a user can't rotate addresses
to reset their limit. Set `TRUST_PROXY` to the number of proxies in front of the app so `req.ip`
is the real client IP and `X-Forwarded-For` can't be spoofed.

Responses carry `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `RateLimit-Policy`,
and `Retry-After` on 429.

### Store: memory or Redis/Valkey

| `REDIS_URL` | Store                                  | Use when                                    |
| ----------- | -------------------------------------- | ------------------------------------------- |
| unset       | In-memory `Map` per process            | Single instance, local dev                  |
| set         | Redis/Valkey, shared by every instance | Multiple instances, limits survive restarts |

- Each algorithm has a Lua script in `src/lib/rateLimiter/redis/scripts/`, so read-check-update
  is atomic across instances, and uses the Redis server clock so instances agree on time.
- Keys look like `ratelimit:<algorithm>:<ip>` and expire on their own (TTL).
- **Fails open**: if Redis is down or slower than `REDIS_COMMAND_TIMEOUT_MS` (default 200ms),
  requests are allowed and an error is logged.
- `GET /health` shows `rateLimitStore` and the Redis connection status.
- Tests run the same suite against both stores; Redis tests use `REDIS_TEST_URL`
  (default `redis://localhost:6379`) and are skipped if it's unreachable.

## Docker

With Valkey (recommended, shared rate limit store):

```bash
docker compose up --build
```

Standalone:

```bash
docker build -t rate_limitar .
docker run -p 3000:3000 --env-file .env rate_limitar
```
