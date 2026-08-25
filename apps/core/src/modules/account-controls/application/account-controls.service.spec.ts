import { AccountControlsService } from './account-controls.service';
import type {
  AccountControlsRepository,
  AcademicYearSettings,
  BeginPasswordResetResult,
  CompletePasswordResetResult,
  ExtendStudentAccessResult,
  StudentAccountControls,
  UpdateAcademicYearResult,
} from './account-controls.ports';

const NOW = new Date('2026-08-25T06:00:00.000Z');
const ACTOR_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const IDEMPOTENCY_KEY = '20000000-0000-4000-8000-000000000001';
const STUDENT_ACCOUNT_ID = '30000000-0000-4000-8000-000000000001';
const STUDENT = {
  accessEndsAcademicYear: 2576,
  accountId: STUDENT_ACCOUNT_ID,
  currentAcademicYear: 2577,
  entryYear: 2569,
  firstNameTh: 'สมชาย',
  lastNameTh: 'ใจดี',
  version: 2,
} satisfies StudentAccountControls;

describe('AccountControlsService Current Academic Year', () => {
  let repository: TestRepository;
  let service: AccountControlsService;

  beforeEach(() => {
    repository = new TestRepository();
    service = new AccountControlsService(
      repository,
      { resetPassword: jest.fn() },
      { now: () => NOW },
      {
        hashAdminLogin: jest.fn(),
        hashSessionToken: jest.fn(),
        hashSourceAddress: jest.fn(),
        hashStudentId: jest.fn(),
        toAdminSyntheticIdentity: jest.fn(),
        toSyntheticIdentity: jest.fn(),
      },
      { generate: jest.fn() },
    );
  });

  it('returns the server-owned setting without deriving it from the wall clock', async () => {
    repository.settings = { currentAcademicYear: 2569, updatedAt: NOW, version: 3 };

    await expect(service.getAcademicYear()).resolves.toEqual(repository.settings);
  });

  it('advances the setting with actor, optimistic version, idempotency, and UTC time', async () => {
    repository.updateAcademicYearResult = {
      outcome: 'updated',
      settings: { currentAcademicYear: 2570, updatedAt: NOW, version: 4 },
    };

    await expect(
      service.updateAcademicYear({
        actorAccountId: ACTOR_ACCOUNT_ID,
        currentAcademicYear: 2570,
        expectedVersion: 3,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual({ currentAcademicYear: 2570, updatedAt: NOW, version: 4 });
    expect(repository.updateAcademicYearInput).toEqual({
      actorAccountId: ACTOR_ACCOUNT_ID,
      currentAcademicYear: 2570,
      expectedVersion: 3,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
    });
  });

  it.each([
    ['backward', 'ACADEMIC_YEAR_CANNOT_MOVE_BACKWARD', 422],
    ['idempotency_conflict', 'ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 409],
    ['version_conflict', 'ACCOUNT_CONTROL_VERSION_CONFLICT', 409],
  ] as const)('maps %s repository outcome to a stable error', async (outcome, code, status) => {
    repository.updateAcademicYearResult = { outcome };

    await expect(
      service.updateAcademicYear({
        actorAccountId: ACTOR_ACCOUNT_ID,
        currentAcademicYear: 2570,
        expectedVersion: 3,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toEqual(expect.objectContaining({ code, status }));
  });
});

describe('AccountControlsService Student Access Period', () => {
  let repository: TestRepository;
  let service: AccountControlsService;
  const hashStudentId = jest.fn(() => 'safe-student-id-hash');

  beforeEach(() => {
    repository = new TestRepository();
    hashStudentId.mockClear();
    service = new AccountControlsService(
      repository,
      { resetPassword: jest.fn() },
      { now: () => NOW },
      {
        hashAdminLogin: jest.fn(),
        hashSessionToken: jest.fn(),
        hashSourceAddress: jest.fn(),
        hashStudentId,
        toAdminSyntheticIdentity: jest.fn(),
        toSyntheticIdentity: jest.fn(),
      },
      { generate: jest.fn() },
    );
  });

  it('finds one Student by a protected Student ID and reports current Alumnus state', async () => {
    repository.student = STUDENT;

    await expect(service.findStudent('69000001')).resolves.toEqual({
      ...STUDENT,
      canUseStudentCapabilities: false,
      state: 'alumnus',
    });
    expect(hashStudentId).toHaveBeenCalledWith('69000001');
    expect(repository.studentIdHash).toBe('safe-student-id-hash');
  });

  it('returns a stable not-found response without echoing Student ID', async () => {
    await expect(service.findStudent('69000001')).rejects.toEqual(
      expect.objectContaining({ code: 'STUDENT_ACCOUNT_NOT_FOUND', status: 404 }),
    );
  });

  it('extends access with normalized reason, actor, optimistic version, and idempotency', async () => {
    repository.extendStudentAccessResult = {
      outcome: 'updated',
      student: { ...STUDENT, accessEndsAcademicYear: 2578, version: 3 },
    };

    await expect(
      service.extendStudentAccess({
        accessEndsAcademicYear: 2578,
        actorAccountId: ACTOR_ACCOUNT_ID,
        expectedVersion: 2,
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: '  อนุมัติตามหลักฐานจากทะเบียน  ',
        studentAccountId: STUDENT_ACCOUNT_ID,
      }),
    ).resolves.toMatchObject({
      accessEndsAcademicYear: 2578,
      canUseStudentCapabilities: true,
      state: 'student',
      version: 3,
    });
    expect(repository.extendStudentAccessInput).toEqual({
      accessEndsAcademicYear: 2578,
      actorAccountId: ACTOR_ACCOUNT_ID,
      expectedVersion: 2,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      reason: 'อนุมัติตามหลักฐานจากทะเบียน',
      studentAccountId: STUDENT_ACCOUNT_ID,
    });
  });

  it.each([
    ['idempotency_conflict', 'ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 409],
    ['not_found', 'STUDENT_ACCOUNT_NOT_FOUND', 404],
    ['shortening', 'STUDENT_ACCESS_CANNOT_BE_SHORTENED', 422],
    ['version_conflict', 'ACCOUNT_CONTROL_VERSION_CONFLICT', 409],
  ] as const)('maps %s extension outcome to a stable error', async (outcome, code, status) => {
    repository.extendStudentAccessResult = { outcome };

    await expect(
      service.extendStudentAccess({
        accessEndsAcademicYear: 2578,
        actorAccountId: ACTOR_ACCOUNT_ID,
        expectedVersion: 2,
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: 'เหตุผลที่ตรวจสอบได้',
        studentAccountId: STUDENT_ACCOUNT_ID,
      }),
    ).rejects.toEqual(expect.objectContaining({ code, status }));
  });

  it.each(['', '   ', 'x'.repeat(2001)])('rejects an invalid audited reason', async (reason) => {
    await expect(
      service.extendStudentAccess({
        accessEndsAcademicYear: 2578,
        actorAccountId: ACTOR_ACCOUNT_ID,
        expectedVersion: 2,
        idempotencyKey: IDEMPOTENCY_KEY,
        reason,
        studentAccountId: STUDENT_ACCOUNT_ID,
      }),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'STUDENT_ACCESS_REASON_INVALID', status: 422 }),
    );
    expect(repository.extendStudentAccessInput).toBeNull();
  });
});

describe('AccountControlsService Student password reset', () => {
  let repository: TestRepository;
  let resetPassword: jest.MockedFunction<
    (providerUserId: string, password: string) => Promise<void>
  >;
  const generate = jest.fn(() => 'random-temporary-password');
  let service: AccountControlsService;

  beforeEach(() => {
    repository = new TestRepository();
    resetPassword = jest.fn().mockResolvedValue(undefined);
    generate.mockClear();
    service = new AccountControlsService(
      repository,
      { resetPassword },
      { now: () => NOW },
      {
        hashAdminLogin: jest.fn(),
        hashSessionToken: jest.fn(),
        hashSourceAddress: jest.fn(),
        hashStudentId: jest.fn(),
        toAdminSyntheticIdentity: jest.fn(),
        toSyntheticIdentity: jest.fn(),
      },
      { generate },
    );
  });

  it('returns one random temporary password only after provider and audit completion', async () => {
    repository.beginPasswordResetResult = {
      attemptNumber: 1,
      outcome: 'ready',
      providerUserId: '40000000-0000-4000-8000-000000000001',
    };
    repository.completePasswordResetResult = {
      outcome: 'completed',
      student: { ...STUDENT, version: 3 },
    };

    await expect(
      service.resetStudentPassword({
        actorAccountId: ACTOR_ACCOUNT_ID,
        expectedVersion: 2,
        idempotencyKey: IDEMPOTENCY_KEY,
        studentAccountId: STUDENT_ACCOUNT_ID,
      }),
    ).resolves.toMatchObject({
      student: { accountId: STUDENT_ACCOUNT_ID, version: 3 },
      temporaryPassword: 'random-temporary-password',
    });
    expect(generate).toHaveBeenCalledWith(18);
    expect(resetPassword).toHaveBeenCalledWith(
      '40000000-0000-4000-8000-000000000001',
      'random-temporary-password',
    );
    expect(repository.beginPasswordResetInput).toEqual({
      actorAccountId: ACTOR_ACCOUNT_ID,
      expectedVersion: 2,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      studentAccountId: STUDENT_ACCOUNT_ID,
    });
    expect(repository.completePasswordResetInput).toEqual({
      attemptNumber: 1,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
    });
  });

  it('records provider failure, returns no password, and leaves the operation retryable', async () => {
    repository.beginPasswordResetResult = {
      attemptNumber: 1,
      outcome: 'ready',
      providerUserId: '40000000-0000-4000-8000-000000000001',
    };
    resetPassword.mockRejectedValue(new Error('provider detail must stay private'));

    await expect(
      service.resetStudentPassword({
        actorAccountId: ACTOR_ACCOUNT_ID,
        expectedVersion: 2,
        idempotencyKey: IDEMPOTENCY_KEY,
        studentAccountId: STUDENT_ACCOUNT_ID,
      }),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'PASSWORD_RESET_PROVIDER_UNAVAILABLE', status: 503 }),
    );
    expect(repository.failPasswordResetInput).toEqual({
      attemptNumber: 1,
      errorCode: 'provider_unavailable',
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
    });
    expect(repository.completePasswordResetInput).toBeNull();
  });

  it.each([
    ['already_completed', 'PASSWORD_RESET_ALREADY_COMPLETED', 409],
    ['idempotency_conflict', 'ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 409],
    ['in_progress', 'PASSWORD_RESET_IN_PROGRESS', 409],
    ['not_found', 'STUDENT_ACCOUNT_NOT_FOUND', 404],
    ['version_conflict', 'ACCOUNT_CONTROL_VERSION_CONFLICT', 409],
  ] as const)(
    'maps %s reset preparation outcome to a stable error',
    async (outcome, code, status) => {
      repository.beginPasswordResetResult = { outcome };

      await expect(
        service.resetStudentPassword({
          actorAccountId: ACTOR_ACCOUNT_ID,
          expectedVersion: 2,
          idempotencyKey: IDEMPOTENCY_KEY,
          studentAccountId: STUDENT_ACCOUNT_ID,
        }),
      ).rejects.toEqual(expect.objectContaining({ code, status }));
      expect(generate).not.toHaveBeenCalled();
      expect(resetPassword).not.toHaveBeenCalled();
    },
  );
});

class TestRepository implements AccountControlsRepository {
  settings: AcademicYearSettings = {
    currentAcademicYear: null,
    updatedAt: new Date(0),
    version: 0,
  };
  updateAcademicYearInput: Parameters<AccountControlsRepository['updateAcademicYear']>[0] | null =
    null;
  updateAcademicYearResult: UpdateAcademicYearResult = {
    outcome: 'updated',
    settings: { currentAcademicYear: 2569, updatedAt: NOW, version: 1 },
  };
  student: StudentAccountControls | null = null;
  studentIdHash: string | null = null;
  extendStudentAccessInput: Parameters<AccountControlsRepository['extendStudentAccess']>[0] | null =
    null;
  extendStudentAccessResult: ExtendStudentAccessResult = {
    outcome: 'updated',
    student: STUDENT,
  };
  beginPasswordResetInput: Parameters<AccountControlsRepository['beginPasswordReset']>[0] | null =
    null;
  beginPasswordResetResult: BeginPasswordResetResult = { outcome: 'not_found' };
  completePasswordResetInput:
    Parameters<AccountControlsRepository['completePasswordReset']>[0] | null = null;
  completePasswordResetResult: CompletePasswordResetResult = { outcome: 'not_pending' };
  failPasswordResetInput: Parameters<AccountControlsRepository['failPasswordReset']>[0] | null =
    null;

  getAcademicYear(): Promise<AcademicYearSettings> {
    return Promise.resolve(this.settings);
  }

  updateAcademicYear(
    input: Parameters<AccountControlsRepository['updateAcademicYear']>[0],
  ): Promise<UpdateAcademicYearResult> {
    this.updateAcademicYearInput = input;
    return Promise.resolve(this.updateAcademicYearResult);
  }

  findStudent(studentIdHash: string): Promise<StudentAccountControls | null> {
    this.studentIdHash = studentIdHash;
    return Promise.resolve(this.student);
  }

  extendStudentAccess(
    input: Parameters<AccountControlsRepository['extendStudentAccess']>[0],
  ): Promise<ExtendStudentAccessResult> {
    this.extendStudentAccessInput = input;
    return Promise.resolve(this.extendStudentAccessResult);
  }

  beginPasswordReset(
    input: Parameters<AccountControlsRepository['beginPasswordReset']>[0],
  ): Promise<BeginPasswordResetResult> {
    this.beginPasswordResetInput = input;
    return Promise.resolve(this.beginPasswordResetResult);
  }

  completePasswordReset(
    input: Parameters<AccountControlsRepository['completePasswordReset']>[0],
  ): Promise<CompletePasswordResetResult> {
    this.completePasswordResetInput = input;
    return Promise.resolve(this.completePasswordResetResult);
  }

  failPasswordReset(
    input: Parameters<AccountControlsRepository['failPasswordReset']>[0],
  ): Promise<void> {
    this.failPasswordResetInput = input;
    return Promise.resolve();
  }
}
