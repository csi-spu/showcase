import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUTH_CLOCK } from '../../auth/application/auth.ports';
import type { Clock } from '../../auth/application/auth.ports';
import {
  decodeDeletionLogCursor,
  DELETION_LOG_PAGE_SIZE,
  encodeDeletionLogCursor,
} from '../domain/collection-deletion';
import type { CollectionDeletionTargetKind } from '../domain/collection-deletion';
import {
  COLLECTION_DELETIONS_REPOSITORY,
  CollectionDeletionsError,
} from './collection-deletions.ports';
import type {
  CollectionDeletionLogEntry,
  CollectionDeletionLogPage,
  CollectionDeletionLogRecord,
  CollectionDeletionPreview,
  CollectionDeletionsRepository,
  CollectionDeletionTarget,
} from './collection-deletions.ports';

/* The existing not-found code for each kind, so a deleted item reads as absent. */
const NOT_FOUND_CODE: Record<CollectionDeletionTargetKind, string> = {
  form: 'FORM_NOT_FOUND',
  group: 'GROUP_NOT_FOUND',
  round: 'ROUND_NOT_FOUND',
};

const ANCESTOR_DELETED_CODE = 'COLLECTION_DELETION_ANCESTOR_DELETED';

/**
 * Deleting and restoring collection items (ADR 0023).
 *
 * Logs carry ids and error codes only: never the typed confirmation, the
 * restore reason, or anything about the Students beneath the item.
 */
@Injectable()
export class CollectionDeletionsService {
  private readonly logger = new Logger(CollectionDeletionsService.name);

  constructor(
    @Inject(COLLECTION_DELETIONS_REPOSITORY)
    private readonly repository: CollectionDeletionsRepository,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
  ) {}

  async previewDeletion(target: CollectionDeletionTarget): Promise<CollectionDeletionPreview> {
    const preview = await this.repository.previewDeletion(target);
    if (preview === null) {
      throw this.reject('collection_deletion_preview', NOT_FOUND_CODE[target.kind], 404, {
        targetId: target.id,
        targetKind: target.kind,
      });
    }
    return preview;
  }

  async deleteItem(input: {
    actorAccountId: string;
    confirmationName: string;
    target: CollectionDeletionTarget;
  }): Promise<{ deletionId: string }> {
    const operation = 'collection_deletion_delete';
    const fields = {
      actorAccountId: input.actorAccountId,
      targetId: input.target.id,
      targetKind: input.target.kind,
    };
    const result = await this.repository.deleteItem({ ...input, now: this.clock.now() });
    if (result.outcome === 'not_found') {
      throw this.reject(operation, NOT_FOUND_CODE[input.target.kind], 404, fields);
    }
    if (result.outcome === 'round_closed') {
      throw this.reject(operation, 'ROUND_CLOSED', 409, fields);
    }
    if (result.outcome === 'confirmation_mismatch') {
      throw this.reject(operation, 'COLLECTION_DELETION_CONFIRMATION_MISMATCH', 409, fields);
    }
    this.logger.log({ ...fields, deletionId: result.deletionId, operation });
    return { deletionId: result.deletionId };
  }

  async restoreDeletion(input: {
    actorAccountId: string;
    deletionId: string;
    reason: string;
  }): Promise<{ deletionId: string }> {
    const operation = 'collection_deletion_restore';
    const fields = { actorAccountId: input.actorAccountId, deletionId: input.deletionId };
    const reason = input.reason.trim();
    if (reason.length === 0 || reason.length > 2_000) {
      throw this.reject(operation, 'COLLECTION_RESTORE_REASON_INVALID', 422, fields);
    }
    const result = await this.repository.restoreDeletion({
      actorAccountId: input.actorAccountId,
      deletionId: input.deletionId,
      now: this.clock.now(),
      reason,
    });
    if (result.outcome === 'not_found') {
      throw this.reject(operation, 'COLLECTION_DELETION_NOT_FOUND', 404, fields);
    }
    if (result.outcome === 'unavailable') {
      const { availability } = result;
      if (availability.status === 'already_restored') {
        throw this.reject(operation, 'COLLECTION_DELETION_ALREADY_RESTORED', 409, fields);
      }
      if (availability.status === 'round_closed') {
        throw this.reject(operation, 'ROUND_CLOSED', 409, fields);
      }
      this.logger.warn({ ...fields, errorCode: ANCESTOR_DELETED_CODE, operation });
      throw new CollectionDeletionsError(ANCESTOR_DELETED_CODE, 409, {
        ancestorKind: availability.ancestorKind,
        ancestorName: availability.ancestorName,
      });
    }
    this.logger.log({ ...fields, operation });
    return { deletionId: input.deletionId };
  }

  async listDeletions(input: { cursor: string | undefined }): Promise<CollectionDeletionLogPage> {
    const before = input.cursor === undefined ? null : decodeDeletionLogCursor(input.cursor);
    if (input.cursor !== undefined && before === null) {
      throw this.reject('collection_deletion_list', 'COLLECTION_DELETION_CURSOR_INVALID', 400, {});
    }
    const page = await this.repository.listDeletions({ before, limit: DELETION_LOG_PAGE_SIZE });
    const last = page.entries.at(-1);
    return {
      entries: page.entries.map(toLogEntry),
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeDeletionLogCursor({ deletedAtMicros: last.deletedAtMicros, deletionId: last.id })
          : null,
    };
  }

  private reject(
    operation: string,
    errorCode: string,
    status: number,
    fields: Record<string, string>,
  ): CollectionDeletionsError {
    this.logger.warn({ ...fields, errorCode, operation });
    return new CollectionDeletionsError(errorCode, status);
  }
}

/* The log position is cursor material only; it never leaves Core. */
function toLogEntry(record: CollectionDeletionLogRecord): CollectionDeletionLogEntry {
  return {
    counts: record.counts,
    deletedAt: record.deletedAt,
    deletedByName: record.deletedByName,
    groupName: record.groupName,
    id: record.id,
    kind: record.kind,
    name: record.name,
    restore: record.restore,
    restoreAvailability: record.restoreAvailability,
    roundName: record.roundName,
  };
}
