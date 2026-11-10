import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const hmacSha256 = (secret: string, value: string) =>
  createHmac('sha256', secret).update(value).digest('hex');

/** URL-safe opaque token with `bytes` of entropy. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** Uniformly random numeric code, zero-padded. */
export const randomNumericCode = (length: number) =>
  Array.from({ length }, () => randomInt(0, 10)).join('');

export const randomFromAlphabet = (alphabet: string, length: number) =>
  Array.from({ length }, () => alphabet[randomInt(0, alphabet.length)]).join('');

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}
