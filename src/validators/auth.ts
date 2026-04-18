// ============================================================
// Wamanafo SHS — Auth Validators (updated with strong password policy)
// ============================================================

import { z } from "zod";
import { buildPasswordSchema } from "../lib/password-policy";

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
    newPassword:     buildPasswordSchema("New password"),
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: "Email is required." })
    .email("Please enter a valid email address.")
    .max(255)
    .transform((v) => v.toLowerCase().trim()),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token:           z.string().min(1, "Reset token is required."),
    newPassword:     buildPasswordSchema("Password"),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
