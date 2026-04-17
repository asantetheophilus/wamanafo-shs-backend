/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================
// Wamanafo SHS — Teacher Service
// All queries scoped to schoolId. No cross-school access.
// ============================================================

import { db } from "../lib/db";
import { logger } from "../lib/logger";
import { UserRole } from "../lib/enums";
import bcrypt from "bcryptjs";
import type { CreateTeacherInput, UpdateTeacherInput, TeacherQueryInput } from "../validators/teacher";
import type { TeacherDTO, TeacherListRow } from "../types/teacher";

const SALT_ROUNDS = 12;

// ============================================================
// List teachers with pagination and search
// ============================================================

export async function listTeachers(
  schoolId: string,
  query: TeacherQueryInput
): Promise<{ items: TeacherListRow[]; total: number }> {
  const { page, pageSize, search, isActive } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    schoolId,
    ...(isActive !== undefined
      ? { user: { isActive } }
      : {}),
    ...(search
      ? {
          OR: [
            { staffId: { contains: search, mode: "insensitive" as const } },
            { user: { firstName: { contains: search, mode: "insensitive" as const } } },
            { user: { lastName:  { contains: search, mode: "insensitive" as const } } },
            { user: { email:     { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [teachers, total] = await Promise.all([
    db.teacher.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
      select: {
        id:     true,
        staffId: true,
        user: {
          select: {
            id:        true,
            firstName: true,
            lastName:  true,
            email:     true,
            isActive:  true,
          },
        },
        formMasterClasses: {
          select: { id: true, name: true },
          take: 1,
        },
        _count: {
          select: { teachingAssignments: true },
        },
      },
    }),
    db.teacher.count({ where }),
  ]);

  const items: TeacherListRow[] = (teachers as any[]).map((t) => ({
    id:              t.id,
    staffId:         t.staffId,
    firstName:       t.user.firstName,
    lastName:        t.user.lastName,
    email:           t.user.email,
    isActive:        t.user.isActive,
    assignmentCount: t._count.teachingAssignments,
    formMasterClass: t.formMasterClasses[0]?.name ?? null,
  }));

  return { items, total };
}

// ============================================================
// Get single teacher by ID (school-scoped)
// ============================================================

export async function getTeacher(
  schoolId: string,
  teacherId: string
): Promise<TeacherDTO | null> {
  const teacher = await db.teacher.findFirst({
    where: { id: teacherId, schoolId },
    select: {
      id:        true,
      staffId:   true,
      schoolId:  true,
      createdAt: true,
      user: {
        select: {
          id:        true,
          firstName: true,
          lastName:  true,
          email:     true,
          isActive:  true,
        },
      },
      formMasterClasses: {
        select: { id: true, name: true },
      },
      _count: {
        select: { teachingAssignments: true },
      },
    },
  });

  if (!teacher) return null;

  return {
    id:              teacher.id,
    staffId:         teacher.staffId,
    schoolId:        teacher.schoolId,
    createdAt:       teacher.createdAt.toISOString(),
    user:            teacher.user,
    formMasterClasses: teacher.formMasterClasses,
    assignmentCount: teacher._count.teachingAssignments,
  };
}

// ============================================================
// Create teacher (User + Teacher in transaction)
// ============================================================

export async function createTeacher(
  schoolId: string,
  actorId: string,
  input: CreateTeacherInput
): Promise<TeacherDTO> {
  // Check duplicate email
  const existingUser = await db.user.findUnique({
    where: { email: input.email },
  });
  if (existingUser) {
    throw Object.assign(new Error("A user with this email address already exists."), {
      code: "CONFLICT",
    });
  }

  // Check duplicate staffId within school
  const existingTeacher = await db.teacher.findUnique({
    where: { schoolId_staffId: { schoolId, staffId: input.staffId } },
  });
  if (existingTeacher) {
    throw Object.assign(new Error("A teacher with this staff ID already exists."), {
      code: "CONFLICT",
    });
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const teacherId = await db.$transaction(async (tx: import("../lib/prisma-types").PrismaTx) => {
    const user = await tx.user.create({
      data: {
        email:        input.email,
        passwordHash,
        role:         UserRole.TEACHER,
        schoolId,
        firstName:    input.firstName,
        lastName:     input.lastName,
        isActive:     true,
      },
    });

    const teacher = await tx.teacher.create({
      data: {
        schoolId,
        userId:  user.id,
        staffId: input.staffId,
      },
    });

    return teacher.id;
  });

  logger.info("user.created", {
    userId: actorId,
    schoolId,
    resource: `teacher:${teacherId}`,
    result: "success",
    meta: { staffId: input.staffId, role: "TEACHER" },
  });

  return getTeacher(schoolId, teacherId) as Promise<TeacherDTO>;
}

// ============================================================
// Update teacher
// ============================================================

export async function updateTeacher(
  schoolId: string,
  teacherId: string,
  actorId: string,
  input: UpdateTeacherInput
): Promise<TeacherDTO> {
  const existing = await db.teacher.findFirst({
    where: { id: teacherId, schoolId },
    select: { id: true, userId: true },
  });
  if (!existing) {
    throw Object.assign(new Error("Teacher not found."), { code: "NOT_FOUND" });
  }

  await db.$transaction(async (tx: import("../lib/prisma-types").PrismaTx) => {
    // Update User record
    const userUpdate: Record<string, unknown> = {};
    if (input.firstName !== undefined) userUpdate.firstName = input.firstName;
    if (input.lastName  !== undefined) userUpdate.lastName  = input.lastName;
    if (input.email     !== undefined) userUpdate.email     = input.email;
    if (input.isActive  !== undefined) userUpdate.isActive  = input.isActive;

    if (Object.keys(userUpdate).length > 0) {
      await tx.user.update({ where: { id: existing.userId }, data: userUpdate });
    }

    // Update Teacher record
    if (input.staffId !== undefined) {
      await tx.teacher.update({
        where: { id: teacherId },
        data:  { staffId: input.staffId },
      });
    }
  });

  logger.info("user.updated", {
    userId: actorId,
    schoolId,
    resource: `teacher:${teacherId}`,
    result: "success",
  });

  return getTeacher(schoolId, teacherId) as Promise<TeacherDTO>;
}

// ============================================================
// Deactivate teacher (soft delete — preserves history)
// ============================================================

export async function deactivateTeacher(
  schoolId: string,
  teacherId: string,
  actorId: string
): Promise<void> {
  const existing = await db.teacher.findFirst({
    where: { id: teacherId, schoolId },
    select: { userId: true },
  });
  if (!existing) {
    throw Object.assign(new Error("Teacher not found."), { code: "NOT_FOUND" });
  }

  await db.user.update({
    where: { id: existing.userId },
    data:  { isActive: false },
  });

  logger.info("user.deactivated", {
    userId:   actorId,
    schoolId,
    resource: `teacher:${teacherId}`,
    result:   "success",
  });
}
