// ============================================================
// Wamanafo SHS — Teacher Validators
// ============================================================

import { z } from "zod";

export const createTeacherSchema = z.object({
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

  staffId: z
    .string({ required_error: "Staff ID is required." })
    .min(1, "Staff ID cannot be empty.")
    .max(30, "Staff ID is too long.")
    .trim(),

  password: z
    .string({ required_error: "Initial password is required." })
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password is too long."),
});

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;

export const updateTeacherSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName:  z.string().min(1).max(100).trim().optional(),
  email: z
    .string()
    .email("Please enter a valid email address.")
    .max(255)
    .transform((v) => v.toLowerCase().trim())
    .optional(),
  staffId:  z.string().min(1).max(30).trim().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;

export const teacherQuerySchema = z.object({
  search:   z.string().max(100).optional(),
  isActive: z.coerce.boolean().optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type TeacherQueryInput = z.infer<typeof teacherQuerySchema>;
