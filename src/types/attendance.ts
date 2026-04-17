// ============================================================
// Wamanafo SHS — Attendance Types
// ============================================================

import { AttendanceStatus } from "../lib/enums";

export interface AttendanceRecordDTO {
  id:        string;
  studentId: string;
  classId:   string;
  termId:    string;
  date:      string; // ISO date string YYYY-MM-DD
  status:    AttendanceStatus;
  note:      string | null;
  markedBy:  string | null;
  student: {
    indexNumber: string;
    user: { firstName: string; lastName: string };
  };
}

/** One row in the attendance grid — student + status for a given date */
export interface AttendanceGridRow {
  studentId:   string;
  indexNumber: string;
  firstName:   string;
  lastName:    string;
  status:      AttendanceStatus | null; // null = not yet marked
  note:        string | null;
  recordId:    string | null;
}

/** Per-student attendance summary for a term */
export interface AttendanceSummaryRow {
  studentId:            string;
  indexNumber:          string;
  firstName:            string;
  lastName:             string;
  presentCount:         number;
  lateCount:            number;
  absentCount:          number;
  excusedCount:         number;
  attendancePercentage: number | null;
  daysAbsent:           number;
}
