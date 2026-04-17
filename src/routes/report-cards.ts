import { Router } from "express";
import { listReportCards, generateReportCards, publishReportCards, getReportCardData, unpublishReportCard, checkReportCardPrerequisites } from "../services/report-card.service";
import { generateReportCardPDF } from "../lib/pdf";
import { UserRole } from "../lib/enums";
const router = Router();
router.get("/", async (req, res, next) => {
  try {
    const { classId, termId, check } = req.query as Record<string, string>;
    if (check) {
      const prereqs = await checkReportCardPrerequisites(req.user!.schoolId, classId!, termId!);
      res.json({ success: true, data: prereqs });
    } else {
      const cards = await listReportCards(req.user!.schoolId, classId!, termId!);
      res.json({ success: true, data: { items: cards, total: cards.length } });
    }
  } catch (err) { next(err); }
});
router.post("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) { res.status(403).json({ success: false, error: "Forbidden." }); return; }
    const { action } = req.query as Record<string, string>;
    const { classId, termId } = req.body;
    if (action === "publish") {
      const r = await publishReportCards(req.user!.schoolId, classId, termId, req.user!.id);
      res.json({ success: true, data: r });
    } else {
      const r = await generateReportCards(req.user!.schoolId, classId, termId, req.user!.id);
      res.status(201).json({ success: true, data: r });
    }
  } catch (err) { next(err); }
});
router.get("/:id", async (req, res, next) => {
  try {
    const data = await getReportCardData(req.user!.schoolId, req.params.id);
    if (!data) { res.status(404).json({ success: false, error: "Report card not found." }); return; }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});
router.post("/:id/publish", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) { res.status(403).json({ success: false, error: "Forbidden." }); return; }
    const { db } = await import("../lib/db");
    await db.reportCard.update({ where: { id: req.params.id }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedBy: req.user!.id } });
    res.json({ success: true, data: { published: true } });
  } catch (err) { next(err); }
});
router.delete("/:id/publish", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) { res.status(403).json({ success: false, error: "Forbidden." }); return; }
    await unpublishReportCard(req.user!.schoolId, req.params.id, req.user!.id);
    res.json({ success: true, data: { published: false } });
  } catch (err) { next(err); }
});
router.get("/:id/pdf", async (req, res, next) => {
  try {
    const data = await getReportCardData(req.user!.schoolId, req.params.id);
    if (!data) { res.status(404).json({ success: false, error: "Report card not found." }); return; }
    const buffer = await generateReportCardPDF(data);
    const filename = `report-card-${data.student.indexNumber}-${data.term.name.replace(/\s+/g, "-")}.pdf`.toLowerCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) { next(err); }
});
export default router;
