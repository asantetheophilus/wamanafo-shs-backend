// ============================================================
// Wamanafo SHS — Student Validators
// ============================================================

import { z } from "zod";
import { StudentStatus } from "../lib/enums";

export const createStudentSchema = z.object({
  firstName: z
    .string({ required_error: "First name is required." })
    .min(1, "First name cannot be empty.")
    .max(100, "First name is too long.")
    .trim(),

  lastName: z
    .string({ required_error: "Last name is required." })
    .min(1, "Last name cannot be empty.")
    .max(100, "Last name is too long.")
    .trim(),

  email: z
    .string({ required_error: "Email is required." })
    .email("Please enter a valid email address.")
    .max(255)
    .transform((v) => v.toLowerCase().trim()),

  indexNumber: z
    .string({ required_error: "Student index number is required." })
    .min(1, "Index number cannot be empty.")
    .max(20, "Index number is too long.")
    .trim(),

  dateOfBirth: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Date of birth must be a valid date (YYYY-MM-DD)."
    )
    .refine(
      (val) => {
        const d = new Date(val);
        return !isNaN(d.getTime()) && d < new Date();
      },
      "Date of birth must be a valid past date."
    )
    .optional()
    .or(z.literal("").transform(() => undefined)),

  gender: z.enum(["Male", "Female", "Other"]).optional(),

  classId: z.string().cuid("Invalid class ID.").optional(),
  yearId:  z.string().cuid("Invalid academic year ID.").optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial().extend({
  status: z.nativeEnum(StudentStatus).optional(),
});

export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const studentQuerySchema = z.object({
  classId:   z.string().cuid().optional(),
  yearId:    z.string().cuid().optional(),
  status:    z.nativeEnum(StudentStatus).optional(),
  search:    z.string().max(100).optional(),
  page:      z.coerce.number().int().min(1).default(1),
  pageSize:  z.coerce.number().int().min(1).max(100).default(20),
});

export type StudentQueryInput = z.infer<typeof studentQuerySchema>;
