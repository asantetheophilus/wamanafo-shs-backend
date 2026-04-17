// ============================================================
// Wamanafo SHS — Rate Limiter
// In-memory rate limiting for login endpoint.
// Max 5 attempts per IP per 60 seconds (spec Section 9).
// Uses LRU-style cleanup to prevent unbounded memory growth.
// For multi-instance deployments, replace with Redis.
// ============================================================

interface RateLimitEntry {
  count:     number;
  resetAt:   number; // Unix ms timestamp when the window resets
}

// Shared in-process store — resets on server restart (acceptable for JWT auth)
const store = new Map<string, RateLimitEntry>();

// Cleanup entries older than 10 minutes every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now - 10 * 60 * 1000) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitResult {
  allowed:         boolean;
  remaining:       number;
  retryAfterMs:    number;
}

/**
 * Check and increment the rate limit for a given key (IP address).
 * Returns whether the request is allowed and how many attempts remain.
 */
export function checkRateLimit(
  key:          string,
  maxAttempts:  number = 5,
  windowMs:     number = 60_000
): RateLimitResult {
  const now  = Date.now();
  const entry = store.get(key);

  // No entry or window has expired — start fresh
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, retryAfterMs: 0 };
  }

  // Within window
  if (entry.count >= maxAttempts) {
    return {
      allowed:      false,
      remaining:    0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  entry.count++;
  return {
    allowed:      true,
    remaining:    maxAttempts - entry.count,
    retryAfterMs: 0,
  };
}

/**
 * Reset the rate limit for a key (e.g. after successful login).
 */
export function resetRateLimit(key: string): void {
  store.delete(key);
}
