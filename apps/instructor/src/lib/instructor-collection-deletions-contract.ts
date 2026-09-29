import { z } from 'zod';

/*
 * The shape of the collection-deletions contract.
 *
 * Free of `server-only` so the delete dialog and the deletion log can share
 * these types; the client that talks to Core stays server-only.
 */

export const COLLECTION_DELETION_KINDS = ['round', 'group', 'form'] as const;
export type CollectionDeletionKind = (typeof COLLECTION_DELETION_KINDS)[number];

/* Names and titles are at most 200 characters; restore reasons at most 2,000. */
export const CONFIRMATION_NAME_MAX_LENGTH = 200;
export const RESTORE_REASON_MAX_LENGTH = 2_000;

const countsSchema = z
  .object({
    assignedStudentCount: z.number().int().min(0),
    formCount: z.number().int().min(0),
    groupCount: z.number().int().min(0),
    submittedStudentCount: z.number().int().min(0),
  })
  .strict();

const itemReferenceSchema = z.object({ id: z.uuid(), name: z.string().min(1) }).strict();

export const deletionPreviewSchema = z
  .object({
    blockedReason: z.enum(['round_closed']).nullable(),
    counts: countsSchema,
    group: itemReferenceSchema.nullable(),
    kind: z.enum(COLLECTION_DELETION_KINDS),
    name: z.string().min(1),
    round: itemReferenceSchema.nullable(),
  })
  .strict();

export const deletionResultSchema = z.object({ deletionId: z.uuid() }).strict();

const restoreAvailabilitySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('available') }).strict(),
  z.object({ status: z.literal('already_restored') }).strict(),
  z.object({ status: z.literal('round_closed') }).strict(),
  z
    .object({
      ancestorKind: z.enum(['group', 'round']),
      ancestorName: z.string().min(1),
      status: z.literal('ancestor_deleted'),
    })
    .strict(),
]);

export const deletionLogPageSchema = z
  .object({
    entries: z.array(
      z
        .object({
          counts: countsSchema,
          deletedAt: z.iso.datetime(),
          deletedByName: z.string(),
          groupName: z.string().nullable(),
          id: z.uuid(),
          kind: z.enum(COLLECTION_DELETION_KINDS),
          name: z.string().min(1),
          restore: z
            .object({
              reason: z.string().min(1),
              restoredAt: z.iso.datetime(),
              restoredByName: z.string(),
            })
            .strict()
            .nullable(),
          restoreAvailability: restoreAvailabilitySchema,
          roundName: z.string().nullable(),
        })
        .strict(),
    ),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();

export type CollectionDeletionPreview = z.infer<typeof deletionPreviewSchema>;
export type CollectionDeletionLogPage = z.infer<typeof deletionLogPageSchema>;
export type CollectionDeletionLogEntry = CollectionDeletionLogPage['entries'][number];
export type CollectionRestoreAvailability = CollectionDeletionLogEntry['restoreAvailability'];

export type DeletionPreviewReadResult =
  | { ok: true; preview: CollectionDeletionPreview }
  | { error: 'notFound' | 'unavailable'; ok: false };

export type DeletionLogReadResult = { ok: true; page: CollectionDeletionLogPage } | { ok: false };
