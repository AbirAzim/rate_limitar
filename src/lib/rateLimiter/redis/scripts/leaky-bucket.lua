-- Leaky Bucket (queue): holds up to `max` requests, releases one every window / max ms.
-- Only `nextFreeAt` is stored; queue length is derived from it.
local EPSILON = 1e-9
local leakIntervalMs = window / max
local nextFreeAt = tonumber(redis.call('GET', key)) or now
local level = math.max(0, (nextFreeAt - now) / leakIntervalMs)

if level + 1 > max + EPSILON then
  return { 0, 0, math.ceil((level + 1 - max) * leakIntervalMs), 0 }
end

local startAt = math.max(now, nextFreeAt)
nextFreeAt = startAt + leakIntervalMs
-- Key expires exactly when the bucket is empty again
redis.call('SET', key, nextFreeAt, 'PX', math.ceil(nextFreeAt - now))

local levelAfter = math.ceil((nextFreeAt - now) / leakIntervalMs - EPSILON)
return {
  1,
  math.max(0, max - levelAfter),
  math.ceil(nextFreeAt - now),
  math.ceil(startAt - now),
}
