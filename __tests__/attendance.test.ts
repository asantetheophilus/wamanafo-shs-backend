// ============================================================
// Wamanafo SHS — Attendance Unit Tests
// ============================================================

import { describe, it, expect } from "vitest";
import {
  computeAttendanceSummary,
  isBelowThreshold,
  formatAttendancePercentage,
} from "../src/lib/attendance";
// Use string literals — Prisma client is not generated in the test environment
const AttendanceStatus = {
  PRESENT: "PRESENT",
  ABSENT:  "ABSENT",
  LATE:    "LATE",
  EXCUSED: "EXCUSED",
} as const;
type AttendanceStatus = typeof AttendanceStatus[keyof typeof AttendanceStatus];

// ============================================================
// computeAttendanceSummary
// ============================================================

describe("computeAttendanceSummary", () => {
  it("counts PRESENT and LATE as attending", () => {
    const records = [
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.LATE },
    ];
    const summary = computeAttendanceSummary(records, 10);
    expect(summary.presentCount).toBe(2);
    expect(summary.lateCount).toBe(1);
  });

  it("computes correct percentage: (PRESENT + LATE) / totalSchoolDays × 100", () => {
    const records = [
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.LATE },
      { status: AttendanceStatus.ABSENT },
    ];
    // (2 + 1) / 10 × 100 = 30%
    const summary = computeAttendanceSummary(records, 10);
    expect(summary.attendancePercentage).toBe(30);
  });

  it("uses totalSchoolDays as denominator, not markedDays", () => {
    // Only 3 records marked, but 75 school days total
    const records = [
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.ABSENT },
    ];
    const summary = computeAttendanceSummary(records, 75);
    // (2/75) × 100 = 2.67%
    expect(summary.attendancePercentage).toBeCloseTo(2.67, 1);
  });

  it("EXCUSED does not count as present or absent in percentage", () => {
    const records = [
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.EXCUSED },
      { status: AttendanceStatus.EXCUSED },
    ];
    // Only 1 present out of 10 school days
    const summary = computeAttendanceSummary(records, 10);
    expect(summary.attendancePercentage).toBe(10);
    expect(summary.excusedCount).toBe(2);
  });

  it("daysAbsent counts only ABSENT (not EXCUSED)", () => {
    const records = [
      { status: AttendanceStatus.ABSENT },
      { status: AttendanceStatus.ABSENT },
      { status: AttendanceStatus.EXCUSED },
    ];
    const summary = computeAttendanceSummary(records, 20);
    expect(summary.daysAbsent).toBe(2); // EXCUSED not counted
  });

  it("returns null percentage when totalSchoolDays is 0", () => {
    const records = [{ status: AttendanceStatus.PRESENT }];
    const summary = computeAttendanceSummary(records, 0);
    expect(summary.attendancePercentage).toBeNull();
  });

  it("handles empty records (all days unmarked — not PRESENT)", () => {
    const summary = computeAttendanceSummary([], 75);
    expect(summary.presentCount).toBe(0);
    expect(summary.attendancePercentage).toBe(0);
  });

  it("caps percentage at 100 (cannot exceed totalSchoolDays)", () => {
    // More PRESENT records than school days (data inconsistency protection)
    const records = Array(80).fill({ status: AttendanceStatus.PRESENT });
    const summary = computeAttendanceSummary(records, 75);
    expect(summary.attendancePercentage).toBe(100);
  });

  it("returns correct markedDays count", () => {
    const records = [
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.ABSENT },
      { status: AttendanceStatus.LATE },
      { status: AttendanceStatus.EXCUSED },
    ];
    const summary = computeAttendanceSummary(records, 75);
    expect(summary.markedDays).toBe(4);
  });

  it("100% attendance when all marked days are PRESENT", () => {
    const records = Array(75).fill({ status: AttendanceStatus.PRESENT });
    const summary = computeAttendanceSummary(records, 75);
    expect(summary.attendancePercentage).toBe(100);
  });
});

// ============================================================
// isBelowThreshold
// ============================================================

describe("isBelowThreshold", () => {
  it("returns true when attendance is below threshold", () => {
    expect(isBelowThreshold(70, 75)).toBe(true);
  });

  it("returns false when attendance equals threshold", () => {
    expect(isBelowThreshold(75, 75)).toBe(false);
  });

  it("returns false when attendance is above threshold", () => {
    expect(isBelowThreshold(80, 75)).toBe(false);
  });

  it("returns false when percentage is null", () => {
    expect(isBelowThreshold(null, 75)).toBe(false);
  });
});

// ============================================================
// formatAttendancePercentage
// ============================================================

describe("formatAttendancePercentage", () => {
  it("returns '—' for null", () => {
    expect(formatAttendancePercentage(null)).toBe("—");
  });

  it("formats 75 as '75.0%'", () => {
    expect(formatAttendancePercentage(75)).toBe("75.0%");
  });

  it("formats 66.67 as '66.7%'", () => {
    expect(formatAttendancePercentage(66.67)).toBe("66.7%");
  });

  it("formats 100 as '100.0%'", () => {
    expect(formatAttendancePercentage(100)).toBe("100.0%");
  });
});
