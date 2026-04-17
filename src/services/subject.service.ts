/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================
// Wamanafo SHS — Subject Service
// ============================================================

import { db } from "../lib/db";
import { logger } from "../lib/logger";
import type {
  CreateSubjectInput,
  UpdateSubjectInput,
  SubjectQueryInput,
} from "../validators/subject";
import type { SubjectDTO, SubjectListRow } from "../types/class";

// ── List ──────────────────────────────────────────────────────

export async function listSubjects(
  schoolId: string,
  query: SubjectQueryInput
): Promise<{ items: SubjectListRow[]; total: number }> {
  const { page, pageSize, isCore, search } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    schoolId,
    ...(isCore !== undefined ? { isCore } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { code: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [subjects, total] = await Promise.all([
    db.subject.findMany({
      where,
      skip,
      take:    pageSize,
      orderBy: [{ isCore: "desc" }, { name: "asc" }],
      select: {
        id:     true,
        name:   true,
        code:   true,
        isCore: true,
        _count: { select: { programmeSubjects: true } },
      },
    }),
    db.subject.count({ where }),
  ]);

  return {
    items: (subjects as Array<{id: string; name: string; code: string; isCore: boolean; schoolId: string; _count: {programmeSubjects: number}; programmeSubjects: Array<{programme: {id: string; name: string}}>}>) .map((s) => ({
      id:             s.id,
      name:           s.name,
      code:           s.code,
      isCore:         s.isCore,
      programmeCount: s._count.programmeSubjects,
    })),
    total,
  };
}

// ── Get one ───────────────────────────────────────────────────

export async function getSubject(
  schoolId: string,
  subjectId: string
): Promise<SubjectDTO | null> {
  const s = await db.subject.findFirst({
    where: { id: subjectId, schoolId },
    select: {
      id:        true,
      name:      true,
      code:      true,
      isCore:    true,
      schoolId:  true,
      createdAt: true,
      programmeSubjects: {
        select: {
          programme: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });

  if (!s) return null;

  return {
    id:         s.id,
    name:       s.name,
    code:       s.code,
    isCore:     s.isCore,
    schoolId:   s.schoolId,
    createdAt:  s.createdAt.toISOString(),
    programmes: (s as any).programmeSubjects.map((ps: {programme: {id: string; name: string}}) => ps.programme),
  };
}

// ── Create ────────────────────────────────────────────────────

export async function createSubject(
  schoolId: string,
  actorId: string,
  input: CreateSubjectInput
): Promise<SubjectDTO> {
  const existing = await db.subject.findUnique({
    where: { schoolId_code: { schoolId, code: input.code } },
  });
  if (existing) {
    throw Object.assign(
      new Error(`A subject with code "${input.code}" already exists.`),
      { code: "CONFLICT" }
    );
  }

  const subject = await db.subject.create({
    data: { schoolId, name: input.name, code: input.code, isCore: input.isCore },
  });

  logger.info("subject.created", {
    userId: actorId, schoolId,
    resource: `subject:${subject.id}`, result: "success",
    meta: { code: input.code, isCore: input.isCore },
  });

  return getSubject(schoolId, subject.id) as Promise<SubjectDTO>;
}

// ── Update ────────────────────────────────────────────────────

export async function updateSubject(
  schoolId: string,
  subjectId: string,
  actorId: string,
  input: UpdateSubjectInput
): Promise<SubjectDTO> {
  const existing = await db.subject.findFirst({
    where: { id: subjectId, schoolId },
  });
  if (!existing) {
    throw Object.assign(new Error("Subject not found."), { code: "NOT_FOUND" });
  }

  await db.subject.update({
    where: { id: subjectId },
    data: {
      ...(input.name   !== undefined ? { name:   input.name   } : {}),
      ...(input.code   !== undefined ? { code:   input.code   } : {}),
      ...(input.isCore !== undefined ? { isCore: input.isCore } : {}),
    },
  });

  logger.info("subject.updated", {
    userId: actorId, schoolId,
    resource: `subject:${subjectId}`, result: "success",
  });

  return getSubject(schoolId, subjectId) as Promise<SubjectDTO>;
}
