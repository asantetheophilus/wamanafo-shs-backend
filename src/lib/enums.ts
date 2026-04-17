// ============================================================
// Wamanafo SHS — Database Enum Constants
// These match the Prisma schema enums exactly.
// Import from here instead of @prisma/client to keep
// type checking independent of prisma generate.
// ============================================================

export const UserRole = {
  ADMIN:   "ADMIN",
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
  PARENT:  "PARENT",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const StudentStatus = {
  ACTIVE:    "ACTIVE",
  WITHDRAWN: "WITHDRAWN",
  GRADUATED: "GRADUATED",
  SUSPENDED: "SUSPENDED",
} as const;
export type StudentStatus = (typeof StudentStatus)[keyof typeof StudentStatus];

export const AttendanceStatus = {
  PRESENT: "PRESENT",
  ABSENT:  "ABSENT",
  LATE:    "LATE",
  EXCUSED: "EXCUSED",
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const ScoreStatus = {
  DRAFT:               "DRAFT",
  SUBMITTED:           "SUBMITTED",
  APPROVED:            "APPROVED",
  AMENDMENT_REQUESTED: "AMENDMENT_REQUESTED",
} as const;
export type ScoreStatus = (typeof ScoreStatus)[keyof typeof ScoreStatus];

export const ReportCardStatus = {
  DRAFT:     "DRAFT",
  PUBLISHED: "PUBLISHED",
} as const;
export type ReportCardStatus = (typeof ReportCardStatus)[keyof typeof ReportCardStatus];

export const NotificationType = {
  REPORT_CARD_PUBLISHED:       "REPORT_CARD_PUBLISHED",
  SCORE_AMENDMENT_REQUESTED:   "SCORE_AMENDMENT_REQUESTED",
  ATTENDANCE_WARNING:          "ATTENDANCE_WARNING",
  SCORE_APPROVED:              "SCORE_APPROVED",
  GENERAL:                     "GENERAL",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const SmsStatus = {
  PENDING:  "PENDING",
  SENT:     "SENT",
  FAILED:   "FAILED",
  RETRYING: "RETRYING",
} as const;
export type SmsStatus = (typeof SmsStatus)[keyof typeof SmsStatus];
