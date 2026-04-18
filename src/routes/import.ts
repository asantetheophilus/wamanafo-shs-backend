// ============================================================
// Wamanafo SHS — Import Routes
// POST /api/v1/import/students         (Admin — bulk import)
// GET  /api/v1/import/students/template (Admin — download template)
// ============================================================

import { Router }    from "express";
import multer        from "multer";
import { UserRole }  from "../lib/enums";
import { parseImportFile, bulkImportStudents, buildImportTemplate } from "../services/import.service";

const router  = Router();
const upload  = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed."));
    }
  },
});

// GET /api/v1/import/students/template
router.get("/students/template", (req, res) => {
  if (req.user!.role !== UserRole.ADMIN) {
    res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
    return;
  }
  const buffer = buildImportTemplate();
  res.setHeader("Content-Disposition", "attachment; filename=\"student_import_template.xlsx\"");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
});

// POST /api/v1/import/students
router.post("/students", upload.single("file"), async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, error: "No file uploaded." });
      return;
    }

    const rows    = parseImportFile(req.file.buffer, req.file.mimetype);

    if (rows.length === 0) {
      res.status(400).json({ success: false, error: "The uploaded file contains no data rows." });
      return;
    }

    if (rows.length > 500) {
      res.status(400).json({ success: false, error: "Maximum 500 rows per import. Please split into smaller files." });
      return;
    }

    // Preview mode — only parse and validate, don't insert
    if (req.query.preview === "true") {
      res.json({ success: true, data: { rows, count: rows.length } });
      return;
    }

    const summary = await bulkImportStudents(req.user!.schoolId, rows);
    res.json({ success: true, data: summary, message: `Import complete: ${summary.success} added, ${summary.skipped} skipped, ${summary.failed} failed.` });
  } catch (err) { next(err); }
});

export default router;
