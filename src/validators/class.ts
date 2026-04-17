// ============================================================
// Wamanafo SHS — Class, Programme & Academic Year Validators
// ============================================================

import { z } from "zod";

// ── Programme ─────────────────────────────────────────────────

export const createProgrammeSchema = z.object({
  name: z
    .string({ required_error: "Programme name is required." })
    .min(1, "Programme name cannot be empty.")
    .max(100, "Programme name is too long.")
    .trim(),

  code: z
    .string({ required_error: "Programme code is required." })
    .min(1, "Code cannot be empty.")
    .max(10, "Code must not exceed 10 characters.")
    .toUpperCase()
    .trim(),
});

export type CreateProgrammeInput = z.infer<typeof createProgrammeSchema>;

export const updateProgrammeSchema = createProgrammeSchema.partial();
export type UpdateProgrammeInput = z.infer<typeof updateProgrammeSchema>;

// ── Class ─────────────────────────────────────────────────────

export const createClassSchema = z.object({
  name: z
    .string({ required_error: "Class name is required." })
    .min(1, "Class name cannot be empty.")
    .max(50, "Class name is too long.")
    .trim(),

  yearId: z
    .string({ required_error: "Academic year is required." })
    .cuid("Invalid academic year ID."),

  programmeId: z
    .string({ required_error: "Programme is required." })
    .cuid("Invalid programme ID."),

  formMasterId: z
    .string()
    .cuid("Invalid teacher ID.")
    .optional()
    .nullable(),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;

export const updateClassSchema = createClassSchema.partial();
export type UpdateClassInput = z.infer<typeof updateClassSchema>;

export const classQuerySchema = z.object({
  yearId:      z.string().cuid().optional(),
  programmeId: z.string().cuid().optional(),
  search:      z.string().max(100).optional(),
  page:        z.coerce.number().int().min(1).default(1),
  pageSize:    z.coerce.number().int().min(1).max(100).default(20),
});

export type ClassQueryInput = z.infer<typeof classQuerySchema>;

// ── Programme–Subject link ────────────────────────────────────

export const setProgrammeSubjectsSchema = z.object({
  subjectIds: z
    .array(z.string().cuid("Invalid subject ID."))
    .min(1, "At least one subject is required."),
});

export type SetProgrammeSubjectsInput = z.infer<typeof setProgrammeSubjectsSchema>;
