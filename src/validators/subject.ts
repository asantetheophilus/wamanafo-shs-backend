// ============================================================
// Wamanafo SHS — Subject Validators
// ============================================================

import { z } from "zod";

export const createSubjectSchema = z.object({
  name: z
    .string({ required_error: "Subject name is required." })
    .min(1, "Subject name cannot be empty.")
    .max(100, "Subject name is too long.")
    .trim(),

  code: z
    .string({ required_error: "Subject code is required." })
    .min(1, "Code cannot be empty.")
    .max(15, "Code must not exceed 15 characters.")
    .toUpperCase()
    .trim(),

  isCore: z.boolean({
    required_error: "Please specify whether this is a core subject.",
  }),
});

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = createSubjectSchema.partial();
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

export const subjectQuerySchema = z.object({
  isCore:   z.coerce.boolean().optional(),
  search:   z.string().max(100).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type SubjectQueryInput = z.infer<typeof subjectQuerySchema>;
