import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('/api/v1'),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  RATE_LIMIT_ALGORITHM: z
    .enum([
      'fixed-window',
      'sliding-window-log',
      'sliding-window-counter',
      'token-bucket',
      'leaky-bucket',
    ])
    .default('sliding-window-counter'),
  RATE_LIMIT_IPV6_SUBNET: z.coerce.number().int().min(1).max(128).default(64),
  // Number of reverse proxies in front of the app (0 = exposed directly).
  // Must match your infra, otherwise clients can spoof X-Forwarded-For.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Default: 3 requests per second per client
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(3),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

const env = parsed.data;

const config = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  host: env.HOST,
  apiPrefix: env.API_PREFIX,
  cors: {
    origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  },
  trustProxy: env.TRUST_PROXY,
  logLevel: env.LOG_LEVEL,
  rateLimit: {
    algorithm: env.RATE_LIMIT_ALGORITHM,
    ipv6Subnet: env.RATE_LIMIT_IPV6_SUBNET,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
  },
  shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
});

export default config;
