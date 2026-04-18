// ============================================================
// Wamanafo SHS — Auth Routes (updated)
// POST /api/v1/auth/login
// GET  /api/v1/auth/me
// POST /api/v1/auth/logout
// POST /api/v1/auth/forgot-password
// POST /api/v1/auth/reset-password
// POST /api/v1/auth/change-password   (authenticated)
// ============================================================

import { Router }                         from "express";
import crypto                             from "crypto";
import { db }                             from "../lib/db";
import { signToken, verifyPassword, hashPassword } from "../lib/auth";
import {
  authLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "../validators/auth";
import { authMiddleware }                 from "../middleware/auth";
import { sendMail, buildPasswordResetEmail } from "../lib/email";

const router = Router();

const RESET_EXPIRES_MINUTES = 60;
const RESET_EXPIRES_LABEL   = "1 hour";

type PasswordResetTokenRecord = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  user?: {
    id: string;
    isActive: boolean;
  };
};

const passwordResetToken = db.passwordResetToken;

// ── POST /api/v1/auth/login ────────────────────────────────
router.post("/login", async (req, res, next) => {
  try {
    const parsed = authLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Invalid email or password format.", code: "VALIDATION_ERROR" });
      return;
    }

    const { email, password } = parsed.data;
    const user = await db.user.findUnique({
      where:  { email },
      select: { id:true, email:true, passwordHash:true, role:true, schoolId:true, isActive:true, firstName:true, lastName:true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: "Invalid credentials.", code: "UNAUTHORIZED" });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, error: "Invalid credentials.", code: "UNAUTHORIZED" });
      return;
    }

    void db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const payload = { id: user.id, email: user.email, name: `${user.firstName} ${user.lastName}`, role: user.role, schoolId: user.schoolId };
    const token   = signToken(payload);
    res.json({ success: true, data: { token, user: payload }, message: "Login successful." });
  } catch (err) { next(err); }
});

// ── GET /api/v1/auth/me ────────────────────────────────────
router.get("/me", authMiddleware, (req, res) => {
  res.json({ success: true, data: req.user });
});

// ── POST /api/v1/auth/logout ───────────────────────────────
router.post("/logout", (_req, res) => {
  res.json({ success: true, data: null, message: "Logged out successfully." });
});

// ── POST /api/v1/auth/forgot-password ─────────────────────
router.post("/forgot-password", async (req, res, next) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid email." });
      return;
    }

    const { email } = parsed.data;

    // Always respond with success to avoid email enumeration
    const user = await db.user.findUnique({ where: { email }, select: { id:true, firstName:true, isActive:true } });

    if (user && user.isActive) {
      // Invalidate old tokens for this user
      await passwordResetToken.deleteMany({ where: { userId: user.id } });

      // Generate secure token
      const rawToken  = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + RESET_EXPIRES_MINUTES * 60 * 1000);

      await passwordResetToken.create({
        data: { userId: user.id, token: rawToken, expiresAt },
      });

      const frontendUrl = (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
      const resetUrl    = `${frontendUrl}/reset-password?token=${rawToken}`;

      const { subject, html, text } = buildPasswordResetEmail({
        firstName: user.firstName,
        resetUrl,
        expiresIn: RESET_EXPIRES_LABEL,
      });

      await sendMail({ to: email, subject, html, text });
    }

    // Always return 200 to prevent user enumeration
    res.json({
      success: true,
      data:    null,
      message: "If that email is registered, you will receive a password reset link shortly.",
    });
  } catch (err) { next(err); }
});

// ── POST /api/v1/auth/reset-password ──────────────────────
router.post("/reset-password", async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Validation error." });
      return;
    }

    const { token, newPassword } = parsed.data;

    const record = await passwordResetToken.findUnique({
      where:  { token },
      include: { user: { select: { id:true, isActive:true } } },
    });

    if (!record) {
      res.status(400).json({ success: false, error: "This reset link is invalid.", code: "INVALID_TOKEN" });
      return;
    }
    if (record.usedAt) {
      res.status(400).json({ success: false, error: "This reset link has already been used.", code: "TOKEN_USED" });
      return;
    }
    if (record.expiresAt < new Date()) {
      res.status(400).json({ success: false, error: "This reset link has expired. Please request a new one.", code: "TOKEN_EXPIRED" });
      return;
    }
    if (!record.user) {
      res.status(400).json({ success: false, error: "This reset link is invalid.", code: "INVALID_TOKEN" });
      return;
    }
    if (!record.user.isActive) {
      res.status(400).json({ success: false, error: "Account is inactive.", code: "INACTIVE" });
      return;
    }

    const passwordHash = await hashPassword(newPassword);

    await db.user.update({ where: { id: record.user.id }, data: { passwordHash } });
    await passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

    res.json({ success: true, data: null, message: "Password reset successfully. You can now log in." });
  } catch (err) { next(err); }
});

// ── POST /api/v1/auth/change-password  (authenticated) ────
router.post("/change-password", authMiddleware, async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Validation error." });
      return;
    }

    const { currentPassword, newPassword } = parsed.data;
    const userId = req.user!.id;

    const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash:true } });
    if (!user) {
      res.status(404).json({ success: false, error: "User not found.", code: "NOT_FOUND" });
      return;
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ success: false, error: "Current password is incorrect.", code: "WRONG_PASSWORD" });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    await db.user.update({ where: { id: userId }, data: { passwordHash } });

    res.json({ success: true, data: null, message: "Password changed successfully." });
  } catch (err) { next(err); }
});

export default router;
