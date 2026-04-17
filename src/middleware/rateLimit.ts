import { Request, Response, NextFunction } from "express";
import { checkRateLimit } from "../lib/rate-limit";

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.headers["x-forwarded-for"]?.toString() ?? req.ip ?? "unknown";
  const result = checkRateLimit(ip, 5, 60_000);
  if (!result.allowed) {
    res.status(429).json({
      success: false,
      error: `Too many requests. Try again in ${Math.ceil(result.retryAfterMs / 1000)}s.`,
      code: "RATE_LIMITED",
    });
    return;
  }
  next();
}
