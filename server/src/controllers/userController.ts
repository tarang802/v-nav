import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import type { DomainEvents } from '../events/domainEvents.js';
import type { UserRepository } from '../repositories/userRepository.js';
import { toSelfUser } from '../services/userPresenter.js';
import { AppError } from '../utils/AppError.js';

export function createUserController(users: UserRepository, events: DomainEvents) {
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

  return { me, updateMe, updatePrivacy };
}
