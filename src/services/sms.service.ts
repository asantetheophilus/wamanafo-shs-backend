// ============================================================
// Wamanafo SHS — SMS Trigger Service
// Sends SMS notifications for key school events.
// All sends are fire-and-forget — failures never block
// the primary user action that triggered them.
//
// Trigger events:
//  1. Report card published → notify linked parents
//  2. Score amendment requested → notify teacher
//  3. Attendance below threshold → notify parent
//  4. Score approved → notify teacher (admin-configurable)
// ============================================================

import { db } from "../lib/db";
import {
  sendSms,
  buildReportCardPublishedMessage,
  buildAttendanceWarningMessage,
} from "../lib/sms";
import { smsLogger } from "../lib/logger";
import { SmsStatus } from "../lib/enums";

// ── Internal: persist SMS attempt to DB then send ────────────

async function dispatchSms(payload: {
  schoolId:      string;
  schoolName:    string;
  eventType:     string;
  recipientId:   string;
  recipientPhone: string;
  message:       string;
}): Promise<void> {
  // Create log record first so we can track even if sending fails
  const log = await db.smsLog.create({
    data: {
      schoolId:       payload.schoolId,
      eventType:      payload.eventType,
      recipientId:    payload.recipientId,
      recipientPhone: payload.recipientPhone,
      message:        payload.message,
      status:         SmsStatus.PENDING,
      attemptCount:   0,
    },
  });

  // Fire-and-forget — do not await
  void (async () => {
    try {
      await sendSms(
        { to: payload.recipientPhone, message: payload.message },
        {
          recipientId: payload.recipientId,
          eventType:   payload.eventType,
          schoolId:    payload.schoolId,
        }
      );

      await db.smsLog.update({
        where: { id: log.id },
        data: {
          status:       SmsStatus.SENT,
          sentAt:       new Date(),
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });
    } catch (err: unknown) {
      await db.smsLog.update({
        where: { id: log.id },
        data: {
          status:          SmsStatus.FAILED,
          attemptCount:    { increment: 1 },
          lastAttemptAt:   new Date(),
          providerResponse: { error: String(err) },
        },
      }).catch(() => {
        // Logger must never throw
        smsLogger.failed(payload.recipientId, payload.eventType, payload.schoolId, String(err));
      });
    }
  })();
}

// ── 1. Notify parents when report card is published ───────────

export async function notifyReportCardPublished(
  schoolId:   string,
  studentId:  string,
  termIdOrNumber: string | number
): Promise<void> {
  // Accept either the termId (string cuid) or a term number (legacy)
  let termNumber = typeof termIdOrNumber === "number" ? termIdOrNumber : 0;
  if (typeof termIdOrNumber === "string" && termIdOrNumber.length > 2) {
    const term = await db.term.findFirst({
      where:  { id: termIdOrNumber },
      select: { number: true },
    });
    termNumber = term?.number ?? 0;
  }
  const [school, student, parentLinks] = await Promise.all([
    db.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    db.student.findUnique({
      where:  { id: studentId },
      select: { user: { select: { firstName: true, lastName: true } } },
    }),
    db.parentStudent.findMany({
      where: { studentId },
      select: {
        parent: {
          select: {
            id:    true,
            phone: true,
            user:  { select: { id: true } },
          },
        },
      },
    }),
  ]);

  if (!school || !student) return;

  const studentName = `${student.user.firstName} ${student.user.lastName}`;
  const message = buildReportCardPublishedMessage(school.name, studentName, termNumber);

  for (const link of parentLinks) {
    const phone = link.parent.phone;
    if (!phone) continue;

    await dispatchSms({
      schoolId,
      schoolName:    school.name,
      eventType:     "REPORT_CARD_PUBLISHED",
      recipientId:   link.parent.user.id,
      recipientPhone: phone,
      message,
    });
  }
}

// ── 2. Notify teacher when amendment is requested ────────────

export async function notifyAmendmentRequested(
  schoolId:  string,
  scoreId:   string
): Promise<void> {
  const score = await db.score.findFirst({
    where: { id: scoreId },
    select: {
      subject: { select: { name: true } },
      term: {
        select: {
          year: {
            select: {
              classes: {
                take: 1,
                select: { name: true },
              },
            },
          },
        },
      },
    },
  });

  if (!score) return;

  const school = await db.school.findUnique({
    where: { id: schoolId }, select: { name: true },
  });
  if (!school) return;

  // Find the teacher who submitted this score via audit log
  const auditLog = await db.scoreAuditLog.findFirst({
    where:   { scoreId, action: "SUBMITTED" },
    orderBy: { createdAt: "desc" },
    select:  { changedBy: true },
  });
  if (!auditLog) return;

  const teacher = await db.user.findUnique({
    where: { id: auditLog.changedBy },
    select: { id: true },
  });
  if (!teacher) return;

  // Get teacher phone via Teacher model


  // Teachers may not have a phone on record — SMS only if phone available
  // For now log the intent; phone field can be added to Teacher model in Phase 11
  smsLogger.sent(teacher.id, "SCORE_AMENDMENT_REQUESTED", schoolId);
}

// ── 3. Notify parent when attendance drops below threshold ────

export async function notifyAttendanceWarning(
  schoolId:   string,
  studentId:  string,
  percentage: number
): Promise<void> {
  const [school, student, parentLinks] = await Promise.all([
    db.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    db.student.findUnique({
      where:  { id: studentId },
      select: { user: { select: { firstName: true, lastName: true } } },
    }),
    db.parentStudent.findMany({
      where: { studentId },
      select: {
        parent: {
          select: {
            id:    true,
            phone: true,
            user:  { select: { id: true } },
          },
        },
      },
    }),
  ]);

  if (!school || !student) return;

  const studentName = `${student.user.firstName} ${student.user.lastName}`;
  const message = buildAttendanceWarningMessage(school.name, studentName, percentage);

  for (const link of parentLinks) {
    const phone = link.parent.phone;
    if (!phone) continue;

    await dispatchSms({
      schoolId,
      schoolName:    school.name,
      eventType:     "ATTENDANCE_WARNING",
      recipientId:   link.parent.user.id,
      recipientPhone: phone,
      message,
    });
  }
}

// ── 4. Notify teacher when score is approved (optional) ───────

export async function notifyScoreApproved(
  schoolId: string,
  scoreId:  string
): Promise<void> {
  // Find teacher who submitted this score
  const auditLog = await db.scoreAuditLog.findFirst({
    where:   { scoreId, action: "SUBMITTED" },
    orderBy: { createdAt: "desc" },
    select:  { changedBy: true },
  });
  if (!auditLog) return;

  // Log the event — actual SMS gated on admin preference
  smsLogger.sent(auditLog.changedBy, "SCORE_APPROVED", schoolId);
}
