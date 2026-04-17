// ============================================================
// Wamanafo SHS — Term Configuration Validators
// ============================================================

import { z } from "zod";

// ============================================================
// Create / Update Term
// ============================================================

export const upsertTermSchema = z
  .object({
    yearId: z.string().cuid("Invalid academic year ID."),

    name: z
      .string({ required_error: "Term name is required." })
      .min(1, "Term name cannot be empty.")
      .max(50, "Term name must not exceed 50 characters.")
      .trim(),

    number: z
      .number({ required_error: "Term number is required." })
      .int("Term number must be a whole number.")
      .min(1, "Term number must be 1, 2, or 3.")
      .max(3, "Term number must be 1, 2, or 3."),

    totalSchoolDays: z
      .number({ required_error: "Total school days is required." })
      .int("Total school days must be a whole number.")
      .min(1, "Total school days must be at least 1.")
      .max(120, "Total school days cannot exceed 120."),

    classScoreWeight: z
      .number({ required_error: "Class score weight is required." })
      .int("Class score weight must be a whole number.")
      .min(1, "Class score weight must be at least 1.")
      .max(99, "Class score weight must be less than 100."),

    examScoreWeight: z
      .number({ required_error: "Exam score weight is required." })
      .int("Exam score weight must be a whole number.")
      .min(1, "Exam score weight must be at least 1.")
      .max(99, "Exam score weight must be less than 100."),

    startDate: z
      .string()
      .datetime({ message: "Start date must be a valid date." })
      .optional(),

    endDate: z
      .string()
      .datetime({ message: "End date must be a valid date." })
      .optional(),

    isCurrent: z.boolean().optional().default(false),
  })
  .refine(
    (data) => data.classScoreWeight + data.examScoreWeight === 100,
    {
      message: "Class score weight and exam score weight must add up to exactly 100.",
      path: ["examScoreWeight"],
    }
  )
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) < new Date(data.endDate);
      }
      return true;
    },
    {
      message: "End date must be after start date.",
      path: ["endDate"],
    }
  );

export type UpsertTermInput = z.infer<typeof upsertTermSchema>;

// ============================================================
// Academic Year
// ============================================================

export const upsertAcademicYearSchema = z
  .object({
    schoolId: z.string().cuid("Invalid school ID."),

    name: z
      .string({ required_error: "Academic year name is required." })
      .min(1, "Name cannot be empty.")
      .max(20, "Name must not exceed 20 characters.")
      .trim(),

    startDate: z
      .string({ required_error: "Start date is required." })
      .datetime({ message: "Start date must be a valid date." }),

    endDate: z
      .string({ required_error: "End date is required." })
      .datetime({ message: "End date must be a valid date." }),

    isCurrent: z.boolean().optional().default(false),
  })
  .refine(
    (data) => new Date(data.startDate) < new Date(data.endDate),
    {
      message: "End date must be after start date.",
      path: ["endDate"],
    }
  );

export type UpsertAcademicYearInput = z.infer<typeof upsertAcademicYearSchema>;
