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
│                               # SlidingWindowCounter, TokenBucket
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

| Algorithm                          | Accuracy                           | Memory / key | Notes                                     |
| ---------------------------------- | ---------------------------------- | ------------ | ----------------------------------------- |
| `fixed-window`                     | Up to 2x `max` at window boundary  | O(1)         | Simplest                                  |
| `sliding-window-log`               | Exact                              | O(max)       | Stores every request timestamp            |
| `sliding-window-counter` (default) | Close approximation                | O(1)         | Weighted previous + current window counts |
| `token-bucket`                     | Exact average rate, bursts ≤ `max` | O(1)         | Refills `max / windowMs` tokens per ms    |

Responses carry `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `RateLimit-Policy`,
and `Retry-After` on 429. State is in-memory per process; for multiple instances, back the
algorithms with a shared store (e.g. Redis) instead of the `Map`.

## Docker

```bash
docker build -t rate_limitar .
docker run -p 3000:3000 --env-file .env rate_limitar
```
