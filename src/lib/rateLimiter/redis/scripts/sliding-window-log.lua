-- Sliding Window Log: sorted set of accepted request timestamps (score = time).
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)

local count = redis.call('ZCARD', key)
if count >= max then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return { 0, 0, tonumber(oldest[2]) + window - now, 0 }
end

-- Member must be unique; count only grows while `now` is unchanged
redis.call('ZADD', key, now, now .. '-' .. count)
redis.call('PEXPIRE', key, window)

local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
return { 1, max - count - 1, tonumber(oldest[2]) + window - now, 0 }
