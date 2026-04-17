// ============================================================
// Wamanafo SHS — Auth Routes
// POST /api/v1/auth/login   — validate credentials, return JWT
// GET  /api/v1/auth/me      — return current user from token
// POST /api/v1/auth/logout  — stateless (client discards token)
// ============================================================

import { Router } from "express";
import { db } from "../lib/db";
import { signToken, verifyPassword } from "../lib/auth";
import { authLoginSchema } from "../validators/auth";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// POST /api/v1/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const parsed = authLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid email or password format.",
        code: "VALIDATION_ERROR",
      });
      return;
    }

    const { email, password } = parsed.data;

    const user = await db.user.findUnique({
      where:  { email: email.toLowerCase() },
      select: {
        id:           true,
        email:        true,
        passwordHash: true,
        role:         true,
        schoolId:     true,
        isActive:     true,
        firstName:    true,
        lastName:     true,
      },
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

    // Update last login (fire-and-forget)
    void db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const payload = {
      id:       user.id,
      email:    user.email,
      name:     `${user.firstName} ${user.lastName}`,
      role:     user.role,
      schoolId: user.schoolId,
    };

    const token = signToken(payload);

    res.json({
      success: true,
      data: { token, user: payload },
      message: "Login successful.",
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/me
router.get("/me", authMiddleware, (req, res) => {
  res.json({ success: true, data: req.user });
});

// POST /api/v1/auth/logout
router.post("/logout", (_req, res) => {
  // JWT is stateless — client simply discards the token
  res.json({ success: true, data: null, message: "Logged out successfully." });
});

export default router;
