// ============================================================
// Wamanafo SHS — JWT Auth Middleware
// Verifies Bearer token on every protected request.
// Sets req.user for downstream route handlers.
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

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "No token provided.", code: "UNAUTHORIZED" });
    return;
  }

  const token = header.slice(7);

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired token.", code: "UNAUTHORIZED" });
  }
}
