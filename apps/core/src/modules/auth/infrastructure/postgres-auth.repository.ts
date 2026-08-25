import { Injectable } from '@nestjs/common';
import type postgres from 'postgres';
import {
  AdminAuthenticationSessionRecord,
  AdminLoginAccount,
  AuthenticationSessionRecord,
  AuthRepository,
  LoginAccount,
  NewAuthenticationSession,
  ProviderSession,
  RateLimitResult,
} from '../application/auth.ports';
import { DatabaseClient } from './database.client';

interface AccountRow {
  account_id: string;
  account_status: LoginAccount['accountStatus'];
  credential_state: LoginAccount['credentialState'];
  current_academic_year: number | null;
  entry_year: number;
  has_student_role: boolean;
  provider_user_id: string;
  student_access_ends_academic_year: number;
  student_id_hash: string;
  synthetic_identity: string;
}

interface SessionRow extends AccountRow {
  absolute_expires_at: Date;
  last_activity_at: Date;
  provider_access_token: string;
  provider_refresh_token: string;
  provider_token_expires_at: Date;
  revoked_at: Date | null;
  session_id_hash: string;
}

interface AdminAccountRow {
  account_id: string;
  account_status: AdminLoginAccount['accountStatus'];
  admin_login_hash: string;
  credential_state: AdminLoginAccount['credentialState'];
  has_admin_role: boolean;
  provider_user_id: string;
  synthetic_identity: string;
}

interface AdminSessionRow extends AdminAccountRow {
  absolute_expires_at: Date;
  last_activity_at: Date;
  provider_access_token: string;
  provider_refresh_token: string;
  provider_token_expires_at: Date;
  revoked_at: Date | null;
  session_id_hash: string;
}

interface RateLimitRow {
  attempts: number;
  window_started_at: Date;
}

@Injectable()
export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly database: DatabaseClient) {}

  async consumeLoginAttempt(input: {
    accountKeyHash: string;
    limit: number;
    now: Date;
    sourceKeyHash: string;
    windowSeconds: number;
  }): Promise<RateLimitResult> {
    return this.database.sql.begin(async (transaction) => {
      const keys = [
        { hash: input.accountKeyHash, kind: 'account' },
        { hash: input.sourceKeyHash, kind: 'source' },
      ].sort((left, right) => left.kind.localeCompare(right.kind));
      const results: RateLimitRow[] = [];

      for (const key of keys) {
        const rows = await transaction<RateLimitRow[]>`
          insert into private.authentication_rate_limits (
            key_kind,
            key_hash,
            window_started_at,
            attempts
          ) values (
            ${key.kind},
            ${key.hash},
            ${input.now},
            1
          )
          on conflict (key_kind, key_hash) do update
          set attempts = case
                when private.authentication_rate_limits.window_started_at
                  <= ${input.now} - (${input.windowSeconds} * interval '1 second')
                then 1
                else private.authentication_rate_limits.attempts + 1
              end,
              window_started_at = case
                when private.authentication_rate_limits.window_started_at
                  <= ${input.now} - (${input.windowSeconds} * interval '1 second')
                then ${input.now}
                else private.authentication_rate_limits.window_started_at
              end
          returning attempts, window_started_at
        `;
        const row = rows[0];
        if (row === undefined) {
          throw new Error('AUTH_RATE_LIMIT_WRITE_FAILED');
        }
        results.push(row);
      }

      const blockedRows = results.filter((row) => row.attempts > input.limit);
      const retryAfterSeconds = blockedRows.reduce((maximum, row) => {
        const elapsedSeconds = Math.floor(
          (input.now.getTime() - row.window_started_at.getTime()) / 1_000,
        );
        return Math.max(maximum, Math.max(1, input.windowSeconds - elapsedSeconds));
      }, 0);

      return { isAllowed: blockedRows.length === 0, retryAfterSeconds };
    });
  }

  async createSession(input: NewAuthenticationSession): Promise<void> {
    await this.database.sql.begin(async (transaction) => {
      await this.insertSession(transaction, input);
      await transaction`
        insert into private.authentication_audit_events (
          account_id,
          event_type,
          source_key_hash,
          occurred_at
        ) values (
          ${input.accountId},
          ${input.eventType},
          ${input.sourceKeyHash ?? null},
          ${input.now}
        )
      `;
    });
  }

  async findLoginAccount(studentIdHash: string): Promise<LoginAccount | null> {
    const rows = await this.database.sql<AccountRow[]>`
      select
        account.id as account_id,
        account.status as account_status,
        account.credential_state,
        settings.current_academic_year,
        student.entry_year,
        (student_role.account_id is not null) as has_student_role,
        account.provider_user_id,
        student.access_ends_academic_year as student_access_ends_academic_year,
        identity.student_id_hash,
        identity.synthetic_identity
      from private.student_auth_identities as identity
      join public.accounts as account on account.id = identity.account_id
      join public.students as student on student.person_id = account.person_id
      left join public.account_roles as student_role
        on student_role.account_id = account.id and student_role.role = 'student'
      left join public.academic_settings as settings on settings.singleton = true
      where identity.student_id_hash = ${studentIdHash}
      limit 1
    `;
    return rows[0] === undefined ? null : this.mapAccount(rows[0]);
  }

  async findAdminLoginAccount(adminLoginHash: string): Promise<AdminLoginAccount | null> {
    const rows = await this.database.sql<AdminAccountRow[]>`
      select
        account.id as account_id,
        account.status as account_status,
        account.credential_state,
        (admin_role.account_id is not null) as has_admin_role,
        account.provider_user_id,
        identity.admin_login_hash,
        identity.synthetic_identity
      from private.admin_auth_identities as identity
      join public.accounts as account on account.id = identity.account_id
      left join public.account_roles as admin_role
        on admin_role.account_id = account.id and admin_role.role = 'admin'
      where identity.admin_login_hash = ${adminLoginHash}
      limit 1
    `;
    return rows[0] === undefined ? null : this.mapAdminAccount(rows[0]);
  }

  async findAdminSession(sessionIdHash: string): Promise<AdminAuthenticationSessionRecord | null> {
    const rows = await this.database.sql<AdminSessionRow[]>`
      select
        session.session_id_hash,
        session.provider_access_token,
        session.provider_refresh_token,
        session.provider_token_expires_at,
        session.last_activity_at,
        session.absolute_expires_at,
        session.revoked_at,
        account.id as account_id,
        account.status as account_status,
        account.credential_state,
        (admin_role.account_id is not null) as has_admin_role,
        account.provider_user_id,
        identity.admin_login_hash,
        identity.synthetic_identity
      from private.authentication_sessions as session
      join public.accounts as account on account.id = session.account_id
      join private.admin_auth_identities as identity on identity.account_id = account.id
      left join public.account_roles as admin_role
        on admin_role.account_id = account.id and admin_role.role = 'admin'
      where session.session_id_hash = ${sessionIdHash}
        and session.audience = 'admin'
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      ...this.mapAdminAccount(row),
      absoluteExpiresAt: row.absolute_expires_at,
      lastActivityAt: row.last_activity_at,
      providerAccessToken: row.provider_access_token,
      providerRefreshToken: row.provider_refresh_token,
      providerTokenExpiresAt: row.provider_token_expires_at,
      revokedAt: row.revoked_at,
      sessionIdHash: row.session_id_hash,
    };
  }

  async findSession(sessionIdHash: string): Promise<AuthenticationSessionRecord | null> {
    const rows = await this.database.sql<SessionRow[]>`
      select
        session.session_id_hash,
        session.provider_access_token,
        session.provider_refresh_token,
        session.provider_token_expires_at,
        session.last_activity_at,
        session.absolute_expires_at,
        session.revoked_at,
        account.id as account_id,
        account.status as account_status,
        account.credential_state,
        settings.current_academic_year,
        student.entry_year,
        (student_role.account_id is not null) as has_student_role,
        account.provider_user_id,
        student.access_ends_academic_year as student_access_ends_academic_year,
        identity.student_id_hash,
        identity.synthetic_identity
      from private.authentication_sessions as session
      join public.accounts as account on account.id = session.account_id
      join public.students as student on student.person_id = account.person_id
      join private.student_auth_identities as identity on identity.account_id = account.id
      left join public.account_roles as student_role
        on student_role.account_id = account.id and student_role.role = 'student'
      left join public.academic_settings as settings on settings.singleton = true
      where session.session_id_hash = ${sessionIdHash}
        and session.audience = 'student'
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    return {
      ...this.mapAccount(row),
      absoluteExpiresAt: row.absolute_expires_at,
      lastActivityAt: row.last_activity_at,
      providerAccessToken: row.provider_access_token,
      providerRefreshToken: row.provider_refresh_token,
      providerTokenExpiresAt: row.provider_token_expires_at,
      revokedAt: row.revoked_at,
      sessionIdHash: row.session_id_hash,
    };
  }

  async replaceAllAccountSessions(input: NewAuthenticationSession): Promise<void> {
    await this.database.sql.begin(async (transaction) => {
      await transaction`
        update public.accounts
        set credential_state = 'set', updated_at = ${input.now}
        where id = ${input.accountId}
      `;
      await transaction`
        update private.authentication_sessions
        set revoked_at = ${input.now}, revocation_reason = 'password_changed'
        where account_id = ${input.accountId} and revoked_at is null
      `;
      await this.insertSession(transaction, input);
      await transaction`
        insert into private.authentication_audit_events (account_id, event_type, occurred_at)
        values (${input.accountId}, ${input.eventType}, ${input.now})
      `;
    });
  }

  async revokeSession(
    sessionIdHash: string,
    now: Date,
    reason: 'authorization_changed' | 'expired' | 'logout' | 'provider_invalid',
  ): Promise<void> {
    await this.database.sql.begin(async (transaction) => {
      const rows = await transaction<{ account_id: string; audience: string }[]>`
        update private.authentication_sessions
        set revoked_at = ${now}, revocation_reason = ${reason}
        where session_id_hash = ${sessionIdHash} and revoked_at is null
        returning account_id, audience
      `;
      const row = rows[0];
      if (row !== undefined) {
        await transaction`
          insert into private.authentication_audit_events (account_id, event_type, occurred_at)
          values (${row.account_id}, ${`${row.audience}_session_${reason}`}, ${now})
        `;
      }
    });
  }

  async touchSession(sessionIdHash: string, now: Date): Promise<void> {
    await this.database.sql`
      update private.authentication_sessions
      set last_activity_at = ${now}
      where session_id_hash = ${sessionIdHash} and revoked_at is null
    `;
  }

  async updateProviderSession(
    sessionIdHash: string,
    providerSession: ProviderSession,
    now: Date,
  ): Promise<void> {
    await this.database.sql`
      update private.authentication_sessions
      set provider_access_token = ${providerSession.accessToken},
          provider_refresh_token = ${providerSession.refreshToken},
          provider_token_expires_at = ${providerSession.expiresAt},
          last_activity_at = ${now}
      where session_id_hash = ${sessionIdHash} and revoked_at is null
    `;
  }

  private async insertSession(
    transaction: postgres.TransactionSql,
    input: NewAuthenticationSession,
  ): Promise<void> {
    await transaction`
      insert into private.authentication_sessions (
        session_id_hash,
        account_id,
        audience,
        provider_access_token,
        provider_refresh_token,
        provider_token_expires_at,
        created_at,
        last_activity_at,
        absolute_expires_at
      ) values (
        ${input.sessionIdHash},
        ${input.accountId},
        ${input.audience},
        ${input.providerSession.accessToken},
        ${input.providerSession.refreshToken},
        ${input.providerSession.expiresAt},
        ${input.now},
        ${input.now},
        ${input.absoluteExpiresAt}
      )
    `;
  }

  private mapAccount(row: AccountRow): LoginAccount {
    return {
      accountId: row.account_id,
      accountStatus: row.account_status,
      credentialState: row.credential_state,
      currentAcademicYear: row.current_academic_year,
      entryYear: row.entry_year,
      hasStudentRole: row.has_student_role,
      providerUserId: row.provider_user_id,
      studentAccessEndsAcademicYear: row.student_access_ends_academic_year,
      studentIdHash: row.student_id_hash,
      syntheticIdentity: row.synthetic_identity,
    };
  }

  private mapAdminAccount(row: AdminAccountRow): AdminLoginAccount {
    return {
      accountId: row.account_id,
      accountStatus: row.account_status,
      adminLoginHash: row.admin_login_hash,
      credentialState: row.credential_state,
      hasAdminRole: row.has_admin_role,
      providerUserId: row.provider_user_id,
      syntheticIdentity: row.synthetic_identity,
    };
  }
}
