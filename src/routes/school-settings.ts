// ============================================================
// Wamanafo SHS — School Settings Routes
// GET   /api/v1/school-settings        — get settings
// PATCH /api/v1/school-settings        — update name/motto/contact
// POST  /api/v1/school-settings/logo   — upload logo (multipart)
// ============================================================

import { Router }   from "express";
import multer       from "multer";
import path         from "path";
import fs           from "fs";
import { db }       from "../lib/db";
import { UserRole } from "../lib/enums";

const router = Router();

// Store logos in local public folder (for dev/Render) or use storage abstraction
const LOGO_DIR = process.env.LOGO_STORAGE_PATH ?? path.join(process.cwd(), "public", "logos");

// Ensure directory exists
if (!fs.existsSync(LOGO_DIR)) {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
}

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, LOGO_DIR),
    filename:    (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `logo_${req.user!.schoolId}_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".png", ".jpg", ".jpeg", ".svg", ".webp"];
    const ext     = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG, JPG, JPEG, SVG, or WebP images are allowed."));
    }
  },
});

// GET /api/v1/school-settings
router.get("/", async (req, res, next) => {
  try {
    const school = await db.school.findUnique({
      where:  { id: req.user!.schoolId },
      select: { id:true, name:true, logoUrl:true, motto:true, address:true, contactPhone:true, contactEmail:true },
    });
    if (!school) { res.status(404).json({ success: false, error: "School not found." }); return; }
    res.json({ success: true, data: school });
  } catch (err) { next(err); }
});

// PATCH /api/v1/school-settings
router.patch("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }
    const { name, motto, address, contactPhone, contactEmail } = req.body as Record<string, string>;
    const school = await db.school.update({
      where: { id: req.user!.schoolId },
      data:  {
        ...(name         ? { name }         : {}),
        ...(motto        ? { motto }        : {}),
        ...(address      ? { address }      : {}),
        ...(contactPhone ? { contactPhone } : {}),
        ...(contactEmail ? { contactEmail } : {}),
      },
      select: { id:true, name:true, logoUrl:true, motto:true, address:true, contactPhone:true, contactEmail:true },
    });
    res.json({ success: true, data: school, message: "School settings updated." });
  } catch (err) { next(err); }
});

// POST /api/v1/school-settings/logo
router.post("/logo", logoUpload.single("logo"), async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, error: "No image uploaded." });
      return;
    }

    const publicBase = process.env.BACKEND_PUBLIC_URL ?? `http://localhost:4000`;
    const logoUrl    = `${publicBase}/logos/${req.file.filename}`;

    const school = await db.school.update({
      where: { id: req.user!.schoolId },
      data:  { logoUrl },
      select: { id:true, name:true, logoUrl:true },
    });

    res.json({ success: true, data: school, message: "Logo updated successfully." });
  } catch (err) { next(err); }
});

export default router;
