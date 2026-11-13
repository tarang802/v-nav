import type { RequestHandler } from 'express';
import { AVATAR_MAX_PX } from '../constants/events.js';
import type { DomainEvents } from '../events/domainEvents.js';
import { getAuth } from '../middleware/auth.js';
import type { UserRepository } from '../repositories/userRepository.js';
import type { ImageService } from '../services/imageService.js';
import { Limits, type RateLimiter } from '../services/rateLimiter.js';
import { toSelfUser } from '../services/userPresenter.js';
import { AppError } from '../utils/AppError.js';

export interface UserControllerDeps {
  users: UserRepository;
  events: DomainEvents;
  images: ImageService;
  limiter: RateLimiter;
}

export function createUserController({ users, events, images, limiter }: UserControllerDeps) {
  const me: RequestHandler = async (_req, res) => {
    const user = await users.findById(getAuth(res).userObjectId);
    if (!user || user.status !== 'active') throw AppError.unauthenticated();
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ user: toSelfUser(user) });
  };

  const updateMe: RequestHandler = async (req, res) => {
    const user = await users.updateProfile(getAuth(res).userObjectId, req.body as { name?: string });
    if (!user) throw AppError.unauthenticated();
    res.json({ user: toSelfUser(user) });
  };

  const updatePrivacy: RequestHandler = async (req, res) => {
    const user = await users.updatePrivacy(
      getAuth(res).userObjectId,
      req.body as { showOnlineStatus?: boolean; allowFriendRequests?: boolean },
    );
    if (!user) throw AppError.unauthenticated();
    await events.emit('user.privacyChanged', { userId: user._id });
    res.json({ privacy: toSelfUser(user).privacy });
  };

  /** Replaces the avatar with a re-encoded 512 px WebP; the previous file is deleted. */
  const setAvatar: RequestHandler = async (req, res) => {
    const { userId, userObjectId } = getAuth(res);
    await limiter.consume(Limits.uploadUser, userId);
    const stored = await images.store(req.file!.buffer, 'avatars', AVATAR_MAX_PX);
    const before = await users.swapAvatar(userObjectId, { ...stored, updatedAt: new Date() });
    if (!before) {
      await images.remove(stored.key);
      throw AppError.unauthenticated();
    }
    await images.remove(before.avatar?.key);
    res.json({ avatarUrl: stored.url });
  };

  const removeAvatar: RequestHandler = async (_req, res) => {
    const before = await users.swapAvatar(getAuth(res).userObjectId, null);
    if (!before) throw AppError.unauthenticated();
    await images.remove(before.avatar?.key);
    res.status(204).end();
  };

  return { me, updateMe, updatePrivacy, setAvatar, removeAvatar };
}
