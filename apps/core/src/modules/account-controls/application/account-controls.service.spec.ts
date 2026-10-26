import {
  AdminProvisioningError,
  AdminProvisioningService,
} from '../../auth/application/admin-provisioning.service';
import { AccountControlsService } from './account-controls.service';
import type {
  AccountControlsRepository,
  AcademicYearSettings,
  AdminAccountControls,
  BeginInstructorPasswordResetResult,
  BeginPasswordResetResult,
  CompleteInstructorPasswordResetResult,
  CompletePasswordResetResult,
  CorrectStudentNameResult,
  ExtendStudentAccessResult,
  GrantInstructorRoleResult,
  InstructorAccountControls,
  ListPage,
  RevokeInstructorRoleResult,
  SetAdminStatusResult,
  SetStudentStatusResult,
  StudentAccountControls,
  UpdateAcademicYearResult,
} from './account-controls.ports';

class FakeAdminProvisioningService extends AdminProvisioningService {
  provisionInput: Parameters<AdminProvisioningService['provision']>[0] | null = null;
  provisionResult: () => Promise<{ adminLogin: string; temporaryPassword: string }> = () =>
    Promise.reject(new Error('provisionResult not configured for this test'));

  constructor() {
    super(
      { adminLoginExists: jest.fn(), createAdminAccount: jest.fn() },
      { createIdentity: jest.fn(), deleteIdentity: jest.fn() },
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
  }

  override provision(
    input: Parameters<AdminProvisioningService['provision']>[0],
  ): Promise<{ adminLogin: string; temporaryPassword: string }> {
    this.provisionInput = input;
    return this.provisionResult();
  }
}

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
  status: 'active',
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
      new FakeAdminProvisioningService(),
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
      new FakeAdminProvisioningService(),
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

  it('corrects the immutable Roster Name only through an audited Admin mutation', async () => {
    repository.correctStudentNameResult = {
      outcome: 'updated',
      student: { ...STUDENT, firstNameTh: 'สมหญิง', lastNameTh: 'มั่นใจ', version: 3 },
    };

    await expect(
      service.correctStudentName({
        actorAccountId: ACTOR_ACCOUNT_ID,
        expectedVersion: 2,
        firstNameTh: '  สมหญิง  ',
        idempotencyKey: IDEMPOTENCY_KEY,
        lastNameTh: '  มั่นใจ  ',
        reason: '  แก้ไขตามหลักฐานจากทะเบียน  ',
        studentAccountId: STUDENT_ACCOUNT_ID,
      }),
    ).resolves.toMatchObject({
      firstNameTh: 'สมหญิง',
      lastNameTh: 'มั่นใจ',
      version: 3,
    });
    expect(repository.correctStudentNameInput).toEqual({
      actorAccountId: ACTOR_ACCOUNT_ID,
      expectedVersion: 2,
      firstNameTh: 'สมหญิง',
      idempotencyKey: IDEMPOTENCY_KEY,
      lastNameTh: 'มั่นใจ',
      now: NOW,
      reason: 'แก้ไขตามหลักฐานจากทะเบียน',
      studentAccountId: STUDENT_ACCOUNT_ID,
    });
  });

  it.each([
    ['', 'ใจดี', 'เหตุผลที่ตรวจสอบได้'],
    ['สมชาย', '', 'เหตุผลที่ตรวจสอบได้'],
    ['ก'.repeat(100), 'ข', 'เหตุผลที่ตรวจสอบได้'],
    ['สมชาย', 'ใจดี', ''],
  ])('rejects invalid Roster Name correction input', async (firstNameTh, lastNameTh, reason) => {
    await expect(
      service.correctStudentName({
        actorAccountId: ACTOR_ACCOUNT_ID,
        expectedVersion: 2,
        firstNameTh,
        idempotencyKey: IDEMPOTENCY_KEY,
        lastNameTh,
        reason,
        studentAccountId: STUDENT_ACCOUNT_ID,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repository.correctStudentNameInput).toBeNull();
  });

  it('suspends a Student with normalized reason, actor, optimistic version, and idempotency', async () => {
    repository.setStudentStatusResult = {
      outcome: 'updated',
      student: { ...STUDENT, status: 'suspended', version: 3 },
    };

    // Suspension is independent of the derived access state: a suspended
    // Account still reports the Alumnus/Student period it falls in.
    await expect(
      service.setStudentStatus({
        actorAccountId: ACTOR_ACCOUNT_ID,
        expectedVersion: 2,
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: '  เหตุผลที่ตรวจสอบได้  ',
        status: 'suspended',
        studentAccountId: STUDENT_ACCOUNT_ID,
      }),
    ).resolves.toEqual({
      ...STUDENT,
      canUseStudentCapabilities: false,
      state: 'alumnus',
      status: 'suspended',
      version: 3,
    });
    expect(repository.setStudentStatusInput).toEqual({
      actorAccountId: ACTOR_ACCOUNT_ID,
      expectedVersion: 2,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      reason: 'เหตุผลที่ตรวจสอบได้',
      status: 'suspended',
      studentAccountId: STUDENT_ACCOUNT_ID,
    });
  });

  it.each(['', '   ', 'x'.repeat(2001)])(
    'rejects an invalid Student status reason before calling the repository',
    async (reason) => {
      await expect(
        service.setStudentStatus({
          actorAccountId: ACTOR_ACCOUNT_ID,
          expectedVersion: 2,
          idempotencyKey: IDEMPOTENCY_KEY,
          reason,
          status: 'suspended',
          studentAccountId: STUDENT_ACCOUNT_ID,
        }),
      ).rejects.toEqual(
        expect.objectContaining({ code: 'STUDENT_STATUS_REASON_INVALID', status: 422 }),
      );
      expect(repository.setStudentStatusInput).toBeNull();
    },
  );

  it.each([
    ['idempotency_conflict', 'ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 409],
    ['not_found', 'STUDENT_ACCOUNT_NOT_FOUND', 404],
    ['version_conflict', 'ACCOUNT_CONTROL_VERSION_CONFLICT', 409],
  ] as const)('maps %s Student status outcome to a stable error', async (outcome, code, status) => {
    repository.setStudentStatusResult = { outcome };

    await expect(
      service.setStudentStatus({
        actorAccountId: ACTOR_ACCOUNT_ID,
        expectedVersion: 2,
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: 'เหตุผลที่ตรวจสอบได้',
        status: 'suspended',
        studentAccountId: STUDENT_ACCOUNT_ID,
      }),
    ).rejects.toEqual(expect.objectContaining({ code, status }));
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
      new FakeAdminProvisioningService(),
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

describe('AccountControlsService Admin Account listing and lifecycle', () => {
  let repository: TestRepository;
  let adminProvisioning: FakeAdminProvisioningService;
  let service: AccountControlsService;
  const ADMIN_ACCOUNT_ID = '30000000-0000-4000-8000-000000000009';
  const ADMIN = {
    accountId: ADMIN_ACCOUNT_ID,
    createdAt: NOW,
    firstNameTh: 'สมชาย',
    hasInstructorRole: false,
    lastNameTh: 'ใจดี',
    status: 'active',
    version: 1,
  } satisfies AdminAccountControls;

  beforeEach(() => {
    repository = new TestRepository();
    adminProvisioning = new FakeAdminProvisioningService();
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
      adminProvisioning,
    );
  });

  it('lists Students with a default limit, clamped custom limit, and trimmed search', async () => {
    repository.listStudentsResult = { items: [STUDENT], nextCursor: 'next-cursor' };

    await expect(
      service.listStudents({ cursor: null, limit: null, search: '  สม  ' }),
    ).resolves.toMatchObject({ nextCursor: 'next-cursor' });
    expect(repository.listStudentsInput).toEqual({ cursor: null, limit: 20, search: 'สม' });

    await service.listStudents({ cursor: 'abc', limit: 500, search: '   ' });
    expect(repository.listStudentsInput).toEqual({ cursor: 'abc', limit: 100, search: null });
  });

  it('lists Admins without deriving Student-only fields', async () => {
    repository.listAdminsResult = { items: [ADMIN], nextCursor: null };

    await expect(service.listAdmins({ cursor: null, limit: 5, search: null })).resolves.toEqual({
      items: [ADMIN],
      nextCursor: null,
    });
    expect(repository.listAdminsInput).toEqual({ cursor: null, limit: 5, search: null });
  });

  it('creates an Admin by delegating to provisioning and returns the one-time password', async () => {
    adminProvisioning.provisionResult = () =>
      Promise.resolve({ adminLogin: 'ops', temporaryPassword: 'one-time-password' });

    await expect(
      service.createAdmin({ adminLogin: 'ops', firstNameTh: 'สมชาย', lastNameTh: 'ใจดี' }),
    ).resolves.toEqual({
      admin: { adminLogin: 'ops' },
      temporaryPassword: 'one-time-password',
    });
    expect(adminProvisioning.provisionInput).toEqual({
      adminLogin: 'ops',
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
    });
  });

  it.each([
    ['ADMIN_LOGIN_TAKEN', 409],
    ['INVALID_ADMIN_LOGIN', 422],
    ['INVALID_ADMIN_NAME', 422],
    ['ADMIN_PROVIDER_UNAVAILABLE', 503],
    ['ADMIN_PROVISIONING_FAILED', 503],
  ] as const)('maps provisioning failure %s to a stable status', async (code, status) => {
    adminProvisioning.provisionResult = () => Promise.reject(new AdminProvisioningError(code));

    await expect(
      service.createAdmin({ adminLogin: 'ops', firstNameTh: 'สมชาย', lastNameTh: 'ใจดี' }),
    ).rejects.toEqual(expect.objectContaining({ code, status }));
  });

  it('rejects an Admin suspending their own Account before calling the repository', async () => {
    await expect(
      service.setAdminStatus({
        actorAccountId: ADMIN_ACCOUNT_ID,
        adminAccountId: ADMIN_ACCOUNT_ID,
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: 'เหตุผลที่ตรวจสอบได้',
        status: 'suspended',
      }),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'ADMIN_SELF_STATUS_CHANGE_FORBIDDEN', status: 403 }),
    );
    expect(repository.setAdminStatusInput).toBeNull();
  });

  it.each(['', '   ', 'x'.repeat(2001)])(
    'rejects an invalid audited reason before calling the repository',
    async (reason) => {
      await expect(
        service.setAdminStatus({
          actorAccountId: ACTOR_ACCOUNT_ID,
          adminAccountId: ADMIN_ACCOUNT_ID,
          expectedVersion: 1,
          idempotencyKey: IDEMPOTENCY_KEY,
          reason,
          status: 'suspended',
        }),
      ).rejects.toEqual(
        expect.objectContaining({ code: 'ADMIN_STATUS_REASON_INVALID', status: 422 }),
      );
      expect(repository.setAdminStatusInput).toBeNull();
    },
  );

  it('suspends an Admin with actor, optimistic version, and idempotency', async () => {
    repository.setAdminStatusResult = {
      admin: { ...ADMIN, status: 'suspended', version: 2 },
      outcome: 'updated',
    };

    await expect(
      service.setAdminStatus({
        actorAccountId: ACTOR_ACCOUNT_ID,
        adminAccountId: ADMIN_ACCOUNT_ID,
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: '  เหตุผลที่ตรวจสอบได้  ',
        status: 'suspended',
      }),
    ).resolves.toEqual({ ...ADMIN, status: 'suspended', version: 2 });
    expect(repository.setAdminStatusInput).toEqual({
      actorAccountId: ACTOR_ACCOUNT_ID,
      adminAccountId: ADMIN_ACCOUNT_ID,
      expectedVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      reason: 'เหตุผลที่ตรวจสอบได้',
      status: 'suspended',
    });
  });

  it.each([
    ['idempotency_conflict', 'ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 409],
    ['not_found', 'ADMIN_ACCOUNT_NOT_FOUND', 404],
    ['self_status_change', 'ADMIN_SELF_STATUS_CHANGE_FORBIDDEN', 403],
    ['last_active_admin', 'ADMIN_LAST_ACTIVE_ACCOUNT', 409],
    ['version_conflict', 'ACCOUNT_CONTROL_VERSION_CONFLICT', 409],
  ] as const)('maps %s status outcome to a stable error', async (outcome, code, status) => {
    repository.setAdminStatusResult = { outcome };

    await expect(
      service.setAdminStatus({
        actorAccountId: ACTOR_ACCOUNT_ID,
        adminAccountId: ADMIN_ACCOUNT_ID,
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: 'เหตุผลที่ตรวจสอบได้',
        status: 'suspended',
      }),
    ).rejects.toEqual(expect.objectContaining({ code, status }));
  });
});

describe('AccountControlsService Instructor management', () => {
  let repository: TestRepository;
  let adminProvisioning: FakeAdminProvisioningService;
  let service: AccountControlsService;
  const INSTRUCTOR_ACCOUNT_ID = '30000000-0000-4000-8000-000000000010';
  const INSTRUCTOR = {
    accountId: INSTRUCTOR_ACCOUNT_ID,
    createdAt: NOW,
    firstNameTh: 'วิชัย',
    hasAdminRole: false,
    lastNameTh: 'มั่นคง',
    status: 'active',
    version: 1,
  } satisfies InstructorAccountControls;

  beforeEach(() => {
    repository = new TestRepository();
    adminProvisioning = new FakeAdminProvisioningService();
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
      adminProvisioning,
    );
  });

  it('lists Instructors', async () => {
    repository.listInstructorsResult = { items: [INSTRUCTOR], nextCursor: null };

    await expect(
      service.listInstructors({ cursor: null, limit: 5, search: null }),
    ).resolves.toEqual({ items: [INSTRUCTOR], nextCursor: null });
    expect(repository.listInstructorsInput).toEqual({ cursor: null, limit: 5, search: null });
  });

  it('creates an Instructor by delegating to provisioning with the instructor role', async () => {
    adminProvisioning.provisionResult = () =>
      Promise.resolve({ adminLogin: 'teaching-staff', temporaryPassword: 'one-time-password' });

    await expect(
      service.createInstructor({
        firstNameTh: 'วิชัย',
        instructorLogin: 'teaching-staff',
        lastNameTh: 'มั่นคง',
      }),
    ).resolves.toEqual({
      instructor: { instructorLogin: 'teaching-staff' },
      temporaryPassword: 'one-time-password',
    });
    expect(adminProvisioning.provisionInput).toEqual({
      adminLogin: 'teaching-staff',
      firstNameTh: 'วิชัย',
      lastNameTh: 'มั่นคง',
      role: 'instructor',
    });
  });

  it('grants Instructor access to an existing eligible Account', async () => {
    repository.grantInstructorRoleResult = { instructor: INSTRUCTOR, outcome: 'granted' };

    await expect(
      service.grantInstructorRole({
        actorAccountId: ACTOR_ACCOUNT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        instructorAccountId: INSTRUCTOR_ACCOUNT_ID,
      }),
    ).resolves.toEqual(INSTRUCTOR);
    expect(repository.grantInstructorRoleInput).toEqual({
      actorAccountId: ACTOR_ACCOUNT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      instructorAccountId: INSTRUCTOR_ACCOUNT_ID,
      now: NOW,
    });
  });

  it('returns the current Instructor when a grant request is replayed by idempotency key', async () => {
    repository.grantInstructorRoleResult = { instructor: INSTRUCTOR, outcome: 'replayed' };

    await expect(
      service.grantInstructorRole({
        actorAccountId: ACTOR_ACCOUNT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        instructorAccountId: INSTRUCTOR_ACCOUNT_ID,
      }),
    ).resolves.toEqual(INSTRUCTOR);
  });

  it.each([
    ['idempotency_conflict', 'ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 409],
    ['not_eligible', 'INSTRUCTOR_ACCOUNT_NOT_ELIGIBLE', 422],
    ['already_granted', 'INSTRUCTOR_ROLE_ALREADY_GRANTED', 409],
  ] as const)('maps grant outcome %s to a stable error', async (outcome, code, status) => {
    repository.grantInstructorRoleResult = { outcome };

    await expect(
      service.grantInstructorRole({
        actorAccountId: ACTOR_ACCOUNT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        instructorAccountId: INSTRUCTOR_ACCOUNT_ID,
      }),
    ).rejects.toEqual(expect.objectContaining({ code, status }));
  });

  it('revokes Instructor access without touching the underlying Account', async () => {
    repository.revokeInstructorRoleResult = { instructor: INSTRUCTOR, outcome: 'revoked' };

    await expect(
      service.revokeInstructorRole({
        actorAccountId: ACTOR_ACCOUNT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        instructorAccountId: INSTRUCTOR_ACCOUNT_ID,
      }),
    ).resolves.toEqual(INSTRUCTOR);
  });

  it('returns the current Instructor when a revoke request is replayed by idempotency key', async () => {
    repository.revokeInstructorRoleResult = { instructor: INSTRUCTOR, outcome: 'replayed' };

    await expect(
      service.revokeInstructorRole({
        actorAccountId: ACTOR_ACCOUNT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        instructorAccountId: INSTRUCTOR_ACCOUNT_ID,
      }),
    ).resolves.toEqual(INSTRUCTOR);
  });

  it.each([
    ['idempotency_conflict', 'ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 409],
    ['not_granted', 'INSTRUCTOR_ROLE_NOT_GRANTED', 404],
  ] as const)('maps revoke outcome %s to a stable error', async (outcome, code, status) => {
    repository.revokeInstructorRoleResult = { outcome };

    await expect(
      service.revokeInstructorRole({
        actorAccountId: ACTOR_ACCOUNT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        instructorAccountId: INSTRUCTOR_ACCOUNT_ID,
      }),
    ).rejects.toEqual(expect.objectContaining({ code, status }));
  });
});

describe('AccountControlsService Instructor password reset', () => {
  let repository: TestRepository;
  let resetPassword: jest.MockedFunction<
    (providerUserId: string, password: string) => Promise<void>
  >;
  const generate = jest.fn(() => 'random-temporary-password');
  let service: AccountControlsService;
  const INSTRUCTOR_ACCOUNT_ID = '30000000-0000-4000-8000-000000000010';
  const PROVIDER_USER_ID = '40000000-0000-4000-8000-000000000010';
  const RESET_INPUT = {
    actorAccountId: ACTOR_ACCOUNT_ID,
    expectedVersion: 2,
    idempotencyKey: IDEMPOTENCY_KEY,
    instructorAccountId: INSTRUCTOR_ACCOUNT_ID,
  };

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
      new FakeAdminProvisioningService(),
    );
  });

  it('returns one random temporary password only after provider and audit completion', async () => {
    repository.beginInstructorPasswordResetResult = {
      attemptNumber: 1,
      outcome: 'ready',
      providerUserId: PROVIDER_USER_ID,
    };
    repository.completeInstructorPasswordResetResult = {
      instructor: {
        accountId: INSTRUCTOR_ACCOUNT_ID,
        createdAt: NOW,
        firstNameTh: 'วิชัย',
        hasAdminRole: false,
        lastNameTh: 'มั่นคง',
        status: 'active',
        version: 3,
      },
      outcome: 'completed',
    };

    await expect(service.resetInstructorPassword(RESET_INPUT)).resolves.toMatchObject({
      instructor: { accountId: INSTRUCTOR_ACCOUNT_ID, version: 3 },
      temporaryPassword: 'random-temporary-password',
    });
    expect(generate).toHaveBeenCalledWith(18);
    expect(resetPassword).toHaveBeenCalledWith(PROVIDER_USER_ID, 'random-temporary-password');
    expect(repository.beginInstructorPasswordResetInput).toEqual({ ...RESET_INPUT, now: NOW });
    expect(repository.completeInstructorPasswordResetInput).toEqual({
      attemptNumber: 1,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
    });
  });

  it('records provider failure, returns no password, and leaves the operation retryable', async () => {
    repository.beginInstructorPasswordResetResult = {
      attemptNumber: 2,
      outcome: 'ready',
      providerUserId: PROVIDER_USER_ID,
    };
    resetPassword.mockRejectedValue(new Error('provider detail must stay private'));

    await expect(service.resetInstructorPassword(RESET_INPUT)).rejects.toEqual(
      expect.objectContaining({ code: 'PASSWORD_RESET_PROVIDER_UNAVAILABLE', status: 503 }),
    );
    expect(repository.failInstructorPasswordResetInput).toEqual({
      attemptNumber: 2,
      errorCode: 'provider_unavailable',
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
    });
    expect(repository.completeInstructorPasswordResetInput).toBeNull();
  });

  it('fails closed when the operation is no longer pending at completion', async () => {
    repository.beginInstructorPasswordResetResult = {
      attemptNumber: 1,
      outcome: 'ready',
      providerUserId: PROVIDER_USER_ID,
    };

    await expect(service.resetInstructorPassword(RESET_INPUT)).rejects.toEqual(
      expect.objectContaining({ code: 'PASSWORD_RESET_FINALIZATION_FAILED', status: 503 }),
    );
  });

  it.each([
    ['admin_account', 'INSTRUCTOR_PASSWORD_RESET_ADMIN_ACCOUNT', 403],
    ['already_completed', 'PASSWORD_RESET_ALREADY_COMPLETED', 409],
    ['idempotency_conflict', 'ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 409],
    ['in_progress', 'PASSWORD_RESET_IN_PROGRESS', 409],
    ['not_found', 'INSTRUCTOR_ACCOUNT_NOT_FOUND', 404],
    ['version_conflict', 'ACCOUNT_CONTROL_VERSION_CONFLICT', 409],
  ] as const)(
    'maps %s reset preparation outcome to a stable error',
    async (outcome, code, status) => {
      repository.beginInstructorPasswordResetResult = { outcome };

      await expect(service.resetInstructorPassword(RESET_INPUT)).rejects.toEqual(
        expect.objectContaining({ code, status }),
      );
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
  beginInstructorPasswordResetInput:
    Parameters<AccountControlsRepository['beginInstructorPasswordReset']>[0] | null = null;
  beginInstructorPasswordResetResult: BeginInstructorPasswordResetResult = {
    outcome: 'not_found',
  };
  completeInstructorPasswordResetInput:
    Parameters<AccountControlsRepository['completeInstructorPasswordReset']>[0] | null = null;
  completeInstructorPasswordResetResult: CompleteInstructorPasswordResetResult = {
    outcome: 'not_pending',
  };
  failInstructorPasswordResetInput:
    Parameters<AccountControlsRepository['failInstructorPasswordReset']>[0] | null = null;
  correctStudentNameInput: Parameters<AccountControlsRepository['correctStudentName']>[0] | null =
    null;
  correctStudentNameResult: CorrectStudentNameResult = {
    outcome: 'updated',
    student: STUDENT,
  };
  listStudentsInput: Parameters<AccountControlsRepository['listStudents']>[0] | null = null;
  listStudentsResult: ListPage<StudentAccountControls> = { items: [], nextCursor: null };
  listAdminsInput: Parameters<AccountControlsRepository['listAdmins']>[0] | null = null;
  listAdminsResult: ListPage<AdminAccountControls> = { items: [], nextCursor: null };
  setAdminStatusInput: Parameters<AccountControlsRepository['setAdminStatus']>[0] | null = null;
  setAdminStatusResult: SetAdminStatusResult = { outcome: 'not_found' };
  setStudentStatusInput: Parameters<AccountControlsRepository['setStudentStatus']>[0] | null = null;
  setStudentStatusResult: SetStudentStatusResult = { outcome: 'not_found' };
  listInstructorsInput: Parameters<AccountControlsRepository['listInstructors']>[0] | null = null;
  listInstructorsResult: ListPage<InstructorAccountControls> = { items: [], nextCursor: null };
  grantInstructorRoleInput: Parameters<AccountControlsRepository['grantInstructorRole']>[0] | null =
    null;
  grantInstructorRoleResult: GrantInstructorRoleResult = { outcome: 'not_eligible' };
  revokeInstructorRoleInput:
    Parameters<AccountControlsRepository['revokeInstructorRole']>[0] | null = null;
  revokeInstructorRoleResult: RevokeInstructorRoleResult = { outcome: 'not_granted' };

  getAcademicYear(): Promise<AcademicYearSettings> {
    return Promise.resolve(this.settings);
  }

  listStudents(
    input: Parameters<AccountControlsRepository['listStudents']>[0],
  ): Promise<ListPage<StudentAccountControls>> {
    this.listStudentsInput = input;
    return Promise.resolve(this.listStudentsResult);
  }

  listAdmins(
    input: Parameters<AccountControlsRepository['listAdmins']>[0],
  ): Promise<ListPage<AdminAccountControls>> {
    this.listAdminsInput = input;
    return Promise.resolve(this.listAdminsResult);
  }

  setAdminStatus(
    input: Parameters<AccountControlsRepository['setAdminStatus']>[0],
  ): Promise<SetAdminStatusResult> {
    this.setAdminStatusInput = input;
    return Promise.resolve(this.setAdminStatusResult);
  }

  setStudentStatus(
    input: Parameters<AccountControlsRepository['setStudentStatus']>[0],
  ): Promise<SetStudentStatusResult> {
    this.setStudentStatusInput = input;
    return Promise.resolve(this.setStudentStatusResult);
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

  correctStudentName(
    input: Parameters<AccountControlsRepository['correctStudentName']>[0],
  ): Promise<CorrectStudentNameResult> {
    this.correctStudentNameInput = input;
    return Promise.resolve(this.correctStudentNameResult);
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

  beginInstructorPasswordReset(
    input: Parameters<AccountControlsRepository['beginInstructorPasswordReset']>[0],
  ): Promise<BeginInstructorPasswordResetResult> {
    this.beginInstructorPasswordResetInput = input;
    return Promise.resolve(this.beginInstructorPasswordResetResult);
  }

  completeInstructorPasswordReset(
    input: Parameters<AccountControlsRepository['completeInstructorPasswordReset']>[0],
  ): Promise<CompleteInstructorPasswordResetResult> {
    this.completeInstructorPasswordResetInput = input;
    return Promise.resolve(this.completeInstructorPasswordResetResult);
  }

  failInstructorPasswordReset(
    input: Parameters<AccountControlsRepository['failInstructorPasswordReset']>[0],
  ): Promise<void> {
    this.failInstructorPasswordResetInput = input;
    return Promise.resolve();
  }

  listInstructors(
    input: Parameters<AccountControlsRepository['listInstructors']>[0],
  ): Promise<ListPage<InstructorAccountControls>> {
    this.listInstructorsInput = input;
    return Promise.resolve(this.listInstructorsResult);
  }

  grantInstructorRole(
    input: Parameters<AccountControlsRepository['grantInstructorRole']>[0],
  ): Promise<GrantInstructorRoleResult> {
    this.grantInstructorRoleInput = input;
    return Promise.resolve(this.grantInstructorRoleResult);
  }

  revokeInstructorRole(
    input: Parameters<AccountControlsRepository['revokeInstructorRole']>[0],
  ): Promise<RevokeInstructorRoleResult> {
    this.revokeInstructorRoleInput = input;
    return Promise.resolve(this.revokeInstructorRoleResult);
  }
}
