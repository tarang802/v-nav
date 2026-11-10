import type { User } from '../models/User.js';

type AnyUser = Omit<User, 'passwordHash'>;

const isVerified = (u: AnyUser) => u.status === 'active' && Boolean(u.verification?.verifiedAt);

/** The owner's own view of their account. Never includes the password hash. */
export function toSelfUser(u: AnyUser) {
  return {
    id: u._id.toHexString(),
    name: u.name,
    email: u.email,
    regNo: u.regNo,
    role: u.role,
    status: u.status,
    isVerified: isVerified(u),
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

/** What any signed-in student may see about another student. No email, no reg. number. */
export function toPublicUser(u: AnyUser) {
  return {
    id: u._id.toHexString(),
    name: u.name,
    avatarUrl: u.avatar?.url ?? null,
    friendCode: u.friendCode,
    isVerified: isVerified(u),
  };
}

/**
 * What a friend may see. `lastSeenAt` only when the friend allows it.
 * Live `online` status is added in Phase 4 with the presence system.
 */
export function toFriendUser(u: AnyUser, friendsSince: Date) {
  const showOnline = u.privacy?.showOnlineStatus ?? true;
  return {
    ...toPublicUser(u),
    regNo: u.regNo,
    friendCount: u.friendCount ?? 0,
    friendsSince,
    ...(showOnline ? { lastSeenAt: u.lastSeenAt ?? null } : {}),
  };
}

export type SelfUser = ReturnType<typeof toSelfUser>;
export type PublicUser = ReturnType<typeof toPublicUser>;
export type FriendUser = ReturnType<typeof toFriendUser>;
