import type { Clock } from '../../auth/application/auth.ports';
import { encodeDeletionLogCursor } from '../domain/collection-deletion';
import type { DeletionLogPosition } from '../domain/collection-deletion';
import { CollectionDeletionsService } from './collection-deletions.service';
import { CollectionDeletionsError } from './collection-deletions.ports';
import type {
  CollectionDeletionLogRecord,
  CollectionDeletionPreview,
  CollectionDeletionsRepository,
  DeleteCollectionItemResult,
  RestoreCollectionDeletionResult,
} from './collection-deletions.ports';

const NOW = new Date('2026-09-30T03:00:00.000Z');
const ACTOR_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const ROUND_ID = '20000000-0000-4000-8000-000000000001';
const GROUP_ID = '30000000-0000-4000-8000-000000000001';
const FORM_ID = '60000000-0000-4000-8000-000000000001';
const DELETION_ID = '70000000-0000-4000-8000-000000000001';

const COUNTS = {
  assignedStudentCount: 40,
  formCount: 5,
  groupCount: 1,
  submittedStudentCount: 38,
};

const PREVIEW: CollectionDeletionPreview = {
  blockedReason: null,
  counts: COUNTS,
  group: null,
  kind: 'group',
  name: 'สหกิจ A',
  round: { id: ROUND_ID, name: 'สหกิจ 2569' },
};

function logRecord(index: number): CollectionDeletionLogRecord {
  return {
    counts: COUNTS,
    deletedAt: NOW,
    deletedAtMicros: `17902000000000${String(index).padStart(2, '0')}`,
    deletedByName: 'อาจารย์ สมศรี',
    groupName: null,
    id: `70000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    kind: 'group',
    name: 'สหกิจ A',
    restore: null,
    restoreAvailability: { status: 'available' },
    roundName: 'สหกิจ 2569',
  };
}

class FakeRepository implements CollectionDeletionsRepository {
  deleteInputs: Parameters<CollectionDeletionsRepository['deleteItem']>[0][] = [];
  deleteResult: DeleteCollectionItemResult = { deletionId: DELETION_ID, outcome: 'deleted' };
  listInputs: { before: DeletionLogPosition | null; limit: number }[] = [];
  logPage: { entries: CollectionDeletionLogRecord[]; hasMore: boolean } = {
    entries: [],
    hasMore: false,
  };
  preview: CollectionDeletionPreview | null = PREVIEW;
  restoreInputs: Parameters<CollectionDeletionsRepository['restoreDeletion']>[0][] = [];
  restoreResult: RestoreCollectionDeletionResult = { outcome: 'restored' };

  previewDeletion(): Promise<CollectionDeletionPreview | null> {
    return Promise.resolve(this.preview);
  }

  deleteItem(
    input: Parameters<CollectionDeletionsRepository['deleteItem']>[0],
  ): Promise<DeleteCollectionItemResult> {
    this.deleteInputs.push(input);
    return Promise.resolve(this.deleteResult);
  }

  restoreDeletion(
    input: Parameters<CollectionDeletionsRepository['restoreDeletion']>[0],
  ): Promise<RestoreCollectionDeletionResult> {
    this.restoreInputs.push(input);
    return Promise.resolve(this.restoreResult);
  }

  listDeletions(input: {
    before: DeletionLogPosition | null;
    limit: number;
  }): Promise<{ entries: CollectionDeletionLogRecord[]; hasMore: boolean }> {
    this.listInputs.push(input);
    return Promise.resolve(this.logPage);
  }
}

const clock: Clock = { now: () => NOW };

async function rejection(promise: Promise<unknown>): Promise<CollectionDeletionsError> {
  const error: unknown = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!(error instanceof CollectionDeletionsError)) throw new Error('expected a rejection');
  return error;
}

describe('CollectionDeletionsService', () => {
  let repository: FakeRepository;
  let service: CollectionDeletionsService;

  beforeEach(() => {
    repository = new FakeRepository();
    service = new CollectionDeletionsService(repository, clock);
  });

  describe('previewDeletion', () => {
    it('returns the preview of a live item', async () => {
      await expect(service.previewDeletion({ id: GROUP_ID, kind: 'group' })).resolves.toEqual(
        PREVIEW,
      );
    });

    it.each([
      ['round', 'ROUND_NOT_FOUND'],
      ['group', 'GROUP_NOT_FOUND'],
      ['form', 'FORM_NOT_FOUND'],
    ] as const)('reports a missing %s with the existing not-found code', async (kind, code) => {
      repository.preview = null;
      const error = await rejection(service.previewDeletion({ id: FORM_ID, kind }));
      expect(error).toMatchObject({ code, status: 404 });
    });
  });

  describe('deleteItem', () => {
    const input = {
      actorAccountId: ACTOR_ACCOUNT_ID,
      confirmationName: 'สหกิจ A',
      target: { id: GROUP_ID, kind: 'group' as const },
    };

    it('deletes at the current time as the authenticated actor', async () => {
      await expect(service.deleteItem(input)).resolves.toEqual({ deletionId: DELETION_ID });
      expect(repository.deleteInputs).toEqual([{ ...input, now: NOW }]);
    });

    it.each([
      [{ outcome: 'not_found' as const }, 'GROUP_NOT_FOUND', 404],
      [{ outcome: 'round_closed' as const }, 'ROUND_CLOSED', 409],
      [
        { outcome: 'confirmation_mismatch' as const },
        'COLLECTION_DELETION_CONFIRMATION_MISMATCH',
        409,
      ],
    ])('maps %o to %s', async (result, code, status) => {
      repository.deleteResult = result;
      const error = await rejection(service.deleteItem(input));
      expect(error).toMatchObject({ code, status });
    });
  });

  describe('restoreDeletion', () => {
    const input = { actorAccountId: ACTOR_ACCOUNT_ID, deletionId: DELETION_ID, reason: ' ลบผิด ' };

    it('restores with the trimmed reason at the current time', async () => {
      await expect(service.restoreDeletion(input)).resolves.toEqual({ deletionId: DELETION_ID });
      expect(repository.restoreInputs).toEqual([
        { actorAccountId: ACTOR_ACCOUNT_ID, deletionId: DELETION_ID, now: NOW, reason: 'ลบผิด' },
      ]);
    });

    it.each([
      ['blank', '   '],
      ['too long', 'ก'.repeat(2_001)],
    ])('rejects a %s reason before touching the repository', async (_case, reason) => {
      const error = await rejection(service.restoreDeletion({ ...input, reason }));
      expect(error).toMatchObject({ code: 'COLLECTION_RESTORE_REASON_INVALID', status: 422 });
      expect(repository.restoreInputs).toEqual([]);
    });

    it.each([
      [{ outcome: 'not_found' as const }, 'COLLECTION_DELETION_NOT_FOUND', 404],
      [
        { availability: { status: 'already_restored' as const }, outcome: 'unavailable' as const },
        'COLLECTION_DELETION_ALREADY_RESTORED',
        409,
      ],
      [
        { availability: { status: 'round_closed' as const }, outcome: 'unavailable' as const },
        'ROUND_CLOSED',
        409,
      ],
    ])('maps %o to %s', async (result, code, status) => {
      repository.restoreResult = result;
      const error = await rejection(service.restoreDeletion(input));
      expect(error).toMatchObject({ code, status });
      expect(error.details).toBeUndefined();
    });

    it('names the deleted ancestor so the Instructor knows what to restore first', async () => {
      repository.restoreResult = {
        availability: {
          ancestorKind: 'round',
          ancestorName: 'สหกิจ 2569',
          status: 'ancestor_deleted',
        },
        outcome: 'unavailable',
      };
      const error = await rejection(service.restoreDeletion(input));
      expect(error).toMatchObject({
        code: 'COLLECTION_DELETION_ANCESTOR_DELETED',
        details: { ancestorKind: 'round', ancestorName: 'สหกิจ 2569' },
        status: 409,
      });
    });
  });

  describe('listDeletions', () => {
    it('reads the first page of twenty without a cursor', async () => {
      repository.logPage = { entries: [logRecord(1)], hasMore: false };
      const page = await service.listDeletions({ cursor: undefined });
      expect(repository.listInputs).toEqual([{ before: null, limit: 20 }]);
      expect(page.nextCursor).toBeNull();
      expect(page.entries).toHaveLength(1);
      expect(page.entries[0]).not.toHaveProperty('deletedAtMicros');
    });

    it('issues a cursor at the last entry when more remain', async () => {
      repository.logPage = { entries: [logRecord(1), logRecord(2)], hasMore: true };
      const page = await service.listDeletions({ cursor: undefined });
      expect(page.nextCursor).toBe(
        encodeDeletionLogCursor({
          deletedAtMicros: logRecord(2).deletedAtMicros,
          deletionId: logRecord(2).id,
        }),
      );
    });

    it('continues after the position a cursor names', async () => {
      const position = { deletedAtMicros: '1790200000000001', deletionId: DELETION_ID };
      await service.listDeletions({ cursor: encodeDeletionLogCursor(position) });
      expect(repository.listInputs).toEqual([{ before: position, limit: 20 }]);
    });

    it('rejects a cursor it did not issue', async () => {
      const error = await rejection(service.listDeletions({ cursor: 'bm90LWEtY3Vyc29y' }));
      expect(error).toMatchObject({ code: 'COLLECTION_DELETION_CURSOR_INVALID', status: 400 });
      expect(repository.listInputs).toEqual([]);
    });
  });
});
