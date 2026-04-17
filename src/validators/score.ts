// ============================================================
// Wamanafo SHS — Score Validators
// ============================================================

import { z } from "zod";
import { ScoreStatus } from "../lib/enums";
import { SCORE_MIN, SCORE_MAX } from "../lib/constants";


// Nullable raw score — null means "not yet entered"
const nullableRawScoreField = (label: string) =>
  z
    .number({
      invalid_type_error: `${label} must be a whole number.`,
    })
    .int(`${label} must be a whole number — no decimals.`)
    .min(SCORE_MIN, `${label} cannot be less than ${SCORE_MIN}.`)
    .max(SCORE_MAX, `${label} cannot exceed ${SCORE_MAX}.`)
    .nullable()
    .optional();

// ============================================================
// Create / Update score (DRAFT)
// ============================================================

export const upsertScoreSchema = z.object({
  studentId: z.string().cuid("Invalid student ID."),
  subjectId: z.string().cuid("Invalid subject ID."),
  termId:    z.string().cuid("Invalid term ID."),
  classScore: nullableRawScoreField("Class score"),
  examScore:  nullableRawScoreField("Exam score"),
});

export type UpsertScoreInput = z.infer<typeof upsertScoreSchema>;

// ============================================================
// Bulk score entry (teacher entering a full class)
// ============================================================

export const bulkUpsertScoresSchema = z.object({
  subjectId: z.string().cuid("Invalid subject ID."),
  termId:    z.string().cuid("Invalid term ID."),
  classId:   z.string().cuid("Invalid class ID."),
  scores: z
    .array(
      z.object({
        studentId:  z.string().cuid("Invalid student ID."),
        classScore: nullableRawScoreField("Class score"),
        examScore:  nullableRawScoreField("Exam score"),
      })
    )
    .min(1, "At least one score entry is required."),
});

export type BulkUpsertScoresInput = z.infer<typeof bulkUpsertScoresSchema>;

// ============================================================
// Submit scores for approval
// ============================================================

export const submitScoresSchema = z.object({
  subjectId: z.string().cuid("Invalid subject ID."),
  termId:    z.string().cuid("Invalid term ID."),
  classId:   z.string().cuid("Invalid class ID."),
});

export type SubmitScoresInput = z.infer<typeof submitScoresSchema>;

// ============================================================
// Approve scores (admin)
// ============================================================

export const approveScoresSchema = z.object({
  scoreIds: z
    .array(z.string().cuid("Invalid score ID."))
    .min(1, "Select at least one score to approve."),
});

export type ApproveScoresInput = z.infer<typeof approveScoresSchema>;

// ============================================================
// Request amendment (admin)
// ============================================================

export const requestAmendmentSchema = z.object({
  scoreIds: z
    .array(z.string().cuid("Invalid score ID."))
    .min(1, "Select at least one score."),
  reason: z
    .string({ required_error: "A reason for amendment is required." })
    .min(10, "Please provide a more detailed reason (at least 10 characters).")
    .max(500, "Reason must not exceed 500 characters."),
});

export type RequestAmendmentInput = z.infer<typeof requestAmendmentSchema>;

// ============================================================
// Score query / filter params
// ============================================================

export const scoreQuerySchema = z.object({
  termId:    z.string().cuid().optional(),
  classId:   z.string().cuid().optional(),
  subjectId: z.string().cuid().optional(),
  status:    z.nativeEnum(ScoreStatus).optional(),
  page:      z.coerce.number().int().min(1).default(1),
  pageSize:  z.coerce.number().int().min(1).max(100).default(20),
});

export type ScoreQueryInput = z.infer<typeof scoreQuerySchema>;
