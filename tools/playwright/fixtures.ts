import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import path from 'node:path';
import { test as base } from '@playwright/test';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { assertLocalE2EEnvironment } from './environment.ts';
import { createIdempotentCleanup } from './fixture-lifecycle.ts';
import { registerSensitiveValues } from './sensitive-artifacts.ts';
import { createE2ESourceAddress } from './source-address.ts';

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
  protectBrowserContext(context: BrowserContext): Promise<void>;
  readConsentState(): Promise<ConsentState>;
  sourceAddress: string;
  studentId: string;
}

export interface WorkLifecycleScenario {
  adminInitialPassword: string;
  adminLogin: string;
  adminNewPassword: string;
  adminSourceAddress: string;
  contributorName: string;
  initialPassword: string;
  newPassword: string;
  protectBrowserContext(context: BrowserContext): Promise<void>;
  readState(publicId: string): Promise<WorkLifecycleState>;
  studentSourceAddress: string;
  studentId: string;
  studentName: string;
  tagLabel: string;
  workPublicUrl(publicId: string): string;
}

export interface WorkLifecycleState {
  attributions: Array<{
    attributionName: string;
    contributionRole: string | null;
    kind: 'account' | 'external' | 'submitter';
    position: number;
    revisionNumber: number;
    studyYear: number | null;
  }>;
  links: Array<{
    label: string;
    position: number;
    revisionNumber: number;
    url: string;
  }>;
  media: Array<{
    hasMaster: boolean;
    hasSanitizedObjectKeys: boolean;
    kind: 'gallery' | 'poster';
    position: number;
    revisionNumber: number;
    status: string;
    variantWidths: number[];
  }>;
  operations: string[];
  outboxEvents: string[];
  publishedRevisionPublicId: string | null;
  revisions: Array<{
    basePublishedRevisionId: string | null;
    number: number;
    publicId: string;
    status: string;
    summary: string;
    title: string;
    version: number;
  }>;
  reviews: Array<{
    decision: string;
    feedback: string | null;
    reason: string | null;
    revisionNumber: number;
  }>;
  tags: Array<{
    displayLabel: string;
    normalizedIdentity: string;
    position: number;
    revisionNumber: number;
  }>;
  videoLinks: Array<{
    position: number;
    provider: 'tiktok' | 'youtube';
    providerVideoId: string;
    revisionNumber: number;
    url: string;
  }>;
  work: {
    activityState: string;
    publicationState: string;
    version: number;
  };
}

interface OwnedResources {
  accountId: string;
  personId: string;
  providerUserId: string | null;
  studentIdHash: string;
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

export const test = base.extend<{
  scenario: ProfileConsentScenario;
  workScenario: WorkLifecycleScenario;
}>({
  scenario: async ({}, use) => {
    const scenario = await createProfileConsentScenario();
    try {
      await use(scenario);
    } finally {
      await scenario.cleanup();
    }
  },
  workScenario: async ({}, use) => {
    const scenario = await createWorkLifecycleScenario();
    try {
      await use(scenario);
    } finally {
      await scenario.cleanup();
    }
  },
});

export async function captureSanitizedFailureScreenshot(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus || page.isClosed()) return;
  const screenshotPath = testInfo.outputPath('sanitized-failure.png');
  await page.screenshot({
    fullPage: true,
    mask: [page.locator('input, textarea')],
    maskColor: '#000000',
    path: screenshotPath,
  });
  await testInfo.attach('sanitized screenshot', { contentType: 'image/png', path: screenshotPath });
}

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
  registerSensitiveValues([studentId, initialPassword, newPassword, identity]);

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

  const cleanup = createIdempotentCleanup(() => cleanupResources(database, resources));
  return {
    cleanup,
    firstName: 'อีทูอี',
    initialPassword,
    lastName: 'นักศึกษาทดสอบ',
    newPassword,
    publicId,
    publicProfileUrl: new URL(`/people/${publicId}`, environment.visitorUrl).toString(),
    protectBrowserContext: registerBrowserContextSecrets,
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
    sourceAddress: createE2ESourceAddress(
      createHash('sha256').update(runId).digest('hex').slice(0, 12),
      1,
    ),
    studentId,
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
      { env: process.env, encoding: 'utf8' },
    ).trim();
    if (result.length === 0) throw new Error('empty identity');
    return result;
  } catch (error: unknown) {
    throw new Error('E2E_FIXTURE_AUTH_CREATE_FAILED', { cause: error });
  }
}

async function cleanupResources(database: postgres.Sql, resources: OwnedResources): Promise<void> {
  let providerFailure = false;
  if (resources.providerUserId !== null) {
    try {
      execFileSync(
        process.execPath,
        [
          path.join(process.cwd(), 'tools/playwright/better-auth-fixture.mjs'),
          'delete',
          resources.providerUserId,
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

interface WorkOwnedResources {
  accountId: string;
  adminAccountId: string;
  adminPersonId: string;
  adminProviderUserId: string | null;
  contributorAccountId: string;
  contributorPersonId: string;
  personId: string;
  providerUserId: string | null;
  tagLabel: string;
  studentIdHash: string;
}

interface WorkLifecycleFixtureScenario extends WorkLifecycleScenario {
  cleanup(): Promise<void>;
  verifyCleanup(): Promise<void>;
  verifySetup(): Promise<void>;
}

async function createWorkLifecycleScenario(): Promise<WorkLifecycleFixtureScenario> {
  const runId = randomUUID();
  const runShort = createHash('sha256').update(runId).digest('hex').slice(0, 12);
  const studentId = createStudentId(runId);
  const initialPassword = studentId;
  const newPassword = `E2e!${runShort}StudentA1`;
  const adminLogin = `e2e-admin-${runShort}`;
  const adminInitialPassword = `Adm!${runShort}InitialA1`;
  const adminNewPassword = `Adm!${runShort}ReviewA1`;
  const studentIdentity = toSyntheticIdentity(studentId);
  const adminIdentity = toSyntheticAdminIdentity(adminLogin);
  const personId = randomUUID();
  const accountId = randomUUID();
  const adminPersonId = randomUUID();
  const adminAccountId = randomUUID();
  const contributorPersonId = randomUUID();
  const contributorAccountId = randomUUID();
  const contributorStudentId = createStudentId(`${runId}:contributor`);
  const now = new Date();
  const tagLabel = `e2e-${runShort}`;
  const studentName = `อีทูอี ผู้ส่งผลงาน-${runShort}`;
  const contributorName = `อีทูอี ผู้ร่วมทดสอบ-${runShort}`;
  const resources: WorkOwnedResources = {
    accountId,
    adminAccountId,
    adminPersonId,
    adminProviderUserId: null,
    contributorAccountId,
    contributorPersonId,
    personId,
    providerUserId: null,
    studentIdHash: hashStudentId(studentId),
    tagLabel,
  };
  const database = postgres(environment.databaseUrl, {
    connect_timeout: 5,
    idle_timeout: 20,
    max: 2,
    prepare: true,
  });
  registerSensitiveValues([
    studentId,
    initialPassword,
    newPassword,
    studentIdentity,
    adminLogin,
    adminInitialPassword,
    adminNewPassword,
    adminIdentity,
  ]);

  try {
    resources.providerUserId = await createAuthIdentity(studentIdentity, initialPassword);
    resources.adminProviderUserId = await createAuthIdentity(adminIdentity, adminInitialPassword);
    await database.begin(async (transaction) => {
      await transaction`insert into public.people (id, created_at) values (${personId}, ${now})`;
      await transaction`insert into public.people (id, created_at) values (${adminPersonId}, ${now})`;
      await transaction`insert into public.people (id, created_at) values (${contributorPersonId}, ${now})`;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year, created_at)
        values (${personId}, 2569, 2576, ${now}), (${contributorPersonId}, 2569, 2576, ${now})
      `;
      await transaction`
        insert into private.person_names (person_id, first_name_th, last_name_th, created_at, updated_at)
        values
          (${personId}, 'อีทูอี', ${`ผู้ส่งผลงาน-${runShort}`}, ${now}, ${now}),
          (${adminPersonId}, 'อีทูอี', ${`ผู้ดูแล-${runShort}`}, ${now}, ${now}),
          (${contributorPersonId}, 'อีทูอี', ${`ผู้ร่วมทดสอบ-${runShort}`}, ${now}, ${now})
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state, created_at, updated_at)
        values
          (${accountId}, ${personId}, ${resources.providerUserId}, 'initial', ${now}, ${now}),
          (${adminAccountId}, ${adminPersonId}, ${resources.adminProviderUserId}, 'initial', ${now}, ${now}),
          (${contributorAccountId}, ${contributorPersonId}, ${randomUUID()}, 'set', ${now}, ${now})
      `;
      await transaction`
        insert into public.account_roles (account_id, role, created_at)
        values
          (${accountId}, 'student', ${now}),
          (${adminAccountId}, 'admin', ${now}),
          (${contributorAccountId}, 'student', ${now})
      `;
      await transaction`
        insert into private.student_auth_identities (account_id, student_id_hash, synthetic_identity, created_at)
        values
          (${accountId}, ${resources.studentIdHash}, ${studentIdentity}, ${now}),
          (${contributorAccountId}, ${hashStudentId(contributorStudentId)}, ${toSyntheticIdentity(contributorStudentId)}, ${now})
      `;
      await transaction`
        insert into private.admin_auth_identities (account_id, admin_login_hash, synthetic_identity, created_at)
        values (${adminAccountId}, ${hashAdminLogin(adminLogin)}, ${adminIdentity}, ${now})
      `;
    });
  } catch (error: unknown) {
    await cleanupWorkResources(database, resources);
    throw new Error('E2E_FIXTURE_SETUP_FAILED', { cause: error });
  }

  const cleanup = createIdempotentCleanup(() => cleanupWorkResources(database, resources));
  return {
    adminInitialPassword,
    adminLogin,
    adminNewPassword,
    adminSourceAddress: createE2ESourceAddress(runShort, 2),
    cleanup,
    contributorName,
    initialPassword,
    newPassword,
    protectBrowserContext: registerBrowserContextSecrets,
    readState: (publicId) => readWorkLifecycleState(database, publicId),
    studentSourceAddress: createE2ESourceAddress(runShort, 1),
    studentId,
    studentName,
    tagLabel,
    verifyCleanup: () => verifyWorkFixtureResources(resources, false),
    verifySetup: () => verifyWorkFixtureResources(resources, true, database),
    workPublicUrl: (publicId) => new URL(`/works/${publicId}`, environment.visitorUrl).toString(),
  };
}

async function registerBrowserContextSecrets(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies();
  registerSensitiveValues(cookies.map((cookie) => cookie.value));
}

export async function verifyWorkLifecycleFixtureIntegration(): Promise<void> {
  const scenario = await createWorkLifecycleScenario();
  try {
    await scenario.verifySetup();
  } finally {
    await scenario.cleanup();
  }
  await scenario.cleanup();
  await scenario.verifyCleanup();
}

async function verifyWorkFixtureResources(
  resources: WorkOwnedResources,
  shouldExist: boolean,
  existingDatabase?: postgres.Sql,
): Promise<void> {
  const database =
    existingDatabase ??
    postgres(environment.databaseUrl, {
      connect_timeout: 5,
      idle_timeout: 5,
      max: 1,
      prepare: true,
    });
  try {
    const rows = await database<
      Array<{
        accountCount: number;
        adminIdentityCount: number;
        peopleCount: number;
        studentIdentityCount: number;
      }>
    >`
      select
        (select count(*)::integer from public.people
          where id in (${resources.personId}, ${resources.adminPersonId}, ${resources.contributorPersonId}))
          as "peopleCount",
        (select count(*)::integer from public.accounts
          where id in (${resources.accountId}, ${resources.adminAccountId}, ${resources.contributorAccountId}))
          as "accountCount",
        (select count(*)::integer from private.student_auth_identities
          where account_id in (${resources.accountId}, ${resources.contributorAccountId}))
          as "studentIdentityCount",
        (select count(*)::integer from private.admin_auth_identities
          where account_id = ${resources.adminAccountId})
          as "adminIdentityCount"
    `;
    const row = rows[0];
    const expected = shouldExist
      ? { accountCount: 3, adminIdentityCount: 1, peopleCount: 3, studentIdentityCount: 2 }
      : { accountCount: 0, adminIdentityCount: 0, peopleCount: 0, studentIdentityCount: 0 };
    if (
      row === undefined ||
      Number(row.accountCount) !== expected.accountCount ||
      Number(row.adminIdentityCount) !== expected.adminIdentityCount ||
      Number(row.peopleCount) !== expected.peopleCount ||
      Number(row.studentIdentityCount) !== expected.studentIdentityCount
    ) {
      throw new Error(
        shouldExist ? 'E2E_FIXTURE_SETUP_ASSERTION_FAILED' : 'E2E_FIXTURE_CLEANUP_ASSERTION_FAILED',
      );
    }
    for (const providerUserId of [resources.providerUserId, resources.adminProviderUserId]) {
      if (providerUserId === null) throw new Error('E2E_FIXTURE_AUTH_ASSERTION_FAILED');
      const result = execFileSync(
        process.execPath,
        [
          path.join(process.cwd(), 'tools/playwright/better-auth-fixture.mjs'),
          'exists',
          providerUserId,
        ],
        { env: process.env, encoding: 'utf8' },
      ).trim();
      if ((shouldExist && result.length === 0) || (!shouldExist && result.length > 0)) {
        throw new Error('E2E_FIXTURE_AUTH_ASSERTION_FAILED');
      }
    }
  } finally {
    if (existingDatabase === undefined) await database.end({ timeout: 5 });
  }
}

async function readWorkLifecycleState(
  database: postgres.Sql,
  publicId: string,
): Promise<WorkLifecycleState> {
  const workRows = await database<
    (WorkLifecycleState['work'] & { published_revision_public_id: string | null })[]
  >`
    select work.activity_state as "activityState", work.publication_state as "publicationState",
      work.version, revision.public_id as published_revision_public_id
    from public.works as work
    left join private.work_revisions as revision on revision.id = work.published_revision_id
    where work.public_id = ${publicId} limit 1
  `;
  const work = workRows[0];
  if (work === undefined) throw new Error('E2E_FIXTURE_WORK_NOT_FOUND');
  const revisionRows = await database<
    Array<WorkLifecycleState['revisions'][number] & { revision_id: string }>
  >`
    select revision.id as revision_id, revision.public_id as "publicId", revision.revision_number as number,
      revision.status, revision.title, revision.summary, revision.version,
      base_revision.public_id as "basePublishedRevisionId"
    from private.work_revisions as revision
    join public.works as work on work.id = revision.work_id
    left join private.work_revisions as base_revision
      on base_revision.id = revision.base_published_revision_id
    where work.public_id = ${publicId}
    order by revision.revision_number
  `;
  const revisionIds = revisionRows.map((row) => row.revision_id);
  const reviews =
    revisionIds.length === 0
      ? []
      : await database<Array<WorkLifecycleState['reviews'][number]>>`
        select revision.revision_number as "revisionNumber", review.decision,
          review.reason, review.feedback
        from private.reviews as review
        join private.work_revisions as revision on revision.id = review.revision_id
        where revision.id in ${database(revisionIds)}
        order by revision.revision_number, review.reviewed_at
      `;
  const media =
    revisionIds.length === 0
      ? []
      : await database<Array<WorkLifecycleState['media'][number]>>`
        select revision.revision_number as "revisionNumber", asset.media_kind as kind,
          revision_media.position, asset.status, asset.master_object_key is not null as "hasMaster",
          asset.quarantine_object_key = 'work-quarantine/' || asset.id::text
            and asset.master_object_key = 'work-media/' || asset.id::text || '/master.webp'
            and not exists (
              select 1 from private.work_media_variants as unsafe_variant
              where unsafe_variant.asset_id = asset.id
                and unsafe_variant.object_key <>
                  'work-media/' || asset.id::text || '/' || unsafe_variant.width::text || '.webp'
            ) as "hasSanitizedObjectKeys",
          coalesce((
            select array_agg(variant.width order by variant.width)
            from private.work_media_variants as variant
            where variant.asset_id = asset.id
          ), '{}'::integer[]) as "variantWidths"
        from private.work_revision_media as revision_media
        join private.work_revisions as revision on revision.id = revision_media.revision_id
        join private.work_media_assets as asset on asset.id = revision_media.asset_id
        where revision.id in ${database(revisionIds)}
        order by revision.revision_number, revision_media.media_kind, revision_media.position
      `;
  const attributions =
    revisionIds.length === 0
      ? []
      : await database<Array<WorkLifecycleState['attributions'][number]>>`
        select revision.revision_number as "revisionNumber", attribution.position,
          attribution.kind, attribution.attribution_name as "attributionName",
          attribution.study_year as "studyYear",
          attribution.contribution_role as "contributionRole"
        from private.work_revision_attributions as attribution
        join private.work_revisions as revision on revision.id = attribution.revision_id
        where revision.id in ${database(revisionIds)}
        order by revision.revision_number, attribution.position
      `;
  const links =
    revisionIds.length === 0
      ? []
      : await database<Array<WorkLifecycleState['links'][number]>>`
        select revision.revision_number as "revisionNumber", link.position, link.label, link.url
        from private.work_revision_links as link
        join private.work_revisions as revision on revision.id = link.revision_id
        where revision.id in ${database(revisionIds)}
        order by revision.revision_number, link.position
      `;
  const tags =
    revisionIds.length === 0
      ? []
      : await database<Array<WorkLifecycleState['tags'][number]>>`
        select revision.revision_number as "revisionNumber", tag.position,
          tag.display_label as "displayLabel", tag.normalized_identity as "normalizedIdentity"
        from private.work_revision_tags as tag
        join private.work_revisions as revision on revision.id = tag.revision_id
        where revision.id in ${database(revisionIds)}
        order by revision.revision_number, tag.position
      `;
  const videoLinks =
    revisionIds.length === 0
      ? []
      : await database<Array<WorkLifecycleState['videoLinks'][number]>>`
        select revision.revision_number as "revisionNumber", video.position, video.provider,
          video.provider_video_id as "providerVideoId", video.url
        from private.work_revision_video_links as video
        join private.work_revisions as revision on revision.id = video.revision_id
        where revision.id in ${database(revisionIds)}
        order by revision.revision_number, video.position
      `;
  const operations = await database<{ operation: string }[]>`
    select operation from private.work_revision_operations
    where work_id = (select id from public.works where public_id = ${publicId})
    order by occurred_at, idempotency_key
  `;
  const outboxEvents =
    revisionIds.length === 0
      ? []
      : await database<{ event_type: string }[]>`
        select event_type from private.outbox_events
        where aggregate_type = 'work_revision' and aggregate_id in ${database(
          revisionRows.map((row) => row.publicId),
        )}
        order by occurred_at, id
      `;
  return {
    attributions: attributions.map((item) => ({
      ...item,
      position: Number(item.position),
      revisionNumber: Number(item.revisionNumber),
      studyYear: item.studyYear === null ? null : Number(item.studyYear),
    })),
    links: links.map((item) => ({
      ...item,
      position: Number(item.position),
      revisionNumber: Number(item.revisionNumber),
    })),
    media: media.map((item) => ({
      ...item,
      position: Number(item.position),
      revisionNumber: Number(item.revisionNumber),
      variantWidths: item.variantWidths.map(Number),
    })),
    operations: operations.map((row) => row.operation),
    outboxEvents: outboxEvents.map((row) => row.event_type),
    publishedRevisionPublicId: work.published_revision_public_id,
    revisions: revisionRows.map(({ revision_id: _revisionId, ...row }) => ({
      ...row,
      number: Number(row.number),
      version: Number(row.version),
    })),
    reviews: reviews.map((review) => ({
      ...review,
      revisionNumber: Number(review.revisionNumber),
    })),
    tags: tags.map((item) => ({
      ...item,
      position: Number(item.position),
      revisionNumber: Number(item.revisionNumber),
    })),
    videoLinks: videoLinks.map((item) => ({
      ...item,
      position: Number(item.position),
      revisionNumber: Number(item.revisionNumber),
    })),
    work: {
      activityState: work.activityState,
      publicationState: work.publicationState,
      version: Number(work.version),
    },
  };
}

async function cleanupWorkResources(
  database: postgres.Sql,
  resources: WorkOwnedResources,
): Promise<void> {
  let providerFailure = false;
  for (const providerUserId of [resources.providerUserId, resources.adminProviderUserId]) {
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
  let mediaFailure = false;
  try {
    const mediaRows = await database<{ object_key: string }[]>`
      select quarantine_object_key as object_key
      from private.work_media_assets
      where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      union
      select master_object_key as object_key
      from private.work_media_assets
      where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
        and master_object_key is not null
      union
      select variant.object_key
      from private.work_media_variants as variant
      join private.work_media_assets as asset on asset.id = variant.asset_id
      where asset.work_id in (select id from public.works where submitter_person_id = ${resources.personId})
    `;
    for (const row of mediaRows) {
      try {
        const response = await fetch(
          `${environment.mediaProviderUrl}/objects/${Buffer.from(row.object_key, 'utf8').toString('base64url')}`,
          { method: 'DELETE', signal: AbortSignal.timeout(5_000) },
        );
        mediaFailure ||= !response.ok && response.status !== 404;
      } catch {
        mediaFailure = true;
      }
    }
    await database.begin(async (transaction) => {
      await transaction`set local session_replication_role = replica`;
      await transaction`
        delete from private.public_work_catalog
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`
        update public.tags set active_work_count = 0
        where normalized_identity = ${resources.tagLabel}
      `;
      await transaction`
        delete from private.outbox_events
        where aggregate_type = 'work_revision'
          and aggregate_id in (
            select revision.public_id from private.work_revisions as revision
            join public.works as work on work.id = revision.work_id
            where work.submitter_person_id = ${resources.personId}
          )
      `;
      await transaction`
        delete from private.work_draft_contributor_operations
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`
        delete from private.work_contributor_candidates
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`
        delete from private.work_revision_operations
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`
        delete from private.work_saved_draft_operations
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`
        delete from private.reviews
        where revision_id in (
          select revision.id from private.work_revisions as revision
          join public.works as work on work.id = revision.work_id
          where work.submitter_person_id = ${resources.personId}
        )
      `;
      await transaction`
        delete from private.published_revision_tags
        where revision_id in (
          select revision.id from private.work_revisions as revision
          join public.works as work on work.id = revision.work_id
          where work.submitter_person_id = ${resources.personId}
        )
      `;
      await transaction`
        delete from private.work_revision_links
        where revision_id in (
          select revision.id from private.work_revisions as revision
          join public.works as work on work.id = revision.work_id
          where work.submitter_person_id = ${resources.personId}
        )
      `;
      await transaction`
        delete from private.work_revision_tags
        where revision_id in (
          select revision.id from private.work_revisions as revision
          join public.works as work on work.id = revision.work_id
          where work.submitter_person_id = ${resources.personId}
        )
      `;
      await transaction`
        delete from private.work_revision_video_links
        where revision_id in (
          select revision.id from private.work_revisions as revision
          join public.works as work on work.id = revision.work_id
          where work.submitter_person_id = ${resources.personId}
        )
      `;
      await transaction`
        delete from private.work_revision_media
        where revision_id in (
          select revision.id from private.work_revisions as revision
          join public.works as work on work.id = revision.work_id
          where work.submitter_person_id = ${resources.personId}
        )
      `;
      await transaction`
        delete from private.work_revision_attributions
        where revision_id in (
          select revision.id from private.work_revisions as revision
          join public.works as work on work.id = revision.work_id
          where work.submitter_person_id = ${resources.personId}
        )
      `;
      await transaction`
        update public.works
        set published_revision_id = null
        where submitter_person_id = ${resources.personId}
      `;
      await transaction`
        update private.work_drafts
        set base_published_revision_id = null
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`
        delete from private.work_revisions
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
          and base_published_revision_id is not null
      `;
      await transaction`
        delete from private.work_revisions
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`
        delete from private.work_draft_media
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`
        delete from private.work_draft_links
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`
        delete from private.work_draft_tags
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`
        delete from private.work_draft_video_links
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`
        delete from private.work_draft_contributors
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`
        delete from private.work_operations
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`
        delete from private.work_media_variants
        where asset_id not in (select asset_id from private.work_revision_media)
          and asset_id not in (select asset_id from private.work_draft_media)
          and asset_id in (
            select id from private.work_media_assets where work_id in (
              select id from public.works where submitter_person_id = ${resources.personId}
            )
          )
      `;
      await transaction`
        delete from private.work_media_assets
        where work_id in (select id from public.works where submitter_person_id = ${resources.personId})
      `;
      await transaction`delete from public.works where submitter_person_id = ${resources.personId}`;
      await transaction`
        delete from public.tags
        where normalized_identity = ${resources.tagLabel}
          and not exists (
            select 1 from private.published_revision_tags as published_tag
            join private.work_revisions as revision on revision.id = published_tag.revision_id
            join public.works as work on work.id = revision.work_id
            where published_tag.tag_id = public.tags.id
              and work.submitter_person_id <> ${resources.personId}
          )
      `;
      await transaction`delete from private.authentication_sessions where account_id in (${resources.accountId}, ${resources.adminAccountId}, ${resources.contributorAccountId})`;
      await transaction`delete from private.authentication_audit_events where account_id in (${resources.accountId}, ${resources.adminAccountId}, ${resources.contributorAccountId})`;
      await transaction`delete from private.authentication_rate_limits where key_hash = ${resources.studentIdHash}`;
      await transaction`delete from private.admin_auth_identities where account_id = ${resources.adminAccountId}`;
      await transaction`delete from private.student_auth_identities where account_id in (${resources.accountId}, ${resources.contributorAccountId})`;
      await transaction`delete from public.account_roles where account_id in (${resources.accountId}, ${resources.adminAccountId}, ${resources.contributorAccountId})`;
      await transaction`delete from public.accounts where id in (${resources.accountId}, ${resources.adminAccountId}, ${resources.contributorAccountId})`;
      await transaction`delete from public.students where person_id in (${resources.personId}, ${resources.contributorPersonId})`;
      await transaction`delete from private.person_names where person_id in (${resources.personId}, ${resources.adminPersonId}, ${resources.contributorPersonId})`;
      await transaction`delete from public.people where id in (${resources.personId}, ${resources.adminPersonId}, ${resources.contributorPersonId})`;
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
  const failedBoundaries = [
    providerFailure ? 'auth_provider' : null,
    databaseFailure ? 'database' : null,
    mediaFailure ? 'media_provider' : null,
  ].filter((boundary): boundary is string => boundary !== null);
  if (failedBoundaries.length > 0) {
    throw new Error(`E2E_FIXTURE_CLEANUP_FAILED: ${failedBoundaries.join(',')}`);
  }
}

function hashAdminLogin(adminLogin: string): string {
  return createHmac('sha256', environment.authIdentitySecret)
    .update('admin-login')
    .update('\0')
    .update(adminLogin)
    .digest('hex');
}

function toSyntheticAdminIdentity(adminLogin: string): string {
  return `${hashAdminLogin(adminLogin)}@admin.auth.invalid`;
}
