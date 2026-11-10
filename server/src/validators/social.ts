import { z } from 'zod';
import { FRIEND_CODE_ALPHABET, FRIEND_CODE_LENGTH, FRIEND_CODE_PREFIX } from '../constants/auth.js';
import { PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX } from '../constants/social.js';

const objectId = (label: string) => z.string().regex(/^[a-f0-9]{24}$/i, `Invalid ${label}`);

/**
 * Accepts `VNAV-A82KD`, `vnav-a82kd` or just `A82KD`, and normalises to the
 * stored form. Crockford look-alikes typed by hand are mapped (I/L → 1, O → 0).
 */
const codeBody = new RegExp(`^[${FRIEND_CODE_ALPHABET}]{${FRIEND_CODE_LENGTH}}$`);
export const friendCode = z
  .string()
  .trim()
  .max(20)
  .transform((s) => {
    const upper = s.toUpperCase();
    const body = upper.startsWith(FRIEND_CODE_PREFIX) ? upper.slice(FRIEND_CODE_PREFIX.length) : upper;
    return body.replace(/[IL]/g, '1').replace(/O/g, '0');
  })
  .pipe(z.string().regex(codeBody, 'Friend codes look like VNAV-A82KD'))
  .transform((body) => `${FRIEND_CODE_PREFIX}${body}`);

export const pageQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
  cursor: z.string().max(200).optional(),
});

export const lookupQuery = z.strictObject({ code: friendCode });
export const sendRequestBody = z.strictObject({ friendCode });
export const blockBody = z.strictObject({ userId: objectId('user id') });

export const userIdParams = z.strictObject({ userId: objectId('user id') });
export const idParams = z.strictObject({ id: objectId('id') });

export const updateProfileBody = z
  .strictObject({ name: z.string().trim().min(2).max(60).optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const updatePrivacyBody = z
  .strictObject({
    showOnlineStatus: z.boolean().optional(),
    allowFriendRequests: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
