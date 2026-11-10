import type { User } from '../models/User.js';

/** The owner's own view of their account. Never includes the password hash. */
export function toSelfUser(u: Omit<User, 'passwordHash'>) {
  return {
    id: u._id.toHexString(),
    name: u.name,
    email: u.email,
    regNo: u.regNo,
    role: u.role,
    status: u.status,
    isVerified: u.status === 'active' && Boolean(u.verification?.verifiedAt),
    friendCode: u.friendCode,
    avatarUrl: u.avatar?.url ?? null,
    privacy: {
      showOnlineStatus: u.privacy?.showOnlineStatus ?? true,
      allowFriendRequests: u.privacy?.allowFriendRequests ?? true,
    },
    friendCount: u.friendCount ?? 0,
    createdAt: (u as { createdAt?: Date }).createdAt ?? null,
  };
}

export type SelfUser = ReturnType<typeof toSelfUser>;
