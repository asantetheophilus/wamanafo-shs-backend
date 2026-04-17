// ============================================================
// Wamanafo SHS — Attendance Summary Helpers
// Attendance percentage uses Term.totalSchoolDays as denominator.
// PRESENT and LATE count as present; ABSENT and EXCUSED do not.
// Missing records are NOT treated as PRESENT.
// ============================================================

// ============================================================
// Types
// ============================================================

export interface AttendanceRecord {
  status: string; // "PRESENT" | "ABSENT" | "LATE" | "EXCUSED"
}

export interface AttendanceSummary {
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  markedDays: number;
  attendancePercentage: number | null;
  daysAbsent: number;
}

// ============================================================
// Core Calculation
// ============================================================

/**
 * Compute attendance summary for a student for a given term.
 *
 * Formula: attendancePercentage = (PRESENT + LATE) / totalSchoolDays × 100
 *
 * Important:
 * - Denominator is totalSchoolDays from the Term model — not markedDays.
 * - EXCUSED does not count toward present OR absent.
 * - Missing records (days not marked) are not counted as PRESENT.
 * - Returns null percentage if totalSchoolDays is 0 or negative.
 */
export function computeAttendanceSummary(
  records: AttendanceRecord[],
  totalSchoolDays: number
): AttendanceSummary {
  let presentCount = 0;
  let lateCount    = 0;
  let absentCount  = 0;
  let excusedCount = 0;

  for (const record of records) {
    switch (record.status) {
      case "PRESENT":
        presentCount++;
        break;
      case "LATE":
        lateCount++;
        break;
      case "ABSENT":
        absentCount++;
        break;
      case "EXCUSED":
        excusedCount++;
        break;
    }
  }

  const markedDays = presentCount + lateCount + absentCount + excusedCount;

  let attendancePercentage: number | null = null;
  if (totalSchoolDays > 0) {
    const raw = ((presentCount + lateCount) / totalSchoolDays) * 100;
    attendancePercentage = Math.round(raw * 100) / 100;
    attendancePercentage = Math.min(attendancePercentage, 100);
  }

  return {
    presentCount,
    lateCount,
    absentCount,
    excusedCount,
    markedDays,
    attendancePercentage,
    daysAbsent: absentCount,
  };
}

// ============================================================
// Helpers
// ============================================================

export function isBelowThreshold(
  attendancePercentage: number | null,
  thresholdPercent: number
): boolean {
  if (attendancePercentage === null) return false;
  return attendancePercentage < thresholdPercent;
}

export function formatAttendancePercentage(percentage: number | null): string {
  if (percentage === null) return "—";
  return `${percentage.toFixed(1)}%`;
}
