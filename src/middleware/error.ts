import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("[error]", err.message, err.stack);

  // Prisma known request error
  if ("code" in err && typeof (err as any).code === "string") {
    const code = (err as any).code as string;
    if (code === "P2002") {
      res.status(409).json({ success: false, error: "A record with this value already exists.", code: "CONFLICT" });
      return;
    }
    if (code === "P2025") {
      res.status(404).json({ success: false, error: "Record not found.", code: "NOT_FOUND" });
      return;
    }
  }

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production" ? "An unexpected error occurred." : err.message,
    code: "INTERNAL_ERROR",
  });
}
