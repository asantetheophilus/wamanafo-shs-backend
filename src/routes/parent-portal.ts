import { Router } from "express";
import { db } from "../lib/db";
import { UserRole } from "../lib/enums";
const router = Router();
router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.PARENT) { res.status(403).json({ success: false, error: "Forbidden." }); return; }
    const parent = await db.parent.findFirst({
      where: { userId: req.user!.id, schoolId: req.user!.schoolId },
      include: { studentLinks: { include: { student: { include: { user: { select: { firstName: true, lastName: true } }, enrollments: { take: 1, orderBy: { year: { startDate: "desc" } }, include: { class: { include: { programme: true } }, year: true } } } } } } },
    });
    if (!parent) { res.status(404).json({ success: false, error: "Parent not found." }); return; }
    res.json({ success: true, data: parent });
  } catch (err) { next(err); }
});
export default router;
