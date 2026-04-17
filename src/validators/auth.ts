// ============================================================
// Wamanafo SHS — Auth Validators
// ============================================================

import { z } from "zod";

export const authLoginSchema = z.object({
  email: z
    .string({ required_error: "Email is required." })
    .email("Please enter a valid email address.")
    .max(255, "Email is too long.")
    .transform((v) => v.toLowerCase().trim()),

  password: z
    .string({ required_error: "Password is required." })
    .min(1, "Password is required.")
    .max(128, "Password is too long."),
});

export type AuthLoginInput = z.infer<typeof authLoginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(128, "Password is too long.")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Password must contain at least one uppercase letter, one lowercase letter, and one number."
      ),
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
