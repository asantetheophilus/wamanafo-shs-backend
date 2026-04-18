import { Request, Response, NextFunction } from "express";

type AppError = Error & { code?: string; status?: number };

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("[error]", err.message, err.stack);

  if (typeof err.status === "number") {
    res.status(err.status).json({
      success: false,
      error: err.message,
      code: err.code ?? "ERROR",
    });
    return;
  }

  if (typeof err.code === "string") {
    if (err.code === "P2002") {
      const target = Array.isArray((err as unknown as { meta?: { target?: unknown } }).meta?.target)
        ? ((err as unknown as { meta?: { target?: string[] } }).meta?.target ?? []).join(", ")
        : undefined;
      let message = "A record with this value already exists.";
      if (target?.includes("email")) message = "That email address already exists.";
      else if (target?.includes("indexNumber")) message = "That student index number already exists.";
      else if (target?.includes("staffId")) message = "That staff ID already exists.";
      res.status(409).json({ success: false, error: message, code: "CONFLICT" });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ success: false, error: "Record not found.", code: "NOT_FOUND" });
      return;
    }
    if (err.code === "CONFLICT") {
      res.status(409).json({ success: false, error: err.message, code: err.code });
      return;
    }
    if (err.code === "NOT_FOUND") {
      res.status(404).json({ success: false, error: err.message, code: err.code });
      return;
    }
    if (err.code === "FORBIDDEN") {
      res.status(403).json({ success: false, error: err.message, code: err.code });
      return;
    }
    if (err.code === "BAD_REQUEST" || err.code === "VALIDATION_ERROR") {
      res.status(400).json({ success: false, error: err.message, code: err.code });
      return;
    }
  }

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production" ? "An unexpected error occurred." : err.message,
    code: "INTERNAL_ERROR",
  });
}
