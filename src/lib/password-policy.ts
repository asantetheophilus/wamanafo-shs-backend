// ============================================================
// Wamanafo SHS — Password Policy
// Min 6 chars, 1 uppercase, 1 lowercase, 1 special character.
// Shared between auth validator and student creation.
// ============================================================

import { z } from "zod";

export const PASSWORD_RULES = {
  minLength:    6,
  uppercase:    /[A-Z]/,
  lowercase:    /[a-z]/,
  specialChar:  /[^A-Za-z0-9]/,
} as const;

export function buildPasswordSchema(fieldName = "Password") {
  return z
    .string({ required_error: `${fieldName} is required.` })
    .min(PASSWORD_RULES.minLength, `${fieldName} must be at least ${PASSWORD_RULES.minLength} characters long.`)
    .max(128, `${fieldName} is too long.`)
    .refine((v) => PASSWORD_RULES.uppercase.test(v),  `${fieldName} must contain at least one uppercase letter.`)
    .refine((v) => PASSWORD_RULES.lowercase.test(v),  `${fieldName} must contain at least one lowercase letter.`)
    .refine((v) => PASSWORD_RULES.specialChar.test(v), `${fieldName} must contain at least one special character.`);
}

/** Human-readable list of unmet rules for frontend-style hint display */
export function getPasswordErrors(password: string): string[] {
  const errors: string[] = [];
  if (password.length < PASSWORD_RULES.minLength)
    errors.push(`At least ${PASSWORD_RULES.minLength} characters long`);
  if (!PASSWORD_RULES.uppercase.test(password))
    errors.push("At least one uppercase letter");
  if (!PASSWORD_RULES.lowercase.test(password))
    errors.push("At least one lowercase letter");
  if (!PASSWORD_RULES.specialChar.test(password))
    errors.push("At least one special character");
  return errors;
}
