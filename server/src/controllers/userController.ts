import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import type { UserRepository } from '../repositories/userRepository.js';
import { toSelfUser } from '../services/userPresenter.js';
import { AppError } from '../utils/AppError.js';

export function createUserController(users: UserRepository) {
  const me: RequestHandler = async (_req, res) => {
    const user = await users.findById(getAuth(res).userObjectId);
    if (!user || user.status !== 'active') throw AppError.unauthenticated();
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ user: toSelfUser(user) });
  };
  return { me };
}
