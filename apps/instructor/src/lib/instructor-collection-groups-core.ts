import 'server-only';
import { CoreClient } from '@showcase/core-client';
import { z } from 'zod';
import {
  selectableStudentSchema,
  STUDENT_PAGE_SIZE,
  studentIdResolutionSchema,
  studentPageSchema,
  type SelectableStudent,
  type StudentIdResolution,
  type StudentPage,
} from './member-selection-contract';

/* Member mutations write up to 2,000 rows and their obligations in one transaction. */
const MEMBER_MUTATION_TIMEOUT_MILLISECONDS = 30_000;

const roundSchema = z
  .object({
    createdAt: z.iso.datetime(),
    id: z.uuid(),
    name: z.string().min(1),
    status: z.enum(['active', 'closed']),
  })
  .strict();

const groupSchema = z
  .object({
    createdAt: z.iso.datetime(),
    id: z.uuid(),
    name: z.string().min(1),
    roundId: z.uuid(),
  })
  .strict();

const memberSchema = z
  .object({
    addedAt: z.iso.datetime(),
    entryYear: z.number().int(),
    firstNameTh: z.string().min(1),
    lastNameTh: z.string().min(1),
    membershipSource: z.enum([
      'entry_year',
      'individual',
      'instructor_selection',
      'student_id_list',
    ]),
    status: z.enum(['current', 'withdrawn']),
    studentAccountId: z.uuid(),
    withdrawalReason: z.string().nullable(),
    withdrawnAt: z.iso.datetime().nullable(),
  })
  .strict();

const addMembersResultSchema = z
  .object({ added: z.number().int().min(0), alreadyMember: z.number().int().min(0) })
  .strict();

const groupDetailSchema = z.object({ group: groupSchema, members: z.array(memberSchema) }).strict();
const roundWithGroupSchema = z.object({ group: groupSchema, round: roundSchema }).strict();

export type InstructorCollectionRound = z.infer<typeof roundSchema>;
export type InstructorCollectionGroup = z.infer<typeof groupSchema>;
export type InstructorGroupMember = z.infer<typeof memberSchema>;
export type InstructorAddMembersResult = z.infer<typeof addMembersResultSchema>;
export type InstructorGroupDetail = z.infer<typeof groupDetailSchema>;

interface InstructorCollectionGroupsCoreConfig {
  coreUrl: string;
  instructorBffSecret: string;
}

export class InstructorCollectionGroupsCoreClient {
  private readonly client: CoreClient;

  constructor(config: InstructorCollectionGroupsCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: { headerName: 'x-instructor-bff-secret', value: config.instructorBffSecret },
      fetchImpl,
    });
  }

  createRound(sessionToken: string, input: { name: string }): Promise<InstructorCollectionRound> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: '/v1/internal/instructor/rounds',
      responseSchema: roundSchema,
      sessionToken,
    });
  }

  createRoundWithGroupAndMembers(
    sessionToken: string,
    input: {
      groupName: string;
      idempotencyKey: string;
      memberAccountIds: string[];
      roundName: string;
    },
  ): Promise<{ group: InstructorCollectionGroup; round: InstructorCollectionRound }> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: '/v1/internal/instructor/rounds/with-group',
      responseSchema: roundWithGroupSchema,
      sessionToken,
      timeoutMilliseconds: MEMBER_MUTATION_TIMEOUT_MILLISECONDS,
    });
  }

  listRounds(sessionToken: string): Promise<InstructorCollectionRound[]> {
    return this.client.request({
      method: 'GET',
      path: '/v1/internal/instructor/rounds',
      responseSchema: z.array(roundSchema),
      sessionToken,
    });
  }

  createGroupWithMembers(
    sessionToken: string,
    roundId: string,
    input: { idempotencyKey: string; memberAccountIds: string[]; name: string },
  ): Promise<InstructorCollectionGroup> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/instructor/rounds/${roundId}/groups`,
      responseSchema: groupSchema,
      sessionToken,
      timeoutMilliseconds: MEMBER_MUTATION_TIMEOUT_MILLISECONDS,
    });
  }

  listGroups(sessionToken: string, roundId: string): Promise<InstructorCollectionGroup[]> {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/instructor/rounds/${roundId}/groups`,
      responseSchema: z.array(groupSchema),
      sessionToken,
    });
  }

  getGroup(sessionToken: string, groupId: string): Promise<InstructorGroupDetail> {
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/instructor/groups/${groupId}`,
      responseSchema: groupDetailSchema,
      sessionToken,
    });
  }

  addMembers(
    sessionToken: string,
    groupId: string,
    input: { memberAccountIds: string[] },
  ): Promise<InstructorAddMembersResult> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/instructor/groups/${groupId}/members`,
      responseSchema: addMembersResultSchema,
      sessionToken,
      timeoutMilliseconds: MEMBER_MUTATION_TIMEOUT_MILLISECONDS,
    });
  }

  listStudents(
    sessionToken: string,
    query: {
      cursor: string | null;
      entryYear: number | null;
      groupId: string | null;
      q: string | null;
    },
  ): Promise<StudentPage> {
    const search = studentFilterSearch(query);
    if (query.cursor !== null) search.set('cursor', query.cursor);
    search.set('limit', String(STUDENT_PAGE_SIZE));
    return this.client.request({
      method: 'GET',
      path: `/v1/internal/instructor/students?${search.toString()}`,
      responseSchema: studentPageSchema,
      sessionToken,
    });
  }

  async listEntryYears(sessionToken: string): Promise<number[]> {
    const result = await this.client.request({
      method: 'GET',
      path: '/v1/internal/instructor/students/entry-years',
      responseSchema: z.object({ entryYears: z.array(z.number().int()) }).strict(),
      sessionToken,
    });
    return result.entryYears;
  }

  async selectAllStudents(
    sessionToken: string,
    query: {
      entryYear: number | null;
      groupId: string | null;
      q: string | null;
      selectedCount: number;
    },
  ): Promise<SelectableStudent[]> {
    const search = studentFilterSearch(query);
    search.set('selectedCount', String(query.selectedCount));
    const result = await this.client.request({
      method: 'GET',
      path: `/v1/internal/instructor/students/select-all?${search.toString()}`,
      responseSchema: z.object({ students: z.array(selectableStudentSchema) }).strict(),
      sessionToken,
    });
    return result.students;
  }

  /* Student IDs travel only in this request body, never in a URL. */
  async resolveStudentIds(
    sessionToken: string,
    input: { groupId: string | null; studentIds: string[] },
  ): Promise<StudentIdResolution[]> {
    const result = await this.client.request({
      body:
        input.groupId === null
          ? { studentIds: input.studentIds }
          : { groupId: input.groupId, studentIds: input.studentIds },
      method: 'POST',
      path: '/v1/internal/instructor/students/resolve',
      responseSchema: z.object({ results: z.array(studentIdResolutionSchema) }).strict(),
      sessionToken,
    });
    return result.results;
  }

  withdrawMember(
    sessionToken: string,
    groupId: string,
    studentAccountId: string,
    input: { reason: string },
  ): Promise<InstructorGroupMember> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/instructor/groups/${groupId}/members/${studentAccountId}/withdraw`,
      responseSchema: memberSchema,
      sessionToken,
    });
  }

  reinstateMember(
    sessionToken: string,
    groupId: string,
    studentAccountId: string,
    input: { reason: string },
  ): Promise<InstructorGroupMember> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/instructor/groups/${groupId}/members/${studentAccountId}/reinstate`,
      responseSchema: memberSchema,
      sessionToken,
    });
  }
}

function studentFilterSearch(filter: {
  entryYear: number | null;
  groupId: string | null;
  q: string | null;
}): URLSearchParams {
  const search = new URLSearchParams();
  if (filter.q !== null) search.set('q', filter.q);
  if (filter.entryYear !== null) search.set('entryYear', String(filter.entryYear));
  if (filter.groupId !== null) search.set('groupId', filter.groupId);
  return search;
}
