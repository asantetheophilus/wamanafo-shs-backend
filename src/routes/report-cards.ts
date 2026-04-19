import { Router } from "express";
import {
  listReportCards,
  generateReportCards,
  publishReportCards,
  getReportCardData,
  unpublishReportCard,
  checkReportCardPrerequisites,
} from "../services/report-card.service";
import { generateReportCardPDF } from "../lib/pdf";
import { UserRole, ReportCardStatus } from "../lib/enums";
import { db } from "../lib/db";

const router = Router();

async function canAccessReportCard(user: NonNullable<Express.Request["user"]>, reportCardId: string): Promise<boolean> {
  const card = await db.reportCard.findFirst({
    where: { id: reportCardId, term: { year: { schoolId: user.schoolId } } },
    select: { studentId: true, status: true },
  });

  if (!card) return false;

  if (user.role === UserRole.ADMIN) {
    return true;
  }

  if (user.role === UserRole.STUDENT) {
    const student = await db.student.findFirst({
      where: { userId: user.id, schoolId: user.schoolId },
      select: { id: true },
    });

    return !!student && student.id === card.studentId && card.status === ReportCardStatus.PUBLISHED;
  }

  if (user.role === UserRole.PARENT) {
    if (card.status !== ReportCardStatus.PUBLISHED) return false;

    const parent = await db.parent.findFirst({
      where: { userId: user.id, schoolId: user.schoolId },
      select: { id: true },
    });
    if (!parent) return false;

    const link = await db.parentStudent.findFirst({
      where: { parentId: parent.id, studentId: card.studentId },
      select: { id: true },
    });

    return !!link;
  }

  return false;
}

router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    const { classId, termId, check } = req.query as Record<string, string>;

    if (!classId || !termId) {
      res.status(400).json({ success: false, error: "classId and termId are required.", code: "VALIDATION_ERROR" });
      return;
    }

    if (check) {
      const prereqs = await checkReportCardPrerequisites(req.user!.schoolId, classId, termId);
      res.json({ success: true, data: prereqs });
      return;
    }

    const cards = await listReportCards(req.user!.schoolId, classId, termId);
    res.json({ success: true, data: { items: cards, total: cards.length } });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }
    const { action } = req.query as Record<string, string>;
    const { classId, termId } = req.body;
    if (action === "publish") {
      const r = await publishReportCards(req.user!.schoolId, classId, termId, req.user!.id);
      res.json({ success: true, data: r });
    } else {
      const r = await generateReportCards(req.user!.schoolId, classId, termId, req.user!.id);
      res.status(201).json({ success: true, data: r });
    }
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const allowed = await canAccessReportCard(req.user!, req.params.id);
    if (!allowed) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    const data = await getReportCardData(req.user!.schoolId, req.params.id);
    if (!data) {
      res.status(404).json({ success: false, error: "Report card not found." });
      return;
    }

    if (req.user!.role !== UserRole.ADMIN && data.status !== "PUBLISHED") {
      res.status(403).json({ success: false, error: "Report card is not published.", code: "FORBIDDEN" });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/publish", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden." });
      return;
    }
    await db.reportCard.update({ where: { id: req.params.id }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedBy: req.user!.id } });
    res.json({ success: true, data: { published: true } });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/publish", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden." });
      return;
    }
    await unpublishReportCard(req.user!.schoolId, req.params.id, req.user!.id);
    res.json({ success: true, data: { published: false } });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/pdf", async (req, res, next) => {
  try {
    const allowed = await canAccessReportCard(req.user!, req.params.id);
    if (!allowed) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    const data = await getReportCardData(req.user!.schoolId, req.params.id);
    if (!data) {
      res.status(404).json({ success: false, error: "Report card not found." });
      return;
    }

    if (req.user!.role !== UserRole.ADMIN && data.status !== "PUBLISHED") {
      res.status(403).json({ success: false, error: "Report card is not published.", code: "FORBIDDEN" });
      return;
    }

    const buffer = await generateReportCardPDF(data);
    const filename = `report-card-${data.student.indexNumber}-${data.term.name.replace(/\s+/g, "-")}.pdf`.toLowerCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
