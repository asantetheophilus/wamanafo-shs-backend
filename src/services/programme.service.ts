// ============================================================
// Wamanafo SHS — Programme Service
// All queries scoped to schoolId.
// ============================================================

import { db } from "../lib/db";
import { logger } from "../lib/logger";
import type {
  CreateProgrammeInput,
  UpdateProgrammeInput,
  SetProgrammeSubjectsInput,
} from "../validators/class";
import type { ProgrammeDTO, ProgrammeListRow } from "../types/class";

// ── List ──────────────────────────────────────────────────────

export async function listProgrammes(
  schoolId: string
): Promise<ProgrammeListRow[]> {
  // Fetch exactly what we need — _count for subject and class counts.
  const programmes = await db.programme.findMany({
    where:   { schoolId },
    orderBy: { name: "asc" },
    select: {
      id:   true,
      name: true,
      code: true,
      _count: {
        select: {
          programmeSubjects: true,
          classes:           true,
        },
      },
    },
  });

  // The Prisma select above returns exactly this shape; use it directly.
  type ProgrammeListItem = typeof programmes[number];
  return programmes.map((p: ProgrammeListItem) => ({
    id:           p.id,
    name:         p.name,
    code:         p.code,
    subjectCount: p._count.programmeSubjects,
    classCount:   p._count.classes,
  }));
}

// ── Get one ───────────────────────────────────────────────────

export async function getProgramme(
  schoolId:    string,
  programmeId: string
): Promise<ProgrammeDTO | null> {
  const p = await db.programme.findFirst({
    where: { id: programmeId, schoolId },
    select: {
      id:        true,
      name:      true,
      code:      true,
      schoolId:  true,
      createdAt: true,
      programmeSubjects: {
        select: {
          subject: {
            select: { id: true, name: true, code: true, isCore: true },
          },
        },
        orderBy: { subject: { name: "asc" } },
      },
      _count: { select: { classes: true } },
    },
  });

  if (!p) return null;

  return {
    id:         p.id,
    name:       p.name,
    code:       p.code,
    schoolId:   p.schoolId,
    createdAt:  p.createdAt.toISOString(),
    subjects:   p.programmeSubjects.map((ps: { subject: { id: string; name: string; code: string; isCore: boolean } }) => ps.subject),
    classCount: p._count.classes,
  };
}

// ── Create ────────────────────────────────────────────────────

export async function createProgramme(
  schoolId: string,
  actorId:  string,
  input:    CreateProgrammeInput
): Promise<ProgrammeDTO> {
  const existing = await db.programme.findUnique({
    where: { schoolId_code: { schoolId, code: input.code } },
  });
  if (existing) {
    throw Object.assign(
      new Error(`A programme with code "${input.code}" already exists.`),
      { code: "CONFLICT" }
    );
  }

  const programme = await db.programme.create({
    data: { schoolId, name: input.name, code: input.code },
  });

  logger.info("programme.created", {
    userId: actorId, schoolId,
    resource: `programme:${programme.id}`, result: "success",
  });

  return getProgramme(schoolId, programme.id) as Promise<ProgrammeDTO>;
}

// ── Update ────────────────────────────────────────────────────

export async function updateProgramme(
  schoolId:    string,
  programmeId: string,
  actorId:     string,
  input:       UpdateProgrammeInput
): Promise<ProgrammeDTO> {
  const existing = await db.programme.findFirst({
    where: { id: programmeId, schoolId },
  });
  if (!existing) {
    throw Object.assign(new Error("Programme not found."), { code: "NOT_FOUND" });
  }

  await db.programme.update({
    where: { id: programmeId },
    data:  {
      ...(input.name ? { name: input.name } : {}),
      ...(input.code ? { code: input.code } : {}),
    },
  });

  logger.info("programme.updated", {
    userId: actorId, schoolId,
    resource: `programme:${programmeId}`, result: "success",
  });

  return getProgramme(schoolId, programmeId) as Promise<ProgrammeDTO>;
}

// ── Set programme subjects (replace all) ──────────────────────

export async function setProgrammeSubjects(
  schoolId:    string,
  programmeId: string,
  actorId:     string,
  input:       SetProgrammeSubjectsInput
): Promise<ProgrammeDTO> {
  const programme = await db.programme.findFirst({
    where: { id: programmeId, schoolId },
  });
  if (!programme) {
    throw Object.assign(new Error("Programme not found."), { code: "NOT_FOUND" });
  }

  // Verify all subjects belong to this school
  const subjects = await db.subject.findMany({
    where:  { id: { in: input.subjectIds }, schoolId },
    select: { id: true },
  });
  if (subjects.length !== input.subjectIds.length) {
    throw Object.assign(
      new Error("One or more subject IDs are invalid or belong to another school."),
      { code: "VALIDATION_ERROR" }
    );
  }

  // Replace all subjects in a transaction
  await db.$transaction(async (tx: import("../lib/prisma-types").PrismaTx) => {
    await tx.programmeSubject.deleteMany({ where: { programmeId } });
    await tx.programmeSubject.createMany({
      data: input.subjectIds.map((subjectId: string) => ({ programmeId, subjectId })),
      skipDuplicates: true,
    });
  });

  logger.info("programme.subjects_updated", {
    userId: actorId, schoolId,
    resource: `programme:${programmeId}`, result: "success",
    meta: { subjectCount: input.subjectIds.length },
  });

  return getProgramme(schoolId, programmeId) as Promise<ProgrammeDTO>;
}
