import { execFileSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import postgres from 'postgres';
import { assertLocalEnvironment } from './local-environment.mjs';

/*
 * Manual, standalone seed for trying the Student Collection form-answer page
 * by hand in a browser. Mirrors seed-pr113.mjs's conventions (idempotent
 * manifest, same environment guard) and reuses the data shape from
 * tools/playwright/collection-fixtures.ts, minus the Playwright-only
 * lifecycle/cleanup machinery — this script is meant to leave its data in
 * place for manual poking, not tear it down after a test run.
 */

const root = new URL('../../', import.meta.url);
const manifestPath = new URL('.scratch/qa-collection-form.json', root);

async function main() {
  const environment = assertLocalEnvironment({
    BETTER_AUTH_SECRET: 'local-development-only-better-auth-secret',
    ...parseEnv(await readFile(new URL('apps/core/.env', root), 'utf8')),
    ...process.env,
  });
  const fingerprint = createHash('sha256')
    .update(environment.DATABASE_URL)
    .update('\0')
    .update(environment.API_KEY)
    .digest('hex');
  await mkdir(new URL('.scratch/', root), { recursive: true, mode: 0o700 });

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const suffix = randomBytes(4).toString('hex');
    manifest = {
      version: 1,
      fingerprint,
      studentLogin: String(10000000 + (Number.parseInt(suffix.slice(0, 6), 16) % 89999999)).slice(
        0,
        8,
      ),
      studentPassword: `Qa!${randomBytes(18).toString('hex')}A1`,
      instructorLogin: `qa-collection-form-instructor-${suffix}`,
      instructorPassword: `Qa!${randomBytes(18).toString('hex')}A1`,
      studentPersonId: randomUUID(),
      studentAccountId: randomUUID(),
      instructorPersonId: randomUUID(),
      instructorAccountId: randomUUID(),
      roundId: randomUUID(),
      groupId: randomUUID(),
      formId: randomUUID(),
      allFieldsFormId: randomUUID(),
      suffix,
    };
    // Persist before database/provider work: a rerun reuses exactly the same identities.
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
  }
  if (manifest.version !== 1 || manifest.fingerprint !== fingerprint) {
    throw new Error('QA_LOCAL_MANIFEST_TARGET_MISMATCH');
  }
  // A manifest written before the all-field-types form existed still needs one added.
  if (manifest.allFieldsFormId === undefined) {
    manifest.allFieldsFormId = randomUUID();
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  }

  const database = postgres(environment.DATABASE_URL, {
    max: 1,
    connect_timeout: 5,
    onnotice: () => {},
  });
  try {
    /*
     * Core hashes Student IDs and admin logins with AUTH_IDENTITY_SECRET, which
     * is derived from API_KEY (see apps/core/src/config/environment.schema.ts
     * and node-auth-crypto.ts) — not BETTER_AUTH_SECRET, which only protects
     * Better Auth's own session/credential storage.
     */
    const studentIdHash = hash(environment.API_KEY, 'student-id', manifest.studentLogin);
    const instructorLoginHash = hash(environment.API_KEY, 'admin-login', manifest.instructorLogin);
    const studentIdentity = `${studentIdHash}@auth.invalid`;
    const instructorIdentity = `${instructorLoginHash}@admin.auth.invalid`;

    const studentProviderUserId = await createAuthIdentity(
      studentIdentity,
      manifest.studentPassword,
      environment,
    );
    const instructorProviderUserId = await createAuthIdentity(
      instructorIdentity,
      manifest.instructorPassword,
      environment,
    );

    const now = new Date();
    const deadlineAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await database.begin(async (transaction) => {
      const existingAccount =
        await transaction`select id from public.accounts where id = ${manifest.studentAccountId}`;
      if (existingAccount.length === 0) {
        await transaction`
          insert into public.people (id, created_at)
          values (${manifest.studentPersonId}, ${now}), (${manifest.instructorPersonId}, ${now})
        `;
        await transaction`
          insert into public.students (person_id, entry_year, access_ends_academic_year, created_at)
          values (${manifest.studentPersonId}, 2569, 2576, ${now})
        `;
        await transaction`
          insert into private.person_names (person_id, first_name_th, last_name_th, created_at, updated_at)
          values
            (${manifest.studentPersonId}, 'ทดสอบ', ${`นักศึกษาคิวเอ-${manifest.suffix}`}, ${now}, ${now}),
            (${manifest.instructorPersonId}, 'ทดสอบ', ${`ผู้สอนคิวเอ-${manifest.suffix}`}, ${now}, ${now})
        `;
        await transaction`
          insert into public.accounts
            (id, person_id, provider_user_id, credential_state, created_at, updated_at)
          values
            (${manifest.studentAccountId}, ${manifest.studentPersonId}, ${studentProviderUserId}, 'set', ${now}, ${now}),
            (${manifest.instructorAccountId}, ${manifest.instructorPersonId}, ${instructorProviderUserId}, 'set', ${now}, ${now})
        `;
        await transaction`
          insert into public.account_roles (account_id, role, created_at)
          values (${manifest.studentAccountId}, 'student', ${now}), (${manifest.instructorAccountId}, 'instructor', ${now})
        `;
        await transaction`
          insert into private.student_auth_identities
            (account_id, student_id_hash, synthetic_identity, created_at)
          values (${manifest.studentAccountId}, ${studentIdHash}, ${studentIdentity}, ${now})
        `;
        await transaction`
          insert into private.admin_auth_identities
            (account_id, admin_login_hash, synthetic_identity, created_at)
          values (${manifest.instructorAccountId}, ${instructorLoginHash}, ${instructorIdentity}, ${now})
        `;
        await transaction`
          insert into public.collection_rounds
            (id, name, status, created_by_account_id, created_at)
          values (${manifest.roundId}, ${`ชุดงานทดสอบ ${manifest.suffix}`}, 'active', ${manifest.instructorAccountId}, ${now})
        `;
        await transaction`
          insert into public.collection_groups
            (id, round_id, name, created_by_account_id, created_at)
          values (${manifest.groupId}, ${manifest.roundId}, ${`กลุ่มทดสอบ ${manifest.suffix}`}, ${manifest.instructorAccountId}, ${now})
        `;
        await transaction`
          insert into public.collection_group_memberships
            (group_id, student_account_id, status, membership_source, added_by_account_id, added_at)
          values (${manifest.groupId}, ${manifest.studentAccountId}, 'current', 'individual', ${manifest.instructorAccountId}, ${now})
        `;
      }

      const existingForm =
        await transaction`select id from public.collection_forms where id = ${manifest.formId}`;
      if (existingForm.length === 0) {
        await transaction`
          insert into public.collection_forms
            (id, group_id, title, description, status, fields, created_by_account_id,
             created_at, opened_at, deadline_at, version)
          values (
            ${manifest.formId}, ${manifest.groupId}, ${`แบบฟอร์มทดสอบ ${manifest.suffix}`},
            'ใช้สำหรับทดลองกรอกแบบฟอร์มด้วยตนเอง', 'open',
            ${transaction.json([
              {
                description: 'กรอกชื่อสถานที่ฝึกงานของคุณ',
                id: 'placement-name',
                label: 'สถานที่ฝึกงาน',
                required: true,
                type: 'short_text',
              },
            ])},
            ${manifest.instructorAccountId}, ${now}, ${now}, ${deadlineAt}, 1
          )
        `;
        await transaction`
          insert into public.collection_obligations
            (form_id, student_account_id, status, assigned_at)
          values (${manifest.formId}, ${manifest.studentAccountId}, 'not_submitted', ${now})
        `;
      }

      const existingAllFieldsForm =
        await transaction`select id from public.collection_forms where id = ${manifest.allFieldsFormId}`;
      if (existingAllFieldsForm.length === 0) {
        await transaction`
          insert into public.collection_forms
            (id, group_id, title, description, status, fields, created_by_account_id,
             created_at, opened_at, deadline_at, version)
          values (
            ${manifest.allFieldsFormId}, ${manifest.groupId}, ${`แบบฟอร์มทุกประเภทฟิลด์ ${manifest.suffix}`},
            'รวมฟิลด์ทุกประเภทไว้ในฟอร์มเดียว สำหรับทดลองกรอกและอัปโหลดไฟล์', 'open',
            ${transaction.json([
              {
                description: 'ทดสอบฟิลด์ข้อความบรรทัดเดียว',
                id: 'short-text',
                label: 'ข้อความสั้น',
                required: true,
                type: 'short_text',
              },
              {
                description: 'ทดสอบฟิลด์ข้อความหลายบรรทัด',
                id: 'long-text',
                label: 'ข้อความยาว',
                required: false,
                type: 'long_text',
              },
              {
                description: 'ทดสอบฟิลด์ตัวเลข',
                id: 'number-field',
                label: 'ตัวเลข',
                required: false,
                type: 'number',
              },
              {
                description: 'ทดสอบฟิลด์วันที่',
                id: 'date-field',
                label: 'วันที่',
                required: false,
                type: 'date',
              },
              {
                description: 'ทดสอบฟิลด์ตัวเลือกเดียว',
                id: 'single-choice',
                label: 'เลือกหนึ่งข้อ',
                options: ['ตัวเลือก ก', 'ตัวเลือก ข', 'ตัวเลือก ค'],
                required: false,
                type: 'single_choice',
              },
              {
                description: 'ทดสอบฟิลด์เลือกได้หลายข้อ',
                id: 'multiple-choice',
                label: 'เลือกได้หลายข้อ',
                options: ['ตัวเลือก 1', 'ตัวเลือก 2', 'ตัวเลือก 3'],
                required: false,
                type: 'multiple_choice',
              },
              {
                description: 'ทดสอบอัปโหลดไฟล์ (PDF, DOCX, XLSX, JPEG, PNG)',
                file: {
                  allowedFileTypes: ['pdf', 'docx', 'xlsx', 'jpeg', 'png'],
                  maxFiles: 3,
                },
                id: 'file-upload',
                label: 'แนบไฟล์',
                required: false,
                type: 'file_upload',
              },
            ])},
            ${manifest.instructorAccountId}, ${now}, ${now}, ${deadlineAt}, 1
          )
        `;
        await transaction`
          insert into public.collection_obligations
            (form_id, student_account_id, status, assigned_at)
          values (${manifest.allFieldsFormId}, ${manifest.studentAccountId}, 'not_submitted', ${now})
        `;
      }
    });

    console.log('QA collection form ready.');
    console.log(`  Simple form URL:            http://localhost:3004/forms/${manifest.formId}`);
    console.log(
      `  All-field-types form URL:   http://localhost:3004/forms/${manifest.allFieldsFormId}`,
    );
    console.log('  Credentials and IDs:        .scratch/qa-collection-form.json (mode 0600)');
  } finally {
    await database.end({ timeout: 5 });
  }
}

function hash(secret, kind, value) {
  return createHmac('sha256', secret).update(kind).update('\0').update(value).digest('hex');
}

async function createAuthIdentity(identity, password, environment) {
  const result = execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('../playwright/better-auth-fixture.mjs', import.meta.url)),
      'create',
      identity,
      password,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: environment.DATABASE_URL,
        BETTER_AUTH_SECRET: environment.BETTER_AUTH_SECRET,
        BETTER_AUTH_BASE_URL: environment.CORE_URL,
      },
    },
  ).trim();
  if (result.length === 0) throw new Error('QA_COLLECTION_FORM_AUTH_CREATE_FAILED');
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('QA_COLLECTION_FORM_SEED_FAILED: check local configuration and migrations.');
    console.error(error);
    process.exitCode = 1;
  });
}
