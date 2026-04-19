// ============================================================
// Wamanafo SHS - JWT Auth Middleware
// Accepts Bearer token and fallback cookie tokens.
// ============================================================

import { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../lib/auth";

export type AuthUser = JwtPayload;

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function readCookieToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim();
    if (key !== "ghana_shs_token" && key !== "token" && key !== "auth_token") continue;
    return decodeURIComponent(rest.join("=").trim());
  }

  return null;
}

function resolveToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }

  return readCookieToken(req.headers.cookie);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = resolveToken(req);

  if (!token) {
    res.status(401).json({ success: false, error: "No token provided.", code: "UNAUTHORIZED" });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired token.", code: "UNAUTHORIZED" });
  }
}
