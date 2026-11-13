import { Router } from 'express';
import type { Container } from '../container.js';
import { createAuthController } from '../controllers/authController.js';
import { createEventController } from '../controllers/eventController.js';
import { createLocationController } from '../controllers/locationController.js';
import { createSocialController } from '../controllers/socialController.js';
import { createUserController } from '../controllers/userController.js';
import { authenticate, requireCsrfHeaders } from '../middleware/auth.js';
import { globalIpLimit, globalUserLimit } from '../middleware/rateLimit.js';
import { imageUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { createEventBody, eventIdParams, listEventsQuery, mapEventsQuery, updateEventBody } from '../validators/events.js';
import {
  changePasswordBody,
  emailOnlyBody,
  loginBody,
  registerBody,
  resetPasswordBody,
  sessionIdParams,
  verifyEmailBody,
} from '../validators/auth.js';
import {
  blockBody,
  idParams,
  lookupQuery,
  pageQuery,
  sendRequestBody,
  updatePrivacyBody,
  updateProfileBody,
  userIdParams,
} from '../validators/social.js';

export function createV1Router(c: Container): Router {
  const router = Router();
  const auth = createAuthController(c.services.auth, { cookieSecure: c.config.cookieSecure });
  const users = createUserController({ users: c.repos.users, events: c.events, images: c.services.images, limiter: c.services.limiter });
  const events = createEventController(c.services.events, c.services.sessions);
  const location = createLocationController(c.services.location);
  const social = createSocialController(c.services.friends, c.services.sessions);

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
  router.patch('/users/me', ...authed, validate({ body: updateProfileBody }), users.updateMe);
  router.patch('/users/me/privacy', ...authed, validate({ body: updatePrivacyBody }), users.updatePrivacy);
  router.put('/users/me/avatar', ...authed, imageUpload, users.setAvatar);
  router.delete('/users/me/avatar', ...authed, users.removeAvatar);
  // /users/lookup must be registered before /users/:userId.
  router.get('/users/lookup', ...authed, validate({ query: lookupQuery }), social.lookup);
  router.get('/users/:userId', ...authed, validate({ params: userIdParams }), social.getUser);

  // ── Friends ──
  router.get('/friends', ...authed, validate({ query: pageQuery }), social.listFriends);
  router.get('/friends/requests/incoming', ...authed, validate({ query: pageQuery }), social.incoming);
  router.get('/friends/requests/outgoing', ...authed, validate({ query: pageQuery }), social.outgoing);
  router.post('/friends/requests', ...authed, validate({ body: sendRequestBody }), social.sendRequest);
  router.post('/friends/requests/:id/accept', ...authed, validate({ params: idParams }), social.accept);
  router.post('/friends/requests/:id/reject', ...authed, validate({ params: idParams }), social.reject);
  router.delete('/friends/requests/:id', ...authed, validate({ params: idParams }), social.cancel);
  router.delete('/friends/:userId', ...authed, validate({ params: userIdParams }), social.unfriend);

  // ── Blocks ──
  router.get('/blocks', ...authed, validate({ query: pageQuery }), social.listBlocks);
  router.post('/blocks', ...authed, validate({ body: blockBody }), social.block);
  router.delete('/blocks/:userId', ...authed, validate({ params: userIdParams }), social.unblock);

  // ── Location (own state only) ──
  router.get('/location/sharing', ...authed, location.sharing);
  router.post('/location/sharing/stop', ...authed, location.stop);

  // ── Events ──
  router.get('/events', ...authed, validate({ query: listEventsQuery }), events.list);
  // /events/map must be registered before /events/:id.
  router.get('/events/map', ...authed, validate({ query: mapEventsQuery }), events.map);
  router.post('/events', ...authed, validate({ body: createEventBody }), events.create);
  router.get('/events/:id', ...authed, validate({ params: eventIdParams }), events.get);
  router.patch('/events/:id', ...authed, validate({ params: eventIdParams, body: updateEventBody }), events.update);
  router.delete('/events/:id', ...authed, validate({ params: eventIdParams }), events.remove);
  // Params are validated before the upload is read, so a bad id never costs a 5 MB parse.
  router.put('/events/:id/image', ...authed, validate({ params: eventIdParams }), imageUpload, events.setImage);
  router.delete('/events/:id/image', ...authed, validate({ params: eventIdParams }), events.removeImage);

  return router;
}
