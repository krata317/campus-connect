import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

/**
 * Secrets that are handed to a user (OTPs, link tokens, institute student codes)
 * are never stored in plaintext. Two different strategies are used:
 *
 *  - OTPs are short (6 digits), so they are keyed with a server-side secret.
 *    A database dump alone is not enough to brute-force them offline.
 *  - Link tokens and student codes are long and random, so a plain SHA-256 is
 *    already safe; the same helper keeps the storage format uniform.
 */

const pepper = `${env.SESSION_SECRET}:campusconnect`;

/** 6-digit numeric code, uniformly distributed. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Ties the OTP hash to its pending registration so hashes are not reusable elsewhere. */
export function hashOtp(pendingId: string, otp: string): string {
  return createHmac('sha256', pepper).update(`otp:${pendingId}:${otp}`).digest('hex');
}

export function verifyOtpHash(pendingId: string, otp: string, expectedHash: string): boolean {
  return safeEqual(hashOtp(pendingId, otp), expectedHash);
}

/** 256 bits of entropy, URL-safe. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(`${pepper}:${token}`).digest('hex');
}

const CODE_ALPHABET = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789';

/** 32 characters from an unambiguous alphabet (no O/0/I/1). */
export function generateStudentCode(): string {
  const bytes = randomBytes(32);
  let code = '';
  for (let index = 0; index < 32; index += 1) {
    code += CODE_ALPHABET[bytes[index]! % CODE_ALPHABET.length];
  }
  return code;
}

export function hashStudentCode(instituteId: string, code: string): string {
  return createHmac('sha256', pepper)
    .update(`student-code:${instituteId}:${code.trim().toUpperCase()}`)
    .digest('hex');
}

export function verifyStudentCode(instituteId: string, code: string, expectedHash: string | null): boolean {
  if (!expectedHash) return false;
  return safeEqual(hashStudentCode(instituteId, code), expectedHash);
}

/** Constant-time comparison that tolerates different lengths. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    // Still burn a comparison so the timing does not leak the length.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export const minutesFromNow = (minutes: number): string => new Date(Date.now() + minutes * 60 * 1000).toISOString();

export const msFromNow = (ms: number): string => new Date(Date.now() + ms).toISOString();

export const isExpired = (iso: string | null | undefined): boolean => {
  if (!iso) return true;
  return new Date(iso).getTime() <= Date.now();
};
