import { z } from 'zod';

/*
 * The shape of member selection (ADR 0019), free of `server-only` so the
 * picker can draw rows and statuses. Core sends Roster name, Entry Year,
 * Account ID, and the Student ID (ADR 0020), which is null until a Roster
 * import records it. A Student ID never enters a URL.
 */

/** One create or add request, and one "select all matching" snapshot, stays within this bound. */
export const MAX_SELECTED_MEMBERS = 2_000;
/** CSV Student IDs are resolved in chunks of at most this many. */
export const RESOLVE_CHUNK_SIZE = 500;
export const STUDENT_PAGE_SIZE = 50;

export const studentIdSchema = z
  .string()
  .regex(/^[0-9]{8}$/)
  .nullable();

export const selectableStudentSchema = z
  .object({
    accountId: z.uuid(),
    entryYear: z.number().int(),
    firstNameTh: z.string().min(1),
    lastNameTh: z.string().min(1),
    status: z.enum(['current_member', 'no_access', 'selectable', 'withdrawn_member']),
    studentId: studentIdSchema,
  })
  .strict();

export const studentPageSchema = z
  .object({
    hasCurrentAcademicYear: z.boolean(),
    nextCursor: z.string().nullable(),
    students: z.array(selectableStudentSchema),
  })
  .strict();

export const studentIdResolutionSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      outcome: z.enum(['matched', 'no_access']),
      position: z.number().int().min(0),
      student: selectableStudentSchema,
    })
    .strict(),
  z.object({ outcome: z.literal('not_found'), position: z.number().int().min(0) }).strict(),
]);

export type SelectableStudent = z.infer<typeof selectableStudentSchema>;
export type SelectionStatus = SelectableStudent['status'];
export type StudentPage = z.infer<typeof studentPageSchema>;
export type StudentIdResolution = z.infer<typeof studentIdResolutionSchema>;

export interface StudentListQuery {
  cursor: string | null;
  entryYear: number | null;
  /** Add flow only: statuses then reflect membership in this group. */
  groupId: string | null;
  q: string | null;
}

export type MemberSelectionReadError =
  | { error: 'selectionLimitExceeded'; matchingCount: number; ok: false }
  | { error: 'sessionExpired' | 'unavailable' | 'invalid'; ok: false };

/* Read-only server functions the picker calls; bound by each host page. */
export interface MemberSelectionReads {
  listEntryYears: () => Promise<{ entryYears: number[]; ok: true } | MemberSelectionReadError>;
  listStudents: (
    query: StudentListQuery,
  ) => Promise<({ ok: true } & StudentPage) | MemberSelectionReadError>;
  resolveStudentIds: (input: {
    groupId: string | null;
    studentIds: string[];
  }) => Promise<{ ok: true; results: StudentIdResolution[] } | MemberSelectionReadError>;
  selectAll: (
    query: Omit<StudentListQuery, 'cursor'> & { selectedCount: number },
  ) => Promise<{ ok: true; students: SelectableStudent[] } | MemberSelectionReadError>;
}
