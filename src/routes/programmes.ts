import { Router } from "express";
import { listProgrammes, getProgramme, createProgramme, updateProgramme, setProgrammeSubjects } from "../services/programme.service";
import { UserRole } from "../lib/enums";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const result = await listProgrammes(req.user!.schoolId);
    res.json({ success: true, data: { items: result, total: result.length } });
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const p = await getProgramme(req.user!.schoolId, req.params.id);
    if (!p) { res.status(404).json({ success: false, error: "Programme not found.", code: "NOT_FOUND" }); return; }
    res.json({ success: true, data: p });
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" }); return;
    }
    const p = await createProgramme(req.user!.schoolId, req.user!.id, req.body);
    res.status(201).json({ success: true, data: p });
  } catch (err) { next(err); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" }); return;
    }
    const p = await updateProgramme(req.user!.schoolId, req.params.id, req.user!.id, req.body);
    res.json({ success: true, data: p });
  } catch (err) { next(err); }
});

router.put("/:id/subjects", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" }); return;
    }
    const p = await setProgrammeSubjects(req.user!.schoolId, req.params.id, req.user!.id, req.body);
    res.json({ success: true, data: p });
  } catch (err) { next(err); }
});

export default router;
