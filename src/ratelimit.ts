import type { Context, Next } from "hono"

interface Window {
  count: number
  resetAt: number
}

function createLimiter(windowMs: number, max: number) {
  const windows = new Map<string, Window>()

  return function check(key: string): boolean {
    const now = Date.now()
    const w = windows.get(key)

    if (!w || now >= w.resetAt) {
      windows.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }

    if (w.count >= max) return false
    w.count++
    return true
  }
}

const checkIp = createLimiter(60_000, 60) // 60 req/min per IP

export function ipRateLimiter(c: Context, next: Next) {
  const ip =
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"

  if (!checkIp(ip)) {
    return c.json(
      {
        error: {
          message: "Rate limit exceeded. Try again in a minute.",
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
        },
      },
      429,
    )
  }

  return next()
}
