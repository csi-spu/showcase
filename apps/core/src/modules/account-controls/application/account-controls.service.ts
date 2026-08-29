import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_CLOCK,
  AUTH_IDENTITY_PROTECTOR,
  AUTH_TOKEN_GENERATOR,
} from '../../auth/application/auth.ports';
import type { Clock, IdentityProtector, TokenGenerator } from '../../auth/application/auth.ports';
import { ACCOUNT_CONTROLS_REPOSITORY, ACCOUNT_PASSWORD_PROVIDER } from './account-controls.ports';
import type {
  AccountControlsRepository,
  AccountPasswordProvider,
  AcademicYearSettings,
  StudentAccountControls,
} from './account-controls.ports';
import { evaluateStudentAccess } from '../../auth/domain/student-access-policy';

export class AccountControlsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'AccountControlsError';
  }
}

@Injectable()
export class AccountControlsService {
  constructor(
    @Inject(ACCOUNT_CONTROLS_REPOSITORY)
    private readonly repository: AccountControlsRepository,
    @Inject(ACCOUNT_PASSWORD_PROVIDER)
    private readonly passwordProvider: AccountPasswordProvider,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
    @Inject(AUTH_IDENTITY_PROTECTOR) private readonly identityProtector: IdentityProtector,
    @Inject(AUTH_TOKEN_GENERATOR) private readonly tokenGenerator: TokenGenerator,
  ) {}

  getAcademicYear(): Promise<AcademicYearSettings> {
    return this.repository.getAcademicYear();
  }

  async findStudent(studentId: string): Promise<StudentAccountControlsResult> {
    const student = await this.repository.findStudent(
      this.identityProtector.hashStudentId(studentId),
    );
    if (student === null) {
      throw new AccountControlsError('STUDENT_ACCOUNT_NOT_FOUND', 404);
    }
    return this.toStudentResult(student);
  }

  async resetStudentPassword(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    studentAccountId: string;
  }): Promise<{
    student: StudentAccountControlsResult;
    temporaryPassword: string;
  }> {
    const now = this.clock.now();
    const preparation = await this.repository.beginPasswordReset({ ...input, now });
    if (preparation.outcome === 'already_completed') {
      throw new AccountControlsError('PASSWORD_RESET_ALREADY_COMPLETED', 409);
    }
    if (preparation.outcome === 'idempotency_conflict') {
      throw new AccountControlsError('ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 409);
    }
    if (preparation.outcome === 'in_progress') {
      throw new AccountControlsError('PASSWORD_RESET_IN_PROGRESS', 409);
    }
    if (preparation.outcome === 'not_found') {
      throw new AccountControlsError('STUDENT_ACCOUNT_NOT_FOUND', 404);
    }
    if (preparation.outcome === 'version_conflict') {
      throw new AccountControlsError('ACCOUNT_CONTROL_VERSION_CONFLICT', 409);
    }
    if (!('providerUserId' in preparation)) {
      throw new AccountControlsError('PASSWORD_RESET_FINALIZATION_FAILED', 503);
    }

    const temporaryPassword = this.tokenGenerator.generate(18);
    try {
      await this.passwordProvider.resetPassword(preparation.providerUserId, temporaryPassword);
    } catch {
      await this.repository.failPasswordReset({
        attemptNumber: preparation.attemptNumber,
        errorCode: 'provider_unavailable',
        idempotencyKey: input.idempotencyKey,
        now,
      });
      throw new AccountControlsError('PASSWORD_RESET_PROVIDER_UNAVAILABLE', 503);
    }

    const completion = await this.repository.completePasswordReset({
      attemptNumber: preparation.attemptNumber,
      idempotencyKey: input.idempotencyKey,
      now,
    });
    if (completion.outcome === 'not_pending') {
      throw new AccountControlsError('PASSWORD_RESET_FINALIZATION_FAILED', 503);
    }
    return {
      student: this.toStudentResult(completion.student),
      temporaryPassword,
    };
  }

  async extendStudentAccess(input: {
    accessEndsAcademicYear: number;
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    reason: string;
    studentAccountId: string;
  }): Promise<StudentAccountControlsResult> {
    const reason = input.reason.trim();
    if (reason.length === 0 || reason.length > 2_000) {
      throw new AccountControlsError('STUDENT_ACCESS_REASON_INVALID', 422);
    }
    const result = await this.repository.extendStudentAccess({
      ...input,
      now: this.clock.now(),
      reason,
    });
    if (result.outcome === 'idempotency_conflict') {
      throw new AccountControlsError('ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 409);
    }
    if (result.outcome === 'not_found') {
      throw new AccountControlsError('STUDENT_ACCOUNT_NOT_FOUND', 404);
    }
    if (result.outcome === 'shortening') {
      throw new AccountControlsError('STUDENT_ACCESS_CANNOT_BE_SHORTENED', 422);
    }
    if (result.outcome === 'version_conflict') {
      throw new AccountControlsError('ACCOUNT_CONTROL_VERSION_CONFLICT', 409);
    }
    if (!('student' in result)) {
      throw new AccountControlsError('ACCOUNT_CONTROLS_SERVICE_UNAVAILABLE', 503);
    }
    return this.toStudentResult(result.student);
  }

  async correctStudentName(input: {
    actorAccountId: string;
    expectedVersion: number;
    firstNameTh: string;
    idempotencyKey: string;
    lastNameTh: string;
    reason: string;
    studentAccountId: string;
  }): Promise<StudentAccountControlsResult> {
    const firstNameTh = input.firstNameTh.trim().normalize('NFC');
    const lastNameTh = input.lastNameTh.trim().normalize('NFC');
    const reason = input.reason.trim();
    if (
      firstNameTh.length === 0 ||
      firstNameTh.length > 100 ||
      lastNameTh.length === 0 ||
      lastNameTh.length > 100 ||
      `${firstNameTh} ${lastNameTh}`.length > 100
    ) {
      throw new AccountControlsError('STUDENT_NAME_INVALID', 422);
    }
    if (reason.length === 0 || reason.length > 2_000) {
      throw new AccountControlsError('STUDENT_NAME_REASON_INVALID', 422);
    }
    const result = await this.repository.correctStudentName({
      ...input,
      firstNameTh,
      lastNameTh,
      now: this.clock.now(),
      reason,
    });
    if (result.outcome === 'idempotency_conflict') {
      throw new AccountControlsError('ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 409);
    }
    if (result.outcome === 'not_found') {
      throw new AccountControlsError('STUDENT_ACCOUNT_NOT_FOUND', 404);
    }
    if (result.outcome === 'version_conflict') {
      throw new AccountControlsError('ACCOUNT_CONTROL_VERSION_CONFLICT', 409);
    }
    if (!('student' in result)) {
      throw new AccountControlsError('ACCOUNT_CONTROLS_SERVICE_UNAVAILABLE', 503);
    }
    return this.toStudentResult(result.student);
  }

  async updateAcademicYear(input: {
    actorAccountId: string;
    currentAcademicYear: number;
    expectedVersion: number;
    idempotencyKey: string;
  }): Promise<AcademicYearSettings> {
    const result = await this.repository.updateAcademicYear({ ...input, now: this.clock.now() });
    if (result.outcome === 'backward') {
      throw new AccountControlsError('ACADEMIC_YEAR_CANNOT_MOVE_BACKWARD', 422);
    }
    if (result.outcome === 'idempotency_conflict') {
      throw new AccountControlsError('ACCOUNT_CONTROL_IDEMPOTENCY_CONFLICT', 409);
    }
    if (result.outcome === 'version_conflict') {
      throw new AccountControlsError('ACCOUNT_CONTROL_VERSION_CONFLICT', 409);
    }
    if (!('settings' in result)) {
      throw new AccountControlsError('ACCOUNT_CONTROLS_SERVICE_UNAVAILABLE', 503);
    }
    return result.settings;
  }

  private toStudentResult(student: StudentAccountControls): StudentAccountControlsResult {
    return {
      ...student,
      ...evaluateStudentAccess({
        accessEndsAcademicYear: student.accessEndsAcademicYear,
        currentAcademicYear: student.currentAcademicYear,
        entryYear: student.entryYear,
      }),
    };
  }
}

export type StudentAccountControlsResult = StudentAccountControls &
  ReturnType<typeof evaluateStudentAccess>;
