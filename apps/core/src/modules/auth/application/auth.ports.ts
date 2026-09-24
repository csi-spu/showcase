export const AUTH_CLOCK = Symbol('AUTH_CLOCK');
export const AUTH_IDENTITY_PROTECTOR = Symbol('AUTH_IDENTITY_PROTECTOR');
export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');
export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');
export const AUTH_TOKEN_GENERATOR = Symbol('AUTH_TOKEN_GENERATOR');

export type AccountStatus = 'active' | 'suspended';
export type CredentialState = 'initial' | 'reset_required' | 'set';
export type SessionAudience = 'admin' | 'instructor' | 'student' | 'student_collection';

export interface Clock {
  now(): Date;
}

export interface IdentityProtector {
  hashAdminLogin(value: string): string;
  hashSessionToken(value: string): string;
  hashSourceAddress(value: string): string;
  hashStudentId(value: string): string;
  toAdminSyntheticIdentity(adminLogin: string): string;
  toSyntheticIdentity(studentId: string): string;
}

export interface TokenGenerator {
  generate(byteLength: number): string;
}

export interface ProviderSession {
  accessToken: string;
  expiresAt: Date;
  providerUserId: string;
  refreshToken: string;
}

export type ProviderErrorCode =
  'INVALID_CREDENTIALS' | 'PROVIDER_REJECTED' | 'PROVIDER_UNAVAILABLE';

export class AuthProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'AuthProviderError';
  }
}

export interface AuthProvider {
  authenticate(identity: string, password: string): Promise<ProviderSession>;
  changePassword(accessToken: string, newPassword: string): Promise<void>;
  refresh(refreshToken: string): Promise<ProviderSession>;
  revoke(accessToken: string, scope: 'global' | 'local'): Promise<void>;
}

export interface LoginAccount {
  accountId: string;
  accountStatus: AccountStatus;
  credentialState: CredentialState;
  currentAcademicYear: number | null;
  entryYear: number;
  hasStudentRole: boolean;
  providerUserId: string;
  studentAccessEndsAcademicYear: number;
  studentIdHash: string;
  syntheticIdentity: string;
}

export interface AdminLoginAccount {
  accountId: string;
  accountStatus: AccountStatus;
  adminLoginHash: string;
  credentialState: CredentialState;
  hasAdminRole: boolean;
  hasInstructorRole: boolean;
  providerUserId: string;
  syntheticIdentity: string;
}

export interface AuthenticationSessionRecord extends LoginAccount {
  absoluteExpiresAt: Date;
  lastActivityAt: Date;
  providerAccessToken: string;
  providerRefreshToken: string;
  providerTokenExpiresAt: Date;
  revokedAt: Date | null;
  sessionIdHash: string;
}

export interface AdminAuthenticationSessionRecord extends AdminLoginAccount {
  absoluteExpiresAt: Date;
  lastActivityAt: Date;
  providerAccessToken: string;
  providerRefreshToken: string;
  providerTokenExpiresAt: Date;
  revokedAt: Date | null;
  sessionIdHash: string;
}

export interface InstructorAuthenticationSessionRecord extends AdminAuthenticationSessionRecord {
  displayName: string | null;
}

export interface NewAuthenticationSession {
  absoluteExpiresAt: Date;
  accountId: string;
  audience: SessionAudience;
  eventType:
    | 'admin_login'
    | 'admin_password_changed'
    | 'instructor_login'
    | 'instructor_password_changed'
    | 'student_collection_login'
    | 'student_collection_password_changed'
    | 'student_login'
    | 'student_password_changed';
  now: Date;
  providerSession: ProviderSession;
  sessionIdHash: string;
  sourceKeyHash?: string;
}

export interface RateLimitResult {
  isAllowed: boolean;
  retryAfterSeconds: number;
}

export interface AuthRepository {
  consumeLoginAttempt(input: {
    accountKeyHash: string;
    limit: number;
    now: Date;
    sourceKeyHash: string;
    windowSeconds: number;
  }): Promise<RateLimitResult>;
  createSession(input: NewAuthenticationSession): Promise<void>;
  findAdminLoginAccount(adminLoginHash: string): Promise<AdminLoginAccount | null>;
  findAdminSession(sessionIdHash: string): Promise<AdminAuthenticationSessionRecord | null>;
  findInstructorSession(
    sessionIdHash: string,
  ): Promise<InstructorAuthenticationSessionRecord | null>;
  findLoginAccount(studentIdHash: string): Promise<LoginAccount | null>;
  findSession(sessionIdHash: string): Promise<AuthenticationSessionRecord | null>;
  findStudentCollectionSession(sessionIdHash: string): Promise<AuthenticationSessionRecord | null>;
  replaceAllAccountSessions(input: NewAuthenticationSession): Promise<void>;
  revokeSession(
    sessionIdHash: string,
    now: Date,
    reason: 'authorization_changed' | 'expired' | 'logout' | 'provider_invalid',
  ): Promise<void>;
  touchSession(sessionIdHash: string, now: Date): Promise<void>;
  updateProviderSession(
    sessionIdHash: string,
    providerSession: ProviderSession,
    now: Date,
  ): Promise<void>;
}
