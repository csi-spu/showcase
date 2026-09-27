import { z } from 'zod';
import { MAX_SELECTED_MEMBERS, RESOLVE_CHUNK_SIZE } from './member-selection-contract';

const nameSchema = z.string().trim().min(1).max(200);
/* A JSON array in one hidden field: the picker's selection, rechecked by Core. */
const memberAccountIdsSchema = z
  .string()
  .max(80_000)
  .transform((value, context) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      context.addIssue({ code: 'custom', message: 'memberAccountIds must be JSON' });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(z.uuid())
      .min(1)
      .max(MAX_SELECTED_MEMBERS)
      .refine((ids) => new Set(ids).size === ids.length),
  );
const createRoundSchema = z.object({ name: nameSchema });
const createGroupSchema = z.object({
  idempotencyKey: z.uuid(),
  memberAccountIds: memberAccountIdsSchema,
  name: nameSchema,
});
const createFormGroupSchema = z.discriminatedUnion('mode', [
  z.object({
    groupName: nameSchema,
    idempotencyKey: z.uuid(),
    memberAccountIds: memberAccountIdsSchema,
    mode: z.literal('existing-round'),
    roundId: z.uuid(),
  }),
  z.object({
    groupName: nameSchema,
    idempotencyKey: z.uuid(),
    memberAccountIds: memberAccountIdsSchema,
    mode: z.literal('new-round'),
    roundName: nameSchema,
  }),
]);
const addMembersSchema = z.object({ memberAccountIds: memberAccountIdsSchema });
const studentFilterSchema = z.object({
  entryYear: z.number().int().min(2400).max(2700).nullable(),
  groupId: z.uuid().nullable(),
  q: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .transform((value) => (value === null || value.length === 0 ? null : value)),
});
const studentListQuerySchema = studentFilterSchema.extend({
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .nullable(),
});
const selectAllQuerySchema = studentFilterSchema.extend({
  selectedCount: z.number().int().min(0).max(MAX_SELECTED_MEMBERS),
});
const resolveStudentIdsSchema = z.object({
  groupId: z.uuid().nullable(),
  studentIds: z
    .array(z.string().regex(/^[0-9]{8}$/))
    .min(1)
    .max(RESOLVE_CHUNK_SIZE),
});
const withdrawSchema = z.object({
  reason: z.string().trim().min(1).max(2_000),
  studentAccountId: z.uuid(),
});

export function validateCreateRound(formData: FormData) {
  const result = createRoundSchema.safeParse({ name: formData.get('name') });
  return result.success ? result.data : null;
}

export function validateCreateGroup(formData: FormData) {
  const result = createGroupSchema.safeParse({
    idempotencyKey: formData.get('idempotencyKey'),
    memberAccountIds: formData.get('memberAccountIds'),
    name: formData.get('name'),
  });
  return result.success ? result.data : null;
}

export function validateCreateFormGroup(formData: FormData) {
  const mode = formData.get('mode');
  const shared = {
    groupName: formData.get('groupName'),
    idempotencyKey: formData.get('idempotencyKey'),
    memberAccountIds: formData.get('memberAccountIds'),
    mode,
  };
  const result = createFormGroupSchema.safeParse(
    mode === 'existing-round'
      ? { ...shared, roundId: formData.get('roundId') }
      : { ...shared, roundName: formData.get('roundName') },
  );
  return result.success ? result.data : null;
}

export function validateAddMembers(formData: FormData) {
  const result = addMembersSchema.safeParse({
    memberAccountIds: formData.get('memberAccountIds'),
  });
  return result.success ? result.data : null;
}

/* Server functions receive untrusted arguments, so read inputs are parsed too. */
export function validateStudentListQuery(input: unknown) {
  const result = studentListQuerySchema.safeParse(input);
  return result.success ? result.data : null;
}

export function validateSelectAllQuery(input: unknown) {
  const result = selectAllQuerySchema.safeParse(input);
  return result.success ? result.data : null;
}

export function validateResolveStudentIds(input: unknown) {
  const result = resolveStudentIdsSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function validateWithdraw(formData: FormData) {
  const result = withdrawSchema.safeParse({
    reason: formData.get('reason'),
    studentAccountId: formData.get('studentAccountId'),
  });
  return result.success ? result.data : null;
}

export const validateReinstate = validateWithdraw;
