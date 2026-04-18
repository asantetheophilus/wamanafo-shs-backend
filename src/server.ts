// ============================================================
// Wamanafo SHS — Express Backend Server (updated)
// ============================================================

import express          from "express";
import cors             from "cors";
import helmet           from "helmet";
import compression      from "compression";
import path             from "path";
import { json }         from "express";

import { errorHandler }        from "./middleware/error";
import { requestLogger }       from "./middleware/logger";
import { authMiddleware }      from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";

import academicYearsRouter  from "./routes/academic-years";
import analyticsRouter      from "./routes/analytics";
import attendanceRouter     from "./routes/attendance";
import authRouter           from "./routes/auth";
import classesRouter        from "./routes/classes";
import conductRouter        from "./routes/conduct";
import exportRouter         from "./routes/export";
import importRouter         from "./routes/import";
import parentPortalRouter   from "./routes/parent-portal";
import programmesRouter     from "./routes/programmes";
import promotionRouter      from "./routes/promotion";
import rankingsRouter       from "./routes/rankings";
import aggregatesRouter     from "./routes/aggregates";
import reportCardsRouter    from "./routes/report-cards";
import scoresRouter         from "./routes/scores";
import schoolSettingsRouter from "./routes/school-settings";
import studentPortalRouter  from "./routes/student-portal";
import studentsRouter       from "./routes/students";
import subjectsRouter       from "./routes/subjects";
import teachersRouter       from "./routes/teachers";
import termsRouter          from "./routes/terms";

const app = express();

// ── Security ───────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ── CORS ───────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL ?? "http://localhost:3000",
  /\.vercel\.app$/,
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = allowedOrigins.some((o) =>
      typeof o === "string" ? o === origin : o.test(origin)
    );
    cb(allowed ? null : new Error("Not allowed by CORS"), allowed);
  },
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
}));

// ── Static files (logos) ───────────────────────────────────
app.use("/logos", express.static(path.join(process.cwd(), "public", "logos")));

// ── Body parsing ───────────────────────────────────────────
app.use(json({ limit: "10mb" }));
app.use(compression());

// ── Request logging ────────────────────────────────────────
app.use(requestLogger);

// ── Health check ───────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Auth routes (no auth middleware needed) ─────────────────
app.use("/api/v1/auth", rateLimitMiddleware, authRouter);

// ── Protected API routes ────────────────────────────────────
app.use("/api/v1", authMiddleware);
app.use("/api/v1/academic-years",   academicYearsRouter);
app.use("/api/v1/aggregates",       aggregatesRouter);
app.use("/api/v1/analytics",        analyticsRouter);
app.use("/api/v1/attendance",       attendanceRouter);
app.use("/api/v1/classes",          classesRouter);
app.use("/api/v1/conduct",          conductRouter);
app.use("/api/v1/export",           exportRouter);
app.use("/api/v1/import",           importRouter);
app.use("/api/v1/parent-portal",    parentPortalRouter);
app.use("/api/v1/programmes",       programmesRouter);
app.use("/api/v1/promotion",        promotionRouter);
app.use("/api/v1/rankings",         rankingsRouter);
app.use("/api/v1/report-cards",     reportCardsRouter);
app.use("/api/v1/school-settings",  schoolSettingsRouter);
app.use("/api/v1/scores",           scoresRouter);
app.use("/api/v1/student-portal",   studentPortalRouter);
app.use("/api/v1/students",         studentsRouter);
app.use("/api/v1/subjects",         subjectsRouter);
app.use("/api/v1/teachers",         teachersRouter);
app.use("/api/v1/terms",            termsRouter);

// ── 404 ────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found.", code: "NOT_FOUND" });
});

// ── Global error handler ────────────────────────────────────
app.use(errorHandler);

// ── Start ───────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "4000", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] Wamanafo SHS API running on port ${PORT}`);
});

export default app;
