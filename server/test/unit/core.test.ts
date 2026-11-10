import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { BCRYPT_COST } from '../../src/constants/auth.js';
import { ConfigError, loadConfig } from '../../src/config/env.js';
import { PasswordService } from '../../src/services/passwordService.js';
import { TokenService } from '../../src/services/tokenService.js';
import { AppError } from '../../src/utils/AppError.js';
import { randomFromAlphabet, randomNumericCode, safeEqualHex, sha256 } from '../../src/utils/crypto.js';
import { testEnv } from '../helpers/env.js';

describe('config', () => {
  it('loads a valid environment', () => {
    const c = loadConfig(testEnv);
    expect(c.allowedEmailDomains).toEqual(['vitstudent.ac.in']);
    expect(c.clientOrigins).toEqual(['http://localhost:5173']);
  });

  it('names missing variables without printing values', () => {
    const { MONGO_URI: _m, ...rest } = testEnv;
    expect(() => loadConfig({ ...rest, JWT_ACCESS_SECRET: 'short' })).toThrowError(ConfigError);
    try {
      loadConfig({ ...rest, JWT_ACCESS_SECRET: 'short' });
    } catch (e) {
      expect((e as Error).message).toContain('MONGO_URI');
      expect((e as Error).message).toContain('JWT_ACCESS_SECRET');
      expect((e as Error).message).not.toContain('short');
    }
  });

  it('rejects .env.example placeholders', () => {
    expect(() =>
      loadConfig({ ...testEnv, OTP_SECRET: 'replace-with-48-random-bytes-base64url-bbbbbbbbbbbbbbb' }),
    ).toThrow(/placeholder/);
  });

  it('requires the three secrets to differ', () => {
    expect(() => loadConfig({ ...testEnv, OTP_SECRET: testEnv.JWT_ACCESS_SECRET })).toThrow(/different/);
  });

  it('refuses insecure cookies in production', () => {
    expect(() => loadConfig({ ...testEnv, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
  });
});

describe('PasswordService', () => {
  const svc = new PasswordService(4);

  it('defaults to bcrypt cost 12', async () => {
    expect(BCRYPT_COST).toBe(12);
    const h = await new PasswordService().hash('a long enough passphrase');
    expect(h.startsWith('$2b$12$')).toBe(true);
  });

  it('verifies the right password and rejects others', async () => {
    const h = await svc.hash('a long enough passphrase');
    expect(await svc.verify('a long enough passphrase', h)).toBe(true);
    expect(await svc.verify('a long enough passphrasE', h)).toBe(false);
  });

  it('returns false (after a real comparison) when there is no hash', async () => {
    expect(await svc.verify('anything at all', null)).toBe(false);
  });

  it.each([
    ['too short', 'short1'],
    ['common', 'Password123'],
    ['low variety', 'aaaaabbbbbaaaaa'],
  ])('rejects %s passwords', (_label, pw) => {
    expect(() => svc.assertStrong(pw)).toThrowError(AppError);
  });

  it('rejects passwords containing the email local part or reg. number', () => {
    expect(() => svc.assertStrong('asha.r2024-secret!', { email: 'asha.r2024@vitstudent.ac.in' })).toThrow();
    expect(() => svc.assertStrong('my-22bce1234-pass', { regNo: '22BCE1234' })).toThrow();
    expect(() => svc.assertStrong('correct horse battery', { email: 'asha@vitstudent.ac.in' })).not.toThrow();
  });
});

describe('TokenService', () => {
  const secret = 'unit-test-secret-0123456789abcdefghijkl';
  const svc = new TokenService(secret);

  it('round-trips claims', () => {
    const { token } = svc.signAccess({ userId: 'u1', sessionId: 's1', role: 'student' });
    const c = svc.verifyAccess(token);
    expect(c).toMatchObject({ sub: 'u1', sid: 's1', role: 'student' });
    expect(c.exp - c.iat).toBe(15 * 60);
  });

  it('rejects expired tokens with TOKEN_EXPIRED', () => {
    const token = jwt.sign({ sid: 's', role: 'student' }, secret, {
      subject: 'u',
      expiresIn: -10,
      issuer: 'vnav-api',
      audience: 'vnav',
    });
    expect(() => svc.verifyAccess(token)).toThrowError(expect.objectContaining({ code: 'TOKEN_EXPIRED' }));
  });

  it('rejects tokens signed with another secret, "none" alg, or unknown roles', () => {
    const other = new TokenService('another-secret-0123456789abcdefghijklmn');
    const { token } = other.signAccess({ userId: 'u', sessionId: 's', role: 'student' });
    expect(() => svc.verifyAccess(token)).toThrowError(expect.objectContaining({ code: 'UNAUTHENTICATED' }));

    const none = jwt.sign({ sid: 's', role: 'student', sub: 'u', iss: 'vnav-api', aud: 'vnav' }, '', { algorithm: 'none' });
    expect(() => svc.verifyAccess(none)).toThrow();

    const badRole = jwt.sign({ sid: 's', role: 'superuser' }, secret, { subject: 'u', expiresIn: 60, issuer: 'vnav-api', audience: 'vnav' });
    expect(() => svc.verifyAccess(badRole)).toThrow();
  });
});

describe('crypto utils', () => {
  it('compares digests in constant time and handles mismatched lengths', () => {
    const a = sha256('x');
    expect(safeEqualHex(a, sha256('x'))).toBe(true);
    expect(safeEqualHex(a, sha256('y'))).toBe(false);
    expect(safeEqualHex(a, 'abcd')).toBe(false);
    expect(safeEqualHex('', '')).toBe(false);
  });

  it('generates codes of the right shape', () => {
    expect(randomNumericCode(6)).toMatch(/^\d{6}$/);
    expect(randomFromAlphabet('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 5)).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}$/);
  });
});
