import { Router } from 'express';
import type { Container } from '../container.js';
import { createAuthController } from '../controllers/authController.js';
import { createUserController } from '../controllers/userController.js';
import { authenticate, requireCsrfHeaders } from '../middleware/auth.js';
import { globalIpLimit, globalUserLimit } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import {
  changePasswordBody,
  emailOnlyBody,
  loginBody,
  registerBody,
  resetPasswordBody,
  sessionIdParams,
  verifyEmailBody,
} from '../validators/auth.js';

export function createV1Router(c: Container): Router {
  const router = Router();
  const auth = createAuthController(c.services.auth, { cookieSecure: c.config.cookieSecure });
  const users = createUserController(c.repos.users);

  const ipLimit = globalIpLimit(c.services.limiter);
  const authed = [authenticate(c.services.tokens, c.services.sessions), globalUserLimit(c.services.limiter)];
  const csrf = requireCsrfHeaders(c.config.clientOrigins);

  // ── Auth (public) ──
  router.post('/auth/register', ipLimit, validate({ body: registerBody }), auth.register);
  router.post('/auth/verify-email', ipLimit, validate({ body: verifyEmailBody }), auth.verifyEmail);
  router.post('/auth/resend-verification', ipLimit, validate({ body: emailOnlyBody }), auth.resendVerification);
  router.post('/auth/login', ipLimit, validate({ body: loginBody }), auth.login);
  router.post('/auth/password/forgot', ipLimit, validate({ body: emailOnlyBody }), auth.forgotPassword);
  router.post('/auth/password/reset', ipLimit, validate({ body: resetPasswordBody }), auth.resetPassword);

  // ── Auth (refresh cookie) ──
  router.post('/auth/refresh', ipLimit, csrf, auth.refresh);
  router.post('/auth/logout', ipLimit, csrf, auth.logout);

  // ── Auth (access token) ──
  router.post('/auth/logout-all', ...authed, auth.logoutAll);
  router.get('/auth/sessions', ...authed, auth.listSessions);
  router.delete('/auth/sessions/:id', ...authed, validate({ params: sessionIdParams }), auth.revokeSession);
  router.post('/auth/password/change', ...authed, validate({ body: changePasswordBody }), auth.changePassword);

  // ── Users ──
  router.get('/users/me', ...authed, users.me);

  return router;
}
