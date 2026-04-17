/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================
// Wamanafo SHS — Student Service
// All student queries are scoped to schoolId (multi-tenant safe).
// Never call db directly in route handlers — use this service.
// ============================================================

import { db } from "../lib/db";
import { logger } from "../lib/logger";
import { StudentStatus, UserRole } from "../lib/enums";
import bcrypt from "bcryptjs";
import type { CreateStudentInput, UpdateStudentInput, StudentQueryInput } from "../validators/student";
import type { StudentDTO, StudentListRow } from "../types/student";

const SALT_ROUNDS = 12;

// ============================================================
// List students with pagination and filtering
// ============================================================

export async function listStudents(
  schoolId: string,
  query: StudentQueryInput
): Promise<{ items: StudentListRow[]; total: number }> {
  const { page, pageSize, classId, yearId, status, search } = query;
  const skip = (page - 1) * pageSize;

  // Build where clause
  const where = {
    schoolId,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { indexNumber: { contains: search, mode: "insensitive" as const } },
            { user: { firstName: { contains: search, mode: "insensitive" as const } } },
            { user: { lastName:  { contains: search, mode: "insensitive" as const } } },
            { user: { email:     { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    // Class/year filter — via enrollment
    ...(classId || yearId
      ? {
          enrollments: {
            some: {
              ...(classId ? { classId } : {}),
              ...(yearId  ? { yearId  } : {}),
            },
          },
        }
      : {}),
  };

  const [students, total] = await Promise.all([
    db.student.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
      select: {
        id:          true,
        indexNumber: true,
        status:      true,
        user: {
          select: {
            id:        true,
            firstName: true,
            lastName:  true,
            email:     true,
          },
        },
        enrollments: {
          orderBy: { year: { startDate: "desc" } },
          take: 1,
          select: {
            class: {
              select: {
                name:      true,
                programme: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    db.student.count({ where }),
  ]);

  const items: StudentListRow[] = (students as any[]).map((s) => ({
    id:           s.id,
    indexNumber:  s.indexNumber,
    firstName:    s.user.firstName,
    lastName:     s.user.lastName,
    email:        s.user.email,
    status:       s.status,
    className:    s.enrollments[0]?.class.name ?? null,
    programmeName: s.enrollments[0]?.class.programme.name ?? null,
  }));

  return { items, total };
}

// ============================================================
// Get a single student by ID (school-scoped)
// ============================================================

export async function getStudent(
  schoolId: string,
  studentId: string
): Promise<StudentDTO | null> {
  const student = await db.student.findFirst({
    where: { id: studentId, schoolId },
    select: {
      id:          true,
      indexNumber: true,
      status:      true,
      dateOfBirth: true,
      gender:      true,
      schoolId:    true,
      createdAt:   true,
      user: {
        select: {
          id:        true,
          firstName: true,
          lastName:  true,
          email:     true,
        },
      },
      enrollments: {
        orderBy: { year: { startDate: "desc" } },
        take: 1,
        select: {
          class: {
            select: {
              id:      true,
              name:    true,
              programme: { select: { id: true, name: true } },
            },
          },
          year: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!student) return null;

  return {
    id:          student.id,
    indexNumber: student.indexNumber,
    status:      student.status,
    dateOfBirth: student.dateOfBirth?.toISOString() ?? null,
    gender:      student.gender,
    schoolId:    student.schoolId,
    createdAt:   student.createdAt.toISOString(),
    user:        student.user,
    currentEnrollment: student.enrollments[0]
      ? {
          class: student.enrollments[0].class,
          year:  student.enrollments[0].year,
        }
      : null,
  };
}

// ============================================================
// Create a new student (creates User + Student + optional enrollment)
// ============================================================

export async function createStudent(
  schoolId: string,
  actorId: string,
  input: CreateStudentInput & { password: string }
): Promise<StudentDTO> {
  // Check for duplicate index number within school
  const existing = await db.student.findUnique({
    where: { schoolId_indexNumber: { schoolId, indexNumber: input.indexNumber } },
  });
  if (existing) {
    throw Object.assign(new Error("A student with this index number already exists."), {
      code: "CONFLICT",
    });
  }

  // Check for duplicate email
  const existingUser = await db.user.findUnique({
    where: { email: input.email },
  });
  if (existingUser) {
    throw Object.assign(new Error("A user with this email address already exists."), {
      code: "CONFLICT",
    });
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  // Create User + Student in a transaction
  const student = await db.$transaction(async (tx: import("../lib/prisma-types").PrismaTx) => {
    const user = await tx.user.create({
      data: {
        email:        input.email,
        passwordHash,
        role:         UserRole.STUDENT,
        schoolId,
        firstName:    input.firstName,
        lastName:     input.lastName,
        isActive:     true,
      },
    });

    const newStudent = await tx.student.create({
      data: {
        schoolId,
        indexNumber: input.indexNumber,
        userId:      user.id,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        gender:      input.gender ?? null,
        status:      StudentStatus.ACTIVE,
      },
    });

    // Enroll in class if classId and yearId provided
    if (input.classId && input.yearId) {
      await tx.classEnrollment.create({
        data: {
          studentId: newStudent.id,
          classId:   input.classId,
          yearId:    input.yearId,
        },
      });
    }

    return newStudent.id;
  });

  logger.info("student.enrolled", {
    userId: actorId,
    schoolId,
    resource: `student:${student}`,
    result: "success",
    meta: { indexNumber: input.indexNumber },
  });

  return getStudent(schoolId, student) as Promise<StudentDTO>;
}

// ============================================================
// Update student (profile fields + status)
// ============================================================

export async function updateStudent(
  schoolId: string,
  studentId: string,
  actorId: string,
  input: UpdateStudentInput
): Promise<StudentDTO> {
  // Verify ownership
  const existing = await db.student.findFirst({
    where: { id: studentId, schoolId },
    select: { id: true, userId: true },
  });
  if (!existing) {
    throw Object.assign(new Error("Student not found."), { code: "NOT_FOUND" });
  }

  await db.$transaction(async (tx: import("../lib/prisma-types").PrismaTx) => {
    // Update User fields if provided
    if (input.firstName || input.lastName || input.email) {
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          ...(input.firstName ? { firstName: input.firstName } : {}),
          ...(input.lastName  ? { lastName:  input.lastName  } : {}),
          ...(input.email     ? { email:     input.email     } : {}),
        },
      });
    }

    // Update Student fields
    await tx.student.update({
      where: { id: studentId },
      data: {
        ...(input.status      ? { status:      input.status                            } : {}),
        ...(input.dateOfBirth ? { dateOfBirth: new Date(input.dateOfBirth)             } : {}),
        ...(input.gender      ? { gender:      input.gender                            } : {}),
        ...(input.indexNumber ? { indexNumber: input.indexNumber                       } : {}),
      },
    });
  });

  logger.info("student.updated", {
    userId: actorId,
    schoolId,
    resource: `student:${studentId}`,
    result: "success",
  });

  return getStudent(schoolId, studentId) as Promise<StudentDTO>;
}

// ============================================================
// Enroll student in a class for a given year
// ============================================================

export async function enrollStudent(
  schoolId: string,
  studentId: string,
  classId: string,
  yearId: string,
  actorId: string
): Promise<void> {
  // Verify student belongs to school
  const student = await db.student.findFirst({
    where: { id: studentId, schoolId },
  });
  if (!student) {
    throw Object.assign(new Error("Student not found."), { code: "NOT_FOUND" });
  }

  // Check class belongs to school
  const cls = await db.class.findFirst({ where: { id: classId, schoolId } });
  if (!cls) {
    throw Object.assign(new Error("Class not found."), { code: "NOT_FOUND" });
  }

  await db.classEnrollment.upsert({
    where: { studentId_classId_yearId: { studentId, classId, yearId } },
    update: {},
    create: { studentId, classId, yearId },
  });

  logger.info("student.enrolled", {
    userId: actorId,
    schoolId,
    resource: `student:${studentId}`,
    result: "success",
    meta: { classId, yearId },
  });
}
