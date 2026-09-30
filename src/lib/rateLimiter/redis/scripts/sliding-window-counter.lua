-- Sliding Window Counter: previous + current window counts, previous one weighted
-- by how much of it still overlaps the sliding window.
local windowStart = math.floor(now / window) * window
local state = redis.call('HMGET', key, 'start', 'prev', 'curr')
local start = tonumber(state[1])
local prev = tonumber(state[2]) or 0
local curr = tonumber(state[3]) or 0

if not start then
  start, prev, curr = windowStart, 0, 0
elseif start ~= windowStart then
  -- Roll forward: old current becomes previous only if the windows are adjacent
  if windowStart - start == window then prev = curr else prev = 0 end
  curr = 0
  start = windowStart
end

local elapsed = now - windowStart
local estimate = prev * (window - elapsed) / window + curr
local allowed = estimate + 1 <= max

if allowed then curr = curr + 1 end
redis.call('HSET', key, 'start', start, 'prev', prev, 'curr', curr)
-- After two windows both counts are irrelevant
redis.call('PEXPIRE', key, 2 * window)

if allowed then
  return { 1, math.max(0, math.floor(max - (estimate + 1))), window - elapsed, 0 }
end

-- Solve prev * (1 - t / window) + curr + 1 <= max for t
local headroom = max - curr - 1
local retryMs
if headroom < 0 or prev == 0 then
  retryMs = window - elapsed
else
  retryMs = math.max(1, math.ceil(window * (1 - headroom / prev) - elapsed))
end
return { 0, 0, retryMs, 0 }
