-- Shared prelude, prepended to every rate limit script.
--
-- Arguments (same for all algorithms):
--   KEYS[1]  rate limit key (already prefixed)
--   ARGV[1]  windowMs
--   ARGV[2]  max
--   ARGV[3]  now in ms (optional; empty = use the Redis server clock)
--
-- Every script returns: { allowed (1/0), remaining, resetMs, delayMs }
-- Values must be integers: Redis truncates Lua numbers to integers on reply.

local key = KEYS[1]
local window = tonumber(ARGV[1])
local max = tonumber(ARGV[2])

local now
if ARGV[3] and ARGV[3] ~= '' then
  now = tonumber(ARGV[3])
else
  -- Use Redis' clock so every app instance agrees on the time
  local t = redis.call('TIME')
  now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
end
