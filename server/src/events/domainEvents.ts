import type { Types } from 'mongoose';
import type { Logger } from '../observability/logger.js';

type Id = Types.ObjectId;

/** Why a student's location stopped being visible to their friends. */
export type LocationStopReason = 'stopped' | 'expired' | 'signed_out';

/**
 * Things that happened in the domain that other parts of the app react to.
 * Services publish; the real-time layer subscribes. Services never import
 * Socket.IO.
 */
export interface DomainEventMap {
  'friend.requestCreated': { requestId: Id; from: Id; to: Id; createdAt: Date };
  'friend.created': { a: Id; b: Id; since: Date };
  /** Unfriend or block. Location delivery between a and b must stop. */
  'friend.ended': { a: Id; b: Id };
  'session.revoked': { userId: Id; sessionIds: Id[]; reason: string; allSessions: boolean };
  'user.privacyChanged': { userId: Id };
  'location.stopped': { userId: Id; reason: LocationStopReason };
}

type Listener<T> = (payload: T) => void | Promise<void>;

/**
 * In-process, typed event bus. Listeners run in order after the change has
 * been committed; a failing listener is logged and never fails the request
 * that published the event. Cross-instance fan-out is the listener's job
 * (the Socket.IO Redis adapter).
 */
export class DomainEvents {
  private readonly listeners = new Map<keyof DomainEventMap, Listener<never>[]>();

  constructor(private readonly logger: Logger) {}

  on<K extends keyof DomainEventMap>(name: K, listener: Listener<DomainEventMap[K]>): () => void {
    const list = this.listeners.get(name) ?? [];
    list.push(listener as Listener<never>);
    this.listeners.set(name, list);
    return () => {
      const current = this.listeners.get(name) ?? [];
      this.listeners.set(
        name,
        current.filter((l) => l !== listener),
      );
    };
  }

  async emit<K extends keyof DomainEventMap>(name: K, payload: DomainEventMap[K]): Promise<void> {
    for (const listener of this.listeners.get(name) ?? []) {
      try {
        await (listener as Listener<DomainEventMap[K]>)(payload);
      } catch (err) {
        this.logger.error({ err, event: name }, 'domain event listener failed');
      }
    }
  }
}
