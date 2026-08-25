import { z } from 'zod';

const rosterConflictResolutionSchema = z
  .object({
    batchId: z.uuid(),
    conflictId: z.uuid(),
    expectedVersion: z.coerce.number().int().positive(),
    idempotencyKey: z.uuid(),
    reason: z.string().max(2_000),
    resolution: z.enum(['keep_existing', 'accept_incoming_name']),
  })
  .strict();

export type RosterConflictValidationError = 'invalid' | 'reasonRequired';

export function validateRosterConflictResolution(formData: FormData) {
  const parsed = rosterConflictResolutionSchema.safeParse({
    batchId: formData.get('batchId'),
    conflictId: formData.get('conflictId'),
    expectedVersion: formData.get('expectedVersion'),
    idempotencyKey: formData.get('idempotencyKey'),
    reason: formData.get('reason') ?? '',
    resolution: formData.get('resolution'),
  });
  if (!parsed.success) return 'invalid' satisfies RosterConflictValidationError;
  const reason = parsed.data.reason.trim().normalize('NFC');
  if (parsed.data.resolution === 'accept_incoming_name' && reason.length === 0) {
    return 'reasonRequired' satisfies RosterConflictValidationError;
  }
  return {
    ...parsed.data,
    ...(reason.length > 0 ? { reason } : { reason: undefined }),
  };
}
