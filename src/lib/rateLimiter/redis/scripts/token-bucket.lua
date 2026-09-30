-- Token Bucket: up to `max` tokens, refilled continuously at max / window per ms.
local refillPerMs = max / window
local state = redis.call('HMGET', key, 'tokens', 'last')
local tokens = tonumber(state[1])
local last = tonumber(state[2])

if not tokens then
  tokens = max
else
  tokens = math.min(max, tokens + math.max(0, now - last) * refillPerMs)
end

local result
if tokens < 1 then
  result = { 0, 0, math.ceil((1 - tokens) / refillPerMs), 0 }
else
  tokens = tokens - 1
  result = { 1, math.floor(tokens), math.ceil((max - tokens) / refillPerMs), 0 }
end

redis.call('HSET', key, 'tokens', tokens, 'last', now)
-- Once the bucket would be full again it's identical to a fresh one
redis.call('PEXPIRE', key, math.max(1, math.ceil((max - tokens) / refillPerMs)))

return result
