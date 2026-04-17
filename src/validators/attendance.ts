// ============================================================
// Wamanafo SHS — Attendance Validators
// ============================================================

import { z } from "zod";
import { AttendanceStatus } from "../lib/enums";

// Single attendance record
export const attendanceRecordSchema = z.object({
  studentId: z.string().cuid("Invalid student ID."),
  status:    z.nativeEnum(AttendanceStatus, {
    required_error: "Attendance status is required.",
    invalid_type_error: "Invalid attendance status.",
  }),
  note: z.string().max(200, "Note must not exceed 200 characters.").optional(),
});

export type AttendanceRecordInput = z.infer<typeof attendanceRecordSchema>;

// Bulk mark attendance for a whole class on a date
export const bulkMarkAttendanceSchema = z.object({
  classId: z.string().cuid("Invalid class ID."),
  termId:  z.string().cuid("Invalid term ID."),
  date: z
    .string({ required_error: "Date is required." })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format."),
  records: z
    .array(attendanceRecordSchema)
    .min(1, "At least one attendance record is required.")
    .max(500, "Cannot submit more than 500 records at once."),
});

export type BulkMarkAttendanceInput = z.infer<typeof bulkMarkAttendanceSchema>;

// Update a single record
export const updateAttendanceSchema = z.object({
  status: z.nativeEnum(AttendanceStatus),
  note:   z.string().max(200).optional(),
});

export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;

// Query params for fetching attendance
export const attendanceQuerySchema = z.object({
  classId:   z.string().cuid().optional(),
  termId:    z.string().cuid().optional(),
  studentId: z.string().cuid().optional(),
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:      z.coerce.number().int().min(1).default(1),
  pageSize:  z.coerce.number().int().min(1).max(100).default(50),
});

export type AttendanceQueryInput = z.infer<typeof attendanceQuerySchema>;
