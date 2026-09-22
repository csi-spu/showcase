import { execFileSync } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import path from 'node:path';
import { test as base } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import postgres from 'postgres';
import { assertLocalE2EEnvironment } from './environment.ts';
import { createIdempotentCleanup } from './fixture-lifecycle.ts';
import { registerSensitiveValues } from './sensitive-artifacts.ts';
import { createE2ESourceAddress } from './source-address.ts';

export interface CollectionLifecycleScenario {
  answerLabel: string;
  formId: string;
  formTitle: string;
  groupId: string;
  instructorLogin: string;
  instructorPassword: string;
  instructorSourceAddress: string;
  instructorUrl: string;
  protectBrowserContext(context: BrowserContext): Promise<void>;
  studentId: string;
  studentName: string;
  studentPassword: string;
  studentSourceAddress: string;
  studentCollectionUrl: string;
}

interface CollectionOwnedResources {
  formId: string;
  groupId: string;
  instructorAccountId: string;
  instructorLoginHash: string;
  instructorPersonId: string;
  instructorProviderUserId: string | null;
  roundId: string;
  studentAccountId: string;
  studentIdHash: string;
  studentPersonId: string;
  studentProviderUserId: string | null;
}

const environment = assertLocalE2EEnvironment({
  ADMIN_URL: process.env.ADMIN_URL,
  API_KEY: process.env.API_KEY,
  APP_ENV: process.env.APP_ENV,
  CORE_URL: process.env.CORE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  E2E_LOCAL_ONLY: process.env.E2E_LOCAL_ONLY,
  INSTRUCTOR_URL: process.env.INSTRUCTOR_URL,
  MEDIA_PROVIDER_URL: process.env.MEDIA_PROVIDER_URL,
  STUDENT_COLLECTION_URL: process.env.STUDENT_COLLECTION_URL,
  STUDENT_URL: process.env.STUDENT_URL,
  VISITOR_URL: process.env.VISITOR_URL,
});

export const test = base.extend<{ collectionScenario: CollectionLifecycleScenario }>({
  collectionScenario: async ({}, use) => {
    const scenario = await createCollectionLifecycleScenario();
    try {
      await use(scenario);
    } finally {
      await scenario.cleanup();
    }
  },
});

async function createCollectionLifecycleScenario(): Promise<
  CollectionLifecycleScenario & { cleanup(): Promise<void> }
> {
  const runId = randomUUID();
  const runShort = createHash('sha256').update(runId).digest('hex').slice(0, 12);
  const studentId = createStudentId(runId);
  const studentPassword = `Stu!${runShort}CollectionA1`;
  const instructorLogin = `e2e-instructor-${runShort}`;
  const instructorPassword = `Ins!${runShort}CollectionA1`;
  const studentIdentity = toStudentSyntheticIdentity(studentId);
  const instructorIdentity = toInstructorSyntheticIdentity(instructorLogin);
  const studentPersonId = randomUUID();
  const studentAccountId = randomUUID();
  const instructorPersonId = randomUUID();
  const instructorAccountId = randomUUID();
  const roundId = randomUUID();
  const groupId = randomUUID();
  const formId = randomUUID();
  const answerLabel = `สถานที่ฝึกงาน ${runShort}`;
  const formTitle = `แบบฟอร์ม E2E ${runShort}`;
  const studentName = `อีทูอี นักศึกษาคอลเลกชัน-${runShort}`;
  const now = new Date();
  const resources: CollectionOwnedResources = {
    formId,
    groupId,
    instructorAccountId,
    instructorLoginHash: hashAdminLogin(instructorLogin),
    instructorPersonId,
    instructorProviderUserId: null,
    roundId,
    studentAccountId,
    studentIdHash: hashStudentId(studentId),
    studentPersonId,
    studentProviderUserId: null,
  };
  const database = postgres(environment.databaseUrl, {
    connect_timeout: 5,
    idle_timeout: 20,
    max: 2,
    prepare: true,
  });
  registerSensitiveValues([
    studentId,
    studentPassword,
    studentIdentity,
    instructorLogin,
    instructorPassword,
    instructorIdentity,
  ]);

  try {
    resources.studentProviderUserId = await createAuthIdentity(studentIdentity, studentPassword);
    resources.instructorProviderUserId = await createAuthIdentity(
      instructorIdentity,
      instructorPassword,
    );
    await database.begin(async (transaction) => {
      await transaction`
        insert into public.people (id, created_at)
        values (${studentPersonId}, ${now}), (${instructorPersonId}, ${now})
      `;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year, created_at)
        values (${studentPersonId}, 2569, 2576, ${now})
      `;
      await transaction`
        insert into private.person_names (person_id, first_name_th, last_name_th, created_at, updated_at)
        values
          (${studentPersonId}, 'อีทูอี', ${`นักศึกษาคอลเลกชัน-${runShort}`}, ${now}, ${now}),
          (${instructorPersonId}, 'อีทูอี', ${`ผู้สอนคอลเลกชัน-${runShort}`}, ${now}, ${now})
      `;
      await transaction`
        insert into public.accounts
          (id, person_id, provider_user_id, credential_state, created_at, updated_at)
        values
          (${studentAccountId}, ${studentPersonId}, ${resources.studentProviderUserId}, 'set', ${now}, ${now}),
          (${instructorAccountId}, ${instructorPersonId}, ${resources.instructorProviderUserId}, 'set', ${now}, ${now})
      `;
      await transaction`
        insert into public.account_roles (account_id, role, created_at)
        values (${studentAccountId}, 'student', ${now}), (${instructorAccountId}, 'instructor', ${now})
      `;
      await transaction`
        insert into private.student_auth_identities
          (account_id, student_id_hash, synthetic_identity, created_at)
        values (${studentAccountId}, ${resources.studentIdHash}, ${studentIdentity}, ${now})
      `;
      await transaction`
        insert into private.admin_auth_identities
          (account_id, admin_login_hash, synthetic_identity, created_at)
        values (${instructorAccountId}, ${resources.instructorLoginHash}, ${instructorIdentity}, ${now})
      `;
      await transaction`
        insert into public.collection_rounds
          (id, name, status, created_by_account_id, created_at)
        values (${roundId}, ${`รอบ E2E ${runShort}`}, 'active', ${instructorAccountId}, ${now})
      `;
      await transaction`
        insert into public.collection_groups
          (id, round_id, name, created_by_account_id, created_at)
        values (${groupId}, ${roundId}, ${`กลุ่ม E2E ${runShort}`}, ${instructorAccountId}, ${now})
      `;
      await transaction`
        insert into public.collection_group_memberships
          (group_id, student_account_id, status, membership_source, added_by_account_id, added_at)
        values (${groupId}, ${studentAccountId}, 'current', 'individual', ${instructorAccountId}, ${now})
      `;
      await transaction`
        insert into public.collection_forms
          (id, group_id, title, description, status, fields, created_by_account_id,
           created_at, opened_at, version)
        values (
          ${formId}, ${groupId}, ${formTitle}, 'ใช้ทดสอบวงจรส่งและขอแก้ไข', 'open',
          ${transaction.json([
            {
              description: 'กรอกชื่อสถานที่สำหรับทดสอบ autosave',
              id: 'placement-name',
              label: answerLabel,
              required: true,
              type: 'short_text',
            },
          ])},
          ${instructorAccountId}, ${now}, ${now}, 1
        )
      `;
      await transaction`
        insert into public.collection_obligations
          (form_id, student_account_id, status, assigned_at)
        values (${formId}, ${studentAccountId}, 'not_submitted', ${now})
      `;
    });
  } catch (error: unknown) {
    await cleanupCollectionResources(database, resources);
    throw new Error('E2E_COLLECTION_FIXTURE_SETUP_FAILED', { cause: error });
  }

  const cleanup = createIdempotentCleanup(() => cleanupCollectionResources(database, resources));
  return {
    answerLabel,
    cleanup,
    formId,
    formTitle,
    groupId,
    instructorLogin,
    instructorPassword,
    instructorSourceAddress: createE2ESourceAddress(runShort, 2),
    instructorUrl: environment.instructorUrl,
    protectBrowserContext: registerBrowserContextSecrets,
    studentCollectionUrl: environment.studentCollectionUrl,
    studentId,
    studentName,
    studentPassword,
    studentSourceAddress: createE2ESourceAddress(runShort, 1),
  };
}

async function createAuthIdentity(identity: string, password: string): Promise<string> {
  try {
    const result = execFileSync(
      process.execPath,
      [
        path.join(process.cwd(), 'tools/playwright/better-auth-fixture.mjs'),
        'create',
        identity,
        password,
      ],
      { encoding: 'utf8', env: process.env },
    ).trim();
    if (result.length === 0) throw new Error('empty identity');
    return result;
  } catch (error: unknown) {
    throw new Error('E2E_COLLECTION_FIXTURE_AUTH_CREATE_FAILED', { cause: error });
  }
}

async function cleanupCollectionResources(
  database: postgres.Sql,
  resources: CollectionOwnedResources,
): Promise<void> {
  let providerFailure = false;
  for (const providerUserId of [
    resources.studentProviderUserId,
    resources.instructorProviderUserId,
  ]) {
    if (providerUserId === null) continue;
    try {
      execFileSync(
        process.execPath,
        [
          path.join(process.cwd(), 'tools/playwright/better-auth-fixture.mjs'),
          'delete',
          providerUserId,
        ],
        { env: process.env, stdio: 'ignore' },
      );
    } catch {
      providerFailure = true;
    }
  }

  let databaseFailure = false;
  try {
    await database.begin(async (transaction) => {
      await transaction`
        delete from private.collection_checking_events
        where submission_id in (
          select id from private.collection_submissions where form_id = ${resources.formId}
        )
      `;
      await transaction`
        delete from private.collection_submission_files
        where submission_id in (
          select id from private.collection_submissions where form_id = ${resources.formId}
        )
      `;
      await transaction`
        update public.collection_obligations set latest_submission_id = null
        where form_id = ${resources.formId}
      `;
      await transaction`delete from private.collection_submissions where form_id = ${resources.formId}`;
      await transaction`delete from private.collection_draft_files where form_id = ${resources.formId}`;
      await transaction`delete from private.collection_response_drafts where form_id = ${resources.formId}`;
      await transaction`delete from private.collection_files where form_id = ${resources.formId}`;
      await transaction`delete from public.collection_obligations where form_id = ${resources.formId}`;
      await transaction`delete from private.collection_form_metadata_events where form_id = ${resources.formId}`;
      await transaction`delete from public.collection_forms where id = ${resources.formId}`;
      await transaction`
        delete from private.collection_membership_audit_events where group_id = ${resources.groupId}
      `;
      await transaction`
        delete from public.collection_group_memberships where group_id = ${resources.groupId}
      `;
      await transaction`delete from public.collection_groups where id = ${resources.groupId}`;
      await transaction`delete from public.collection_rounds where id = ${resources.roundId}`;
      await transaction`
        delete from private.authentication_sessions
        where account_id in (${resources.studentAccountId}, ${resources.instructorAccountId})
      `;
      await transaction`
        delete from private.authentication_audit_events
        where account_id in (${resources.studentAccountId}, ${resources.instructorAccountId})
      `;
      await transaction`
        delete from private.authentication_rate_limits
        where key_hash in (${resources.studentIdHash}, ${resources.instructorLoginHash})
      `;
      await transaction`
        delete from private.student_auth_identities where account_id = ${resources.studentAccountId}
      `;
      await transaction`
        delete from private.admin_auth_identities where account_id = ${resources.instructorAccountId}
      `;
      await transaction`
        delete from public.account_roles
        where account_id in (${resources.studentAccountId}, ${resources.instructorAccountId})
      `;
      await transaction`
        delete from public.accounts
        where id in (${resources.studentAccountId}, ${resources.instructorAccountId})
      `;
      await transaction`delete from public.students where person_id = ${resources.studentPersonId}`;
      await transaction`
        delete from private.person_names
        where person_id in (${resources.studentPersonId}, ${resources.instructorPersonId})
      `;
      await transaction`
        delete from public.people
        where id in (${resources.studentPersonId}, ${resources.instructorPersonId})
      `;
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
  if (providerFailure || databaseFailure) throw new Error('E2E_COLLECTION_FIXTURE_CLEANUP_FAILED');
}

async function registerBrowserContextSecrets(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies();
  registerSensitiveValues(cookies.map((cookie) => cookie.value));
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

function hashAdminLogin(instructorLogin: string): string {
  return createHmac('sha256', environment.authIdentitySecret)
    .update('admin-login')
    .update('\0')
    .update(instructorLogin)
    .digest('hex');
}

function toStudentSyntheticIdentity(studentId: string): string {
  return `${hashStudentId(studentId)}@auth.invalid`;
}

function toInstructorSyntheticIdentity(instructorLogin: string): string {
  return `${hashAdminLogin(instructorLogin)}@admin.auth.invalid`;
}

export { expect } from '@playwright/test';
