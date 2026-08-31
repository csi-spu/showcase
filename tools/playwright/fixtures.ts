import postgres from 'postgres';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { test as base } from '@playwright/test';
import { assertLocalE2EEnvironment } from './environment.ts';

export interface ConsentHistoryEntry {
  consentTextVersion: string;
  grantedAt: string;
  withdrawnAt: string | null;
}

export interface ConsentState {
  history: ConsentHistoryEntry[];
  isGranted: boolean;
}

export interface ProfileConsentScenario {
  firstName: string;
  initialPassword: string;
  lastName: string;
  newPassword: string;
  publicProfileUrl: string;
  publicId: string;
  readConsentState(): Promise<ConsentState>;
  studentId: string;
}

interface OwnedResources {
  accountId: string;
  personId: string;
  providerUserId: string | null;
  studentIdHash: string;
}

const environment = assertLocalE2EEnvironment({
  APP_ENV: process.env.APP_ENV,
  AUTH_IDENTITY_SECRET: process.env.AUTH_IDENTITY_SECRET,
  CORE_URL: process.env.CORE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  E2E_LOCAL_ONLY: process.env.E2E_LOCAL_ONLY,
  STUDENT_URL: process.env.STUDENT_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
  VISITOR_URL: process.env.VISITOR_URL,
});

export const test = base.extend<{ scenario: ProfileConsentScenario }>({
  scenario: async ({}, use) => {
    const scenario = await createProfileConsentScenario();
    try {
      await use(scenario);
    } finally {
      await scenario.cleanup();
    }
  },
});

export { expect } from '@playwright/test';

async function createProfileConsentScenario(): Promise<
  ProfileConsentScenario & { cleanup(): Promise<void> }
> {
  const runId = randomUUID();
  const studentId = createStudentId(runId);
  const initialPassword = studentId;
  const newPassword = `E2e!${createHash('sha256').update(runId).digest('hex').slice(0, 18)}A1`;
  const identity = toSyntheticIdentity(studentId);
  const personId = randomUUID();
  const accountId = randomUUID();
  const publicId = randomUUID();
  const now = new Date();
  const resources: OwnedResources = {
    accountId,
    personId,
    providerUserId: null,
    studentIdHash: hashStudentId(studentId),
  };
  const database = postgres(environment.databaseUrl, {
    connect_timeout: 5,
    idle_timeout: 20,
    max: 2,
    prepare: true,
  });

  try {
    resources.providerUserId = await createAuthIdentity(identity, initialPassword);
    await database.begin(async (transaction) => {
      await transaction`insert into public.people (id, created_at) values (${personId}, ${now})`;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year, created_at)
        values (${personId}, 2569, 2576, ${now})
      `;
      await transaction`
        insert into private.person_names (person_id, first_name_th, last_name_th, created_at, updated_at)
        values (${personId}, 'อีทูอี', 'นักศึกษาทดสอบ', ${now}, ${now})
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state, created_at, updated_at)
        values (${accountId}, ${personId}, ${resources.providerUserId}, 'initial', ${now}, ${now})
      `;
      await transaction`
        insert into public.account_roles (account_id, role, created_at)
        values (${accountId}, 'student', ${now})
      `;
      await transaction`
        insert into private.student_auth_identities (account_id, student_id_hash, synthetic_identity, created_at)
        values (${accountId}, ${resources.studentIdHash}, ${identity}, ${now})
      `;
      await transaction`
        insert into public.public_profiles (person_id, public_id, bio, version, created_at, updated_at)
        values (${personId}, ${publicId}, 'โปรไฟล์ทดสอบก่อนแก้ไข', 1, ${now}, ${now})
      `;
    });
  } catch (error: unknown) {
    await cleanupResources(database, resources);
    throw new Error('E2E_FIXTURE_SETUP_FAILED', { cause: error });
  }

  return {
    cleanup: () => cleanupResources(database, resources),
    firstName: 'อีทูอี',
    initialPassword,
    lastName: 'นักศึกษาทดสอบ',
    newPassword,
    publicId,
    publicProfileUrl: new URL(`/people/${publicId}`, environment.visitorUrl).toString(),
    readConsentState: async () => {
      const rows = await database<
        {
          consentTextVersion: string;
          grantedAt: string;
          withdrawnAt: string | null;
        }[]
      >`
        select
          consent_text_version as "consentTextVersion",
          granted_at::text as "grantedAt",
          withdrawn_at::text as "withdrawnAt"
        from public.profile_consents
        where person_id = ${personId}
        order by granted_at asc, id asc
      `;
      return {
        history: rows,
        isGranted: rows.some((row) => row.withdrawnAt === null),
      };
    },
    studentId,
  };
}

async function createAuthIdentity(identity: string, password: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${environment.supabaseUrl}/auth/v1/admin/users`, {
      body: JSON.stringify({ email: identity, email_confirm: true, password }),
      headers: {
        apikey: environment.supabaseSecretKey,
        authorization: `Bearer ${environment.supabaseSecretKey}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error: unknown) {
    throw new Error('E2E_FIXTURE_AUTH_UNAVAILABLE', { cause: error });
  }
  if (!response.ok) throw new Error('E2E_FIXTURE_AUTH_CREATE_FAILED');
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new Error('E2E_FIXTURE_AUTH_CREATE_FAILED');
  }
  return body.id;
}

async function cleanupResources(database: postgres.Sql, resources: OwnedResources): Promise<void> {
  let providerFailure = false;
  if (resources.providerUserId !== null) {
    try {
      const response = await fetch(
        `${environment.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(resources.providerUserId)}`,
        {
          headers: {
            apikey: environment.supabaseSecretKey,
            authorization: `Bearer ${environment.supabaseSecretKey}`,
          },
          method: 'DELETE',
          signal: AbortSignal.timeout(5_000),
        },
      );
      providerFailure = !response.ok && response.status !== 404;
    } catch {
      providerFailure = true;
    }
  }

  let databaseFailure = false;
  try {
    await database.begin(async (transaction) => {
      await transaction`delete from private.profile_operations where person_id = ${resources.personId}`;
      await transaction`delete from public.profile_consents where person_id = ${resources.personId}`;
      await transaction`delete from public.public_profile_links where person_id = ${resources.personId}`;
      await transaction`delete from public.public_profiles where person_id = ${resources.personId}`;
      await transaction`delete from private.authentication_audit_events where account_id = ${resources.accountId}`;
      await transaction`delete from private.authentication_sessions where account_id = ${resources.accountId}`;
      await transaction`delete from private.authentication_rate_limits where key_hash = ${resources.studentIdHash}`;
      await transaction`delete from private.student_auth_identities where account_id = ${resources.accountId}`;
      await transaction`delete from public.account_roles where account_id = ${resources.accountId}`;
      await transaction`delete from public.accounts where id = ${resources.accountId}`;
      await transaction`delete from public.students where person_id = ${resources.personId}`;
      await transaction`delete from private.person_names where person_id = ${resources.personId}`;
      await transaction`delete from public.people where id = ${resources.personId}`;
    });
  } catch {
    databaseFailure = true;
  } finally {
    try {
      await database.end({ timeout: 5 });
    } catch {
      databaseFailure = true;
    }
  }
  if (providerFailure || databaseFailure) throw new Error('E2E_FIXTURE_CLEANUP_FAILED');
}

function createStudentId(runId: string): string {
  const digits = createHash('sha256')
    .update(runId)
    .digest('hex')
    .replace(/[^0-9]/gu, '');
  const value = Number.parseInt(digits.slice(0, 8), 10) || 1;
  return String(value).padStart(8, '0').slice(-8);
}

function hashStudentId(studentId: string): string {
  return createHmac('sha256', environment.authIdentitySecret)
    .update('student-id')
    .update('\0')
    .update(studentId)
    .digest('hex');
}

function toSyntheticIdentity(studentId: string): string {
  return `${hashStudentId(studentId)}@auth.invalid`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
