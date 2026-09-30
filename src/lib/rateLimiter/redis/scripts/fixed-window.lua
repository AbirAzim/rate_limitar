-- Fixed Window Counter: one counter per clock-aligned window.
local windowStart = math.floor(now / window) * window
local windowKey = key .. ':' .. windowStart
local resetMs = windowStart + window - now

local count = tonumber(redis.call('GET', windowKey) or '0')
if count >= max then
  return { 0, 0, resetMs, 0 }
end

count = redis.call('INCR', windowKey)
if count == 1 then
  -- Redis deletes the counter when its window ends
  redis.call('PEXPIRE', windowKey, resetMs)
end

return { 1, max - count, resetMs, 0 }
