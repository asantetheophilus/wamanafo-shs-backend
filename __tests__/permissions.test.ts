// ============================================================
// Wamanafo SHS — Permission Helper Tests
// ============================================================

import { describe, it, expect } from "vitest";
import {
  isAdmin,
  isTeacher,
  isStudent,
  isParent,
  canAccessPath,
  getDashboardPath,
  canReadReportCard,
  assertSchoolScope,
  type SessionUser,
} from "../src/lib/permissions";
// Use string literals — Prisma client is not generated in the test environment
const UserRole = {
  ADMIN:   "ADMIN",
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
  PARENT:  "PARENT",
} as const;
type UserRole = typeof UserRole[keyof typeof UserRole];

const makeUser = (role: UserRole, schoolId = "school-a"): SessionUser => ({
  id: "usr-1",
  role,
  schoolId,
});

// ============================================================
// Role checks
// ============================================================

describe("role checks", () => {
  it("isAdmin returns true for ADMIN", () => {
    expect(isAdmin(makeUser(UserRole.ADMIN))).toBe(true);
  });

  it("isAdmin returns false for TEACHER", () => {
    expect(isAdmin(makeUser(UserRole.TEACHER))).toBe(false);
  });

  it("isTeacher returns true for TEACHER", () => {
    expect(isTeacher(makeUser(UserRole.TEACHER))).toBe(true);
  });

  it("isStudent returns true for STUDENT", () => {
    expect(isStudent(makeUser(UserRole.STUDENT))).toBe(true);
  });

  it("isParent returns true for PARENT", () => {
    expect(isParent(makeUser(UserRole.PARENT))).toBe(true);
  });

  it("returns false for null user", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isTeacher(null)).toBe(false);
  });
});

// ============================================================
// canAccessPath
// ============================================================

describe("canAccessPath", () => {
  it("ADMIN can access /admin routes", () => {
    expect(canAccessPath(makeUser(UserRole.ADMIN), "/admin/dashboard")).toBe(true);
  });

  it("ADMIN cannot access /teacher routes", () => {
    expect(canAccessPath(makeUser(UserRole.ADMIN), "/teacher/attendance")).toBe(false);
  });

  it("TEACHER can access /teacher routes", () => {
    expect(canAccessPath(makeUser(UserRole.TEACHER), "/teacher/scores")).toBe(true);
  });

  it("TEACHER cannot access /admin routes", () => {
    expect(canAccessPath(makeUser(UserRole.TEACHER), "/admin/students")).toBe(false);
  });

  it("STUDENT can access /student routes", () => {
    expect(canAccessPath(makeUser(UserRole.STUDENT), "/student/portal")).toBe(true);
  });

  it("PARENT can access /parent routes", () => {
    expect(canAccessPath(makeUser(UserRole.PARENT), "/parent/portal")).toBe(true);
  });

  it("unauthenticated user cannot access protected route", () => {
    expect(canAccessPath(null, "/admin/dashboard")).toBe(false);
  });

  it("unauthenticated user can access /login", () => {
    expect(canAccessPath(null, "/login")).toBe(true);
  });

  it("all roles can access public routes", () => {
    for (const role of Object.values(UserRole)) {
      expect(canAccessPath(makeUser(role), "/login")).toBe(true);
    }
  });
});

// ============================================================
// getDashboardPath
// ============================================================

describe("getDashboardPath", () => {
  it("returns /admin/dashboard for ADMIN", () => {
    expect(getDashboardPath(UserRole.ADMIN)).toBe("/admin/dashboard");
  });

  it("returns /teacher/dashboard for TEACHER", () => {
    expect(getDashboardPath(UserRole.TEACHER)).toBe("/teacher/dashboard");
  });

  it("returns /student/portal for STUDENT", () => {
    expect(getDashboardPath(UserRole.STUDENT)).toBe("/student/portal");
  });

  it("returns /parent/portal for PARENT", () => {
    expect(getDashboardPath(UserRole.PARENT)).toBe("/parent/portal");
  });
});

// ============================================================
// canReadReportCard
// ============================================================

describe("canReadReportCard", () => {
  const studentId = "student-1";

  it("ADMIN can read unpublished report cards", () => {
    const admin = makeUser(UserRole.ADMIN);
    expect(canReadReportCard(admin, false, studentId, [])).toBe(true);
  });

  it("TEACHER can read unpublished report cards", () => {
    const teacher = makeUser(UserRole.TEACHER);
    expect(canReadReportCard(teacher, false, studentId, [])).toBe(true);
  });

  it("STUDENT cannot read unpublished report card", () => {
    const student = makeUser(UserRole.STUDENT);
    expect(canReadReportCard(student, false, studentId, [studentId])).toBe(false);
  });

  it("PARENT cannot read unpublished report card", () => {
    const parent = makeUser(UserRole.PARENT);
    expect(canReadReportCard(parent, false, studentId, [studentId])).toBe(false);
  });

  it("STUDENT can read own published report card", () => {
    const student = makeUser(UserRole.STUDENT);
    expect(canReadReportCard(student, true, studentId, [studentId])).toBe(true);
  });

  it("STUDENT cannot read another student's published report card", () => {
    const student = makeUser(UserRole.STUDENT);
    expect(canReadReportCard(student, true, "student-2", [studentId])).toBe(false);
  });

  it("PARENT can read linked child's published report card", () => {
    const parent = makeUser(UserRole.PARENT);
    expect(canReadReportCard(parent, true, studentId, [studentId, "student-2"])).toBe(true);
  });

  it("PARENT cannot read unlinked child's published report card", () => {
    const parent = makeUser(UserRole.PARENT);
    expect(canReadReportCard(parent, true, "student-99", [studentId])).toBe(false);
  });
});

// ============================================================
// assertSchoolScope
// ============================================================

describe("assertSchoolScope", () => {
  it("returns true when user's schoolId matches resource schoolId", () => {
    const user = makeUser(UserRole.ADMIN, "school-a");
    expect(assertSchoolScope(user, "school-a")).toBe(true);
  });

  it("returns false when user's schoolId does not match (prevents cross-school leakage)", () => {
    const user = makeUser(UserRole.ADMIN, "school-a");
    expect(assertSchoolScope(user, "school-b")).toBe(false);
  });
});
