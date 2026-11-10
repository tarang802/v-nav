import type { Types } from 'mongoose';
import type { Models } from '../models/index.js';
import type { AuditAction } from '../models/AuditLog.js';
import type { Logger } from '../observability/logger.js';

export interface AuditEntry {
  action: AuditAction;
  actorId?: Types.ObjectId | null;
  targetId?: Types.ObjectId | null;
  ipHash?: string;
  meta?: Record<string, unknown>;
}

/**
 * Security audit trail. A failed audit write is logged but never fails the
 * user's request.
 */
export class AuditService {
  constructor(
    private readonly models: Models,
    private readonly logger: Logger,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.models.AuditLog.create(entry);
    } catch (err) {
      this.logger.error({ err, action: entry.action }, 'audit write failed');
    }
  }
}
