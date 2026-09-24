import 'server-only';
import { CoreClient } from '@showcase/core-client';
import { z } from 'zod';

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
    membershipSource: z.enum(['entry_year', 'individual', 'student_id_list']),
    status: z.enum(['current', 'withdrawn']),
    studentAccountId: z.uuid(),
    withdrawalReason: z.string().nullable(),
    withdrawnAt: z.iso.datetime().nullable(),
  })
  .strict();

const addMembersResultSchema = z
  .object({
    accepted: z.array(memberSchema),
    alreadyWithdrawnStudentIds: z.array(z.string()),
    unknownStudentIds: z.array(z.string()),
  })
  .strict();

const addMembersByEntryYearResultSchema = z
  .object({
    accepted: z.array(memberSchema),
    alreadyWithdrawnCount: z.number().int(),
  })
  .strict();

const groupDetailSchema = z.object({ group: groupSchema, members: z.array(memberSchema) }).strict();
const roundWithGroupSchema = z.object({ group: groupSchema, round: roundSchema }).strict();

export type InstructorCollectionRound = z.infer<typeof roundSchema>;
export type InstructorCollectionGroup = z.infer<typeof groupSchema>;
export type InstructorGroupMember = z.infer<typeof memberSchema>;
export type InstructorAddMembersResult = z.infer<typeof addMembersResultSchema>;
export type InstructorAddMembersByEntryYearResult = z.infer<
  typeof addMembersByEntryYearResultSchema
>;
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

  createRoundWithGroup(
    sessionToken: string,
    input: { groupName: string; roundName: string },
  ): Promise<{ group: InstructorCollectionGroup; round: InstructorCollectionRound }> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: '/v1/internal/instructor/rounds/with-group',
      responseSchema: roundWithGroupSchema,
      sessionToken,
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

  createGroup(
    sessionToken: string,
    roundId: string,
    input: { name: string },
  ): Promise<InstructorCollectionGroup> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/instructor/rounds/${roundId}/groups`,
      responseSchema: groupSchema,
      sessionToken,
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

  addMembersByStudentIds(
    sessionToken: string,
    groupId: string,
    input: { studentIds: string[] },
  ): Promise<InstructorAddMembersResult> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/instructor/groups/${groupId}/members/by-student-ids`,
      responseSchema: addMembersResultSchema,
      sessionToken,
    });
  }

  addMembersByEntryYear(
    sessionToken: string,
    groupId: string,
    input: { entryYear: number },
  ): Promise<InstructorAddMembersByEntryYearResult> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `/v1/internal/instructor/groups/${groupId}/members/by-entry-year`,
      responseSchema: addMembersByEntryYearResultSchema,
      sessionToken,
    });
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
