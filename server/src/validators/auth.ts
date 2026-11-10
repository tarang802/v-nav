import { z } from 'zod';
import { OTP_LENGTH, PASSWORD_MAX, PASSWORD_MIN, REG_NO_PATTERN } from '../constants/auth.js';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address' }));

// Strength rules beyond length live in PasswordService so they can use account context.
const password = z.string().min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters`).max(PASSWORD_MAX);

export const registerBody = z.strictObject({
  name: z.string().trim().min(2).max(60),
  email,
  regNo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(REG_NO_PATTERN, 'Registration number looks like 22BCE1234'),
  password,
});

export const verifyEmailBody = z.strictObject({
  email,
  code: z.string().trim().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Enter the ${OTP_LENGTH}-digit code`),
});

export const emailOnlyBody = z.strictObject({ email });

export const loginBody = z.strictObject({
  email,
  // Max only: existing passwords are checked against the hash, not re-validated.
  password: z.string().min(1).max(PASSWORD_MAX),
});

export const resetPasswordBody = z.strictObject({
  token: z.string().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/),
  password,
});

export const changePasswordBody = z.strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: password,
});

export const sessionIdParams = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid session id'),
});
