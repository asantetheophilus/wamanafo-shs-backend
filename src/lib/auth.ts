// ============================================================
// Wamanafo SHS Backend — JWT Auth Utilities
// Used by src/routes/auth.ts and src/middleware/auth.ts
// ============================================================

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

export interface JwtPayload {
  id:       string;
  email:    string;
  name:     string;
  role:     string;
  schoolId: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set.");
  return secret;
}

export function signToken(payload: JwtPayload): string {
  const secret  = getSecret();
  const expires = (process.env.JWT_EXPIRES_IN ?? "8h") as jwt.SignOptions["expiresIn"];
  return jwt.sign(
    { id: payload.id, email: payload.email, name: payload.name, role: payload.role, schoolId: payload.schoolId },
    secret,
    { expiresIn: expires }
  );
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
