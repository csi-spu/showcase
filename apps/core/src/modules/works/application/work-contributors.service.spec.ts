import type { IdentityProtector } from '../../auth/application/auth.ports';
import type { WorkContributorsRepository } from './work-contributors.ports';
import { WorkContributorsService } from './work-contributors.service';

const NOW = new Date('2026-08-28T08:00:00.000Z');
const ACCOUNT_ID = '76000000-0000-4000-8000-000000000001';
const WORK_ID = '76000000-0000-4000-8000-000000000002';
const KEY = '76000000-0000-4000-8000-000000000003';
const REFERENCE = '76000000-0000-4000-8000-000000000004';

describe('WorkContributorsService', () => {
  const repository: jest.Mocked<WorkContributorsRepository> = {
    addAccount: jest.fn(),
    addExternal: jest.fn(),
    lookupCandidate: jest.fn(),
    remove: jest.fn(),
  };
  const identity: IdentityProtector = {
    hashAdminLogin: jest.fn(),
    hashSessionToken: jest.fn(),
    hashSourceAddress: (value) => `source:${value}`,
    hashStudentId: (value) => `student:${value}`,
    toAdminSyntheticIdentity: jest.fn(),
    toSyntheticIdentity: jest.fn(),
  };
  const service = new WorkContributorsService(repository, { now: () => NOW }, identity);

  beforeEach(() => jest.clearAllMocks());

  it('looks up one minimal candidate without returning or persisting Student ID', async () => {
    repository.lookupCandidate.mockResolvedValue({
      candidate: { candidateReference: REFERENCE, firstName: 'สมชาย', lastName: 'ใจดี' },
      outcome: 'match',
    });
    await expect(
      service.lookup({
        actorAccountId: ACCOUNT_ID,
        sourceAddress: 'safe-source',
        studentId: '69000001',
        workPublicId: WORK_ID,
      }),
    ).resolves.toEqual({ candidateReference: REFERENCE, firstName: 'สมชาย', lastName: 'ใจดี' });
    expect(repository.lookupCandidate.mock.calls[0]?.[0]).toEqual({
      actorAccountId: ACCOUNT_ID,
      now: NOW,
      sourceKeyHash: 'source:safe-source',
      studentIdHash: 'student:69000001',
      workPublicId: WORK_ID,
    });
    expect(
      JSON.stringify(
        await service.lookup({
          actorAccountId: ACCOUNT_ID,
          sourceAddress: 'safe-source',
          studentId: '69000001',
          workPublicId: WORK_ID,
        }),
      ),
    ).not.toContain('69000001');
  });

  it('rejects non-exact lookup before hashing or repository access', async () => {
    await expect(
      service.lookup({
        actorAccountId: ACCOUNT_ID,
        sourceAddress: 'safe-source',
        studentId: '6900000',
        workPublicId: WORK_ID,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CONTRIBUTOR', status: 422 });
    expect(repository.lookupCandidate.mock.calls).toHaveLength(0);
  });

  it('keeps direct Contributor lookup unavailable until the controlled cutover', async () => {
    repository.lookupCandidate.mockResolvedValue({ outcome: 'cutover_unavailable' });
    await expect(
      service.lookup({
        actorAccountId: ACCOUNT_ID,
        sourceAddress: `student-account:${ACCOUNT_ID}`,
        studentId: '69000001',
        workPublicId: WORK_ID,
      }),
    ).rejects.toMatchObject({ code: 'CONTRIBUTOR_CUTOVER_UNAVAILABLE', status: 503 });
  });

  it('adds account and external Contributors immediately with normalized roles/names', async () => {
    repository.addAccount.mockResolvedValue({ contributors: [], outcome: 'added', version: 2 });
    repository.addExternal.mockResolvedValue({ contributors: [], outcome: 'added', version: 3 });
    await service.addAccount({
      actorAccountId: ACCOUNT_ID,
      candidateReference: REFERENCE,
      contributionRole: ' ออกแบบ ',
      expectedVersion: 1,
      idempotencyKey: KEY,
      workPublicId: WORK_ID,
    });
    expect(repository.addAccount.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        contributionRole: 'ออกแบบ',
        now: NOW,
      }),
    );
    await service.addExternal({
      actorAccountId: ACCOUNT_ID,
      contributionRole: ' พัฒนา ',
      expectedVersion: 2,
      firstName: ' มานี ',
      idempotencyKey: KEY,
      lastName: ' ดีใจ ',
      workPublicId: WORK_ID,
    });
    expect(repository.addExternal.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        attributionName: 'มานี ดีใจ',
        contributionRole: 'พัฒนา',
      }),
    );
  });

  it.each([
    ['candidate_invalid', 'CONTRIBUTOR_CANDIDATE_INVALID', 422],
    ['contributor_duplicate', 'CONTRIBUTOR_DUPLICATE', 422],
    ['contributor_limit_reached', 'CONTRIBUTOR_LIMIT_REACHED', 422],
    ['cutover_unavailable', 'CONTRIBUTOR_CUTOVER_UNAVAILABLE', 503],
    ['idempotency_conflict', 'CONTRIBUTOR_IDEMPOTENCY_CONFLICT', 409],
    ['version_conflict', 'WORK_VERSION_CONFLICT', 409],
  ] as const)('maps %s without changing the list', async (outcome, code, status) => {
    repository.addAccount.mockResolvedValue({ outcome });
    await expect(
      service.addAccount({
        actorAccountId: ACCOUNT_ID,
        candidateReference: REFERENCE,
        contributionRole: 'ออกแบบ',
        expectedVersion: 1,
        idempotencyKey: KEY,
        workPublicId: WORK_ID,
      }),
    ).rejects.toMatchObject({ code, status });
  });
});
