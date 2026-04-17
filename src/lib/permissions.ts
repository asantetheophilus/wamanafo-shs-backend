// ============================================================
// Wamanafo SHS — Permission Helpers
// Server-side RBAC. Client-side checks are UX only.
// These helpers are used in middleware, API routes, and server actions.
// ============================================================

// UserRole values match Prisma enum exactly — defined here so this module
// can be imported in test environments without a generated Prisma client.
export const UserRole = {
  ADMIN:   "ADMIN",
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
  PARENT:  "PARENT",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// ============================================================
// Types
// ============================================================

export interface SessionUser {
  id: string;
  role: string;
  schoolId: string;
}

// ============================================================
// Role checks
// ============================================================

export function isAdmin(user: SessionUser | null | undefined): boolean {
  return user?.role === UserRole.ADMIN;
}

export function isTeacher(user: SessionUser | null | undefined): boolean {
  return user?.role === UserRole.TEACHER;
}

export function isStudent(user: SessionUser | null | undefined): boolean {
  return user?.role === UserRole.STUDENT;
}

export function isParent(user: SessionUser | null | undefined): boolean {
  return user?.role === UserRole.PARENT;
}

// ============================================================
// Route-based access
// ============================================================

/**
 * Returns the role that owns a given route prefix.
 * Returns null for public routes.
 */
export function getRequiredRoleForPath(pathname: string): string | null {
  if (pathname.startsWith("/admin"))   return UserRole.ADMIN;
  if (pathname.startsWith("/teacher")) return UserRole.TEACHER;
  if (pathname.startsWith("/student")) return UserRole.STUDENT;
  if (pathname.startsWith("/parent"))  return UserRole.PARENT;
  return null;
}

/**
 * Check whether a user's role is allowed to access a path.
 */
export function canAccessPath(user: SessionUser | null | undefined, pathname: string): boolean {
  const required = getRequiredRoleForPath(pathname);
  if (!required) return true; // public route
  if (!user) return false;    // unauthenticated
  return user.role === required;
}

/**
 * Return the dashboard redirect path for a given role.
 */
export function getDashboardPath(role: string): string {
  switch (role) {
    case UserRole.ADMIN:   return "/admin/dashboard";
    case UserRole.TEACHER: return "/teacher/dashboard";
    case UserRole.STUDENT: return "/student/portal";
    case UserRole.PARENT:  return "/parent/portal";
    default:               return "/login";
  }
}

// ============================================================
// Domain-level permission checks
// ============================================================

/**
 * Check whether a user can read a report card.
 * ADMIN and TEACHER can always read.
 * STUDENT/PARENT can only read if the card is published.
 */
export function canReadReportCard(
  user: SessionUser,
  isPublished: boolean,
  ownedByStudentId: string,
  linkedStudentIds: string[]
): boolean {
  if (user.role === UserRole.ADMIN) return true;
  if (user.role === UserRole.TEACHER) return true;
  if (!isPublished) return false; // STUDENT/PARENT must not see unpublished

  if (user.role === UserRole.STUDENT) {
    return linkedStudentIds.includes(ownedByStudentId);
  }
  if (user.role === UserRole.PARENT) {
    return linkedStudentIds.includes(ownedByStudentId);
  }
  return false;
}

export function canSubmitScore(user: SessionUser): boolean {
  return user.role === UserRole.TEACHER;
}

export function canApproveScore(user: SessionUser): boolean {
  return user.role === UserRole.ADMIN;
}

export function canPublishReportCard(user: SessionUser): boolean {
  return user.role === UserRole.ADMIN;
}

export function canEnterConduct(user: SessionUser): boolean {
  return user.role === UserRole.TEACHER;
}

export function assertSchoolScope(user: SessionUser, resourceSchoolId: string): boolean {
  return user.schoolId === resourceSchoolId;
}
