import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH, SESSION_IDLE_TTL_MS } from '../constants/auth.js';
import { ErrorCode } from '../constants/errorCodes.js';
import { getAuth } from '../middleware/auth.js';
import type { AuthService } from '../services/authService.js';
import type { ClientContext } from '../services/sessionService.js';
import { AppError } from '../utils/AppError.js';

const ctxOf = (req: Request): ClientContext => ({
  ip: req.ip ?? 'unknown',
  userAgent: req.get('user-agent') ?? '',
});

export function createAuthController(auth: AuthService, opts: { cookieSecure: boolean }) {
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: opts.cookieSecure,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
  const setRefreshCookie = (res: Response, token: string) =>
    res.cookie(REFRESH_COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_IDLE_TTL_MS });
  const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
  const readRefreshCookie = (req: Request): string | undefined => {
    const v = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE_NAME];
    return typeof v === 'string' && /^[A-Za-z0-9_-]{20,200}$/.test(v) ? v : undefined;
  };

  // Responses that carry tokens must never be cached by browsers or proxies.
  const noStore = (res: Response) => res.setHeader('Cache-Control', 'no-store');

  const register: RequestHandler = async (req, res) => {
    res.status(202).json(await auth.register(req.body, ctxOf(req)));
  };

  const verifyEmail: RequestHandler = async (req, res) => {
    const result = await auth.verifyEmail(req.body, ctxOf(req));
    setRefreshCookie(res, result.refreshToken);
    noStore(res);
    res.json({ accessToken: result.accessToken, accessTokenExpiresAt: result.accessTokenExpiresAt, user: result.user });
  };

  const resendVerification: RequestHandler = async (req, res) => {
    await auth.resendVerification(req.body.email, ctxOf(req));
    res.status(202).json({ ok: true });
  };

  const login: RequestHandler = async (req, res) => {
    const result = await auth.login(req.body, ctxOf(req));
    setRefreshCookie(res, result.refreshToken);
    noStore(res);
    res.json({ accessToken: result.accessToken, accessTokenExpiresAt: result.accessTokenExpiresAt, user: result.user });
  };

  const refresh: RequestHandler = async (req, res) => {
    const token = readRefreshCookie(req);
    if (!token) throw AppError.unauthenticated('No session', ErrorCode.UNAUTHENTICATED);
    try {
      const result = await auth.refresh(token, ctxOf(req));
      setRefreshCookie(res, result.refreshToken);
      noStore(res);
      res.json({ accessToken: result.accessToken, accessTokenExpiresAt: result.accessTokenExpiresAt, user: result.user });
    } catch (err) {
      // A dead session's cookie is useless; remove it. Keep it on a benign race so the retry can use the new one.
      if (err instanceof AppError && err.code === ErrorCode.SESSION_REVOKED) clearRefreshCookie(res);
      throw err;
    }
  };

  const logout: RequestHandler = async (req, res) => {
    await auth.logout(readRefreshCookie(req), ctxOf(req));
    clearRefreshCookie(res);
    res.status(204).end();
  };

  const logoutAll: RequestHandler = async (req, res) => {
    await auth.logoutAll(getAuth(res).userObjectId, ctxOf(req));
    clearRefreshCookie(res);
    res.status(204).end();
  };

  const listSessions: RequestHandler = async (_req, res) => {
    const a = getAuth(res);
    res.json({ items: await auth.listSessions(a.userObjectId, a.sessionId) });
  };

  const revokeSession: RequestHandler = async (req, res) => {
    await auth.revokeSession(getAuth(res).userObjectId, String(req.params.id), ctxOf(req));
    res.status(204).end();
  };

  const forgotPassword: RequestHandler = async (req, res) => {
    await auth.forgotPassword(req.body.email, ctxOf(req));
    res.status(202).json({ ok: true });
  };

  const resetPassword: RequestHandler = async (req, res) => {
    await auth.resetPassword(req.body, ctxOf(req));
    clearRefreshCookie(res);
    res.status(204).end();
  };

  const changePassword: RequestHandler = async (req, res) => {
    const a = getAuth(res);
    await auth.changePassword(a.userObjectId, a.sessionObjectId, req.body, ctxOf(req));
    res.status(204).end();
  };

  return {
    register,
    verifyEmail,
    resendVerification,
    login,
    refresh,
    logout,
    logoutAll,
    listSessions,
    revokeSession,
    forgotPassword,
    resetPassword,
    changePassword,
  };
}
