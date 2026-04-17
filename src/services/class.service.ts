/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================
// Wamanafo SHS — Class Service
// ============================================================

import { db } from "../lib/db";
import { logger } from "../lib/logger";
import type {
  CreateClassInput,
  UpdateClassInput,
  ClassQueryInput,
} from "../validators/class";
import type { ClassDTO, ClassListRow } from "../types/class";

// ── List ──────────────────────────────────────────────────────

export async function listClasses(
  schoolId: string,
  query: ClassQueryInput
): Promise<{ items: ClassListRow[]; total: number }> {
  const { page, pageSize, yearId, programmeId, search } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    schoolId,
    ...(yearId      ? { yearId }      : {}),
    ...(programmeId ? { programmeId } : {}),
    ...(search
      ? { name: { contains: search, mode: "insensitive" as const } }
      : {}),
  };

  const [classes, total] = await Promise.all([
    db.class.findMany({
      where,
      skip,
      take:    pageSize,
      orderBy: [{ year: { startDate: "desc" } }, { name: "asc" }],
      select: {
        id:   true,
        name: true,
        year:      { select: { name: true } },
        programme: { select: { name: true } },
        formMaster: {
          select: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        _count: {
          select: {
            enrollments: true,
          },
        },
      },
    }),
    db.class.count({ where }),
  ]);

  return {
    items: (classes as Array<{id: string; name: string; programme: {id: string; name: string; code: string}; formMaster: {id: string; userId: string; staffId: string; user: {firstName: string; lastName: string}}|null; year: {id: string; name: string}; _count: {enrollments: number}}>) .map((c) => ({
      id:             c.id,
      name:           c.name,
      yearName:       c.year.name,
      programmeName:  c.programme.name,
      formMasterName: c.formMaster
        ? `${c.formMaster.user.firstName} ${c.formMaster.user.lastName}`
        : null,
      studentCount: c._count.enrollments,
    })),
    total,
  };
}

// ── Get one ───────────────────────────────────────────────────

export async function getClass(
  schoolId: string,
  classId: string
): Promise<ClassDTO | null> {
  const c = await db.class.findFirst({
    where: { id: classId, schoolId },
    select: {
      id:        true,
      name:      true,
      schoolId:  true,
      createdAt: true,
      year:      { select: { id: true, name: true } },
      programme: { select: { id: true, name: true, code: true } },
      formMaster: {
        select: {
          id:      true,
          staffId: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
      _count: { select: { enrollments: true } },
    },
  });

  if (!c) return null;

  return {
    id:           c.id,
    name:         c.name,
    schoolId:     c.schoolId,
    createdAt:    c.createdAt.toISOString(),
    year:         c.year,
    programme:    c.programme,
    formMaster:   c.formMaster,
    studentCount: c._count.enrollments,
  };
}

// ── Create ────────────────────────────────────────────────────

export async function createClass(
  schoolId: string,
  actorId: string,
  input: CreateClassInput
): Promise<ClassDTO> {
  // Verify year belongs to school
  const year = await db.academicYear.findFirst({
    where: { id: input.yearId, schoolId },
  });
  if (!year) {
    throw Object.assign(new Error("Academic year not found."), { code: "NOT_FOUND" });
  }

  // Verify programme belongs to school
  const programme = await db.programme.findFirst({
    where: { id: input.programmeId, schoolId },
  });
  if (!programme) {
    throw Object.assign(new Error("Programme not found."), { code: "NOT_FOUND" });
  }

  // Verify form master belongs to school (if provided)
  if (input.formMasterId) {
    const teacher = await db.teacher.findFirst({
      where: { id: input.formMasterId, schoolId },
    });
    if (!teacher) {
      throw Object.assign(new Error("Teacher not found."), { code: "NOT_FOUND" });
    }
  }

  // Check duplicate name in same year
  const existing = await db.class.findUnique({
    where: {
      schoolId_name_yearId: {
        schoolId,
        name:   input.name,
        yearId: input.yearId,
      },
    },
  });
  if (existing) {
    throw Object.assign(
      new Error(`A class named "${input.name}" already exists for this year.`),
      { code: "CONFLICT" }
    );
  }

  const cls = await db.class.create({
    data: {
      schoolId,
      name:         input.name,
      yearId:       input.yearId,
      programmeId:  input.programmeId,
      formMasterId: input.formMasterId ?? null,
    },
  });

  logger.info("class.created", {
    userId: actorId, schoolId,
    resource: `class:${cls.id}`, result: "success",
    meta: { name: input.name, yearId: input.yearId },
  });

  return getClass(schoolId, cls.id) as Promise<ClassDTO>;
}

// ── Update ────────────────────────────────────────────────────

export async function updateClass(
  schoolId: string,
  classId: string,
  actorId: string,
  input: UpdateClassInput
): Promise<ClassDTO> {
  const existing = await db.class.findFirst({
    where: { id: classId, schoolId },
  });
  if (!existing) {
    throw Object.assign(new Error("Class not found."), { code: "NOT_FOUND" });
  }

  // Validate formMaster if changing
  if (input.formMasterId) {
    const teacher = await db.teacher.findFirst({
      where: { id: input.formMasterId, schoolId },
    });
    if (!teacher) {
      throw Object.assign(new Error("Teacher not found."), { code: "NOT_FOUND" });
    }
  }

  await db.class.update({
    where: { id: classId },
    data: {
      ...(input.name         !== undefined ? { name:         input.name         } : {}),
      ...(input.programmeId  !== undefined ? { programmeId:  input.programmeId  } : {}),
      ...(input.formMasterId !== undefined ? { formMasterId: input.formMasterId } : {}),
    },
  });

  logger.info("class.updated", {
    userId: actorId, schoolId,
    resource: `class:${classId}`, result: "success",
  });

  return getClass(schoolId, classId) as Promise<ClassDTO>;
}

// ── Get students enrolled in a class ─────────────────────────

export async function getClassEnrollments(
  schoolId: string,
  classId: string,
  yearId: string
) {
  // Verify class belongs to school
  const cls = await db.class.findFirst({ where: { id: classId, schoolId } });
  if (!cls) {
    throw Object.assign(new Error("Class not found."), { code: "NOT_FOUND" });
  }

  return db.classEnrollment.findMany({
    where: { classId, yearId },
    select: {
      student: {
        select: {
          id:          true,
          indexNumber: true,
          status:      true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
    orderBy: { student: { user: { lastName: "asc" } } },
  });
}
