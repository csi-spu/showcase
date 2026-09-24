import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { assertLocalEnvironment } from './local-environment.mjs';

const root = new URL('../../', import.meta.url);
const manifestPath = new URL('.scratch/qa-pr113.json', root);

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
    const staff = (key, roles, state = 'set', status = 'active') => ({
      key,
      roles,
      state,
      status,
      login: `qa113-${key}-${suffix}`,
      personId: randomUUID(),
      accountId: randomUUID(),
      password: `Qa!${randomBytes(18).toString('hex')}A1`,
    });
    const student = (key, year, state = 'set', status = 'active') => ({
      ...staff(key, ['student'], state, status),
      login: `${String(year).slice(-2)}${String(randomInt(100000, 1000000))}`,
      entryYear: year,
    });
    manifest = {
      version: 1,
      fingerprint,
      accounts: [
        staff('admin', ['admin']),
        staff('instructor-a', ['instructor']),
        staff('instructor-b', ['instructor']),
        staff('dual-role', ['admin', 'instructor']),
        staff('grant-target', ['admin']),
        staff('revoke-target', ['admin', 'instructor']),
        staff('initial-instructor', ['instructor'], 'initial'),
        staff('suspended-instructor', ['instructor'], 'set', 'suspended'),
        student('current', 2569),
        student('withdrawn', 2569),
        student('individual', 2569),
        student('list', 2569),
        student('cohort', 2568),
        student('initial-student', 2568, 'initial'),
        student('suspended-student', 2569, 'set', 'suspended'),
        student('alumnus', 2550),
      ],
      rounds: [
        { id: randomUUID(), key: 'active', name: `QA113 ชุดงานทดสอบ ${suffix}`, status: 'active' },
        { id: randomUUID(), key: 'closed', name: `QA113 ชุดงานปิด ${suffix}`, status: 'closed' },
      ],
      groups: ['mixed', 'individual', 'list', 'entry-year', 'closed'].map((key) => ({
        id: randomUUID(),
        key,
        name: `QA113 ${key}`,
      })),
    };
    // Persist before database work: retries use exactly the same identities and passwords.
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
  }
  if (manifest.version !== 1 || manifest.fingerprint !== fingerprint) {
    throw new Error('QA_LOCAL_MANIFEST_TARGET_MISMATCH');
  }

  const { betterAuth } = await import('../../apps/core/node_modules/better-auth/dist/index.mjs');
  const { createLocalAccountIssuer } =
    await import('../../apps/core/node_modules/better-auth/dist/db/index.mjs');
  const { prismaAdapter } =
    await import('../../apps/core/node_modules/@better-auth/prisma-adapter/dist/index.mjs');
  const { default: prismaPackage } =
    await import('../../apps/core/generated/prisma-client/index.js');
  const prisma = new prismaPackage.PrismaClient({
    datasources: { db: { url: environment.DATABASE_URL } },
  });
  const database = postgres(environment.DATABASE_URL, {
    max: 1,
    connect_timeout: 5,
    onnotice: () => {},
  });
  try {
    const auth = betterAuth({
      appName: 'Showcase local QA',
      baseURL: environment.CORE_URL,
      secret: environment.BETTER_AUTH_SECRET,
      database: prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),
      emailAndPassword: { enabled: true, disableSignUp: true },
      advanced: { database: { generateId: 'uuid' }, useSecureCookies: false },
      logger: { disabled: true },
    });
    const context = await auth.$context;
    await database.begin(async (sql) => {
      await sql`set local statement_timeout = '15s'`;
      await sql`select pg_advisory_xact_lock(113, 113)`;
      for (const account of manifest.accounts) {
        const existing =
          await sql`select person_id from public.accounts where id = ${account.accountId}`;
        if (existing.length > 0) {
          if (existing[0].person_id !== account.personId)
            throw new Error('QA_LOCAL_ACCOUNT_COLLISION');
          continue; // Preserve password changes, suspensions and role revocations made during QA.
        }
        const isStudent = account.roles.includes('student');
        const hash = createHmac('sha256', environment.API_KEY)
          .update(isStudent ? 'student-id' : 'admin-login')
          .update('\0')
          .update(account.login)
          .digest('hex');
        const identity = `${hash}@${isStudent ? '' : 'admin.'}auth.invalid`;
        const existingProvider = await context.internalAdapter.findUserByEmail(identity, {
          includeAccounts: true,
        });
        const user =
          existingProvider?.user ??
          (await context.internalAdapter.createUser({
            email: identity,
            emailVerified: true,
            name: 'Local QA113',
          }));
        const hasCredential = existingProvider?.accounts?.some(
          (item) => item.providerId === 'credential',
        );
        if (!hasCredential) {
          await context.internalAdapter.createAccount({
            accountId: user.id,
            issuer: createLocalAccountIssuer('credential'),
            password: await context.password.hash(account.password),
            providerId: 'credential',
            userId: user.id,
          });
        }
        await sql`insert into public.people (id) values (${account.personId})`;
        await sql`insert into private.person_names (person_id, first_name_th, last_name_th)
          values (${account.personId}, 'คิวเอ', ${account.key})`;
        await sql`insert into public.accounts (id, person_id, provider_user_id, credential_state, status)
          values (${account.accountId}, ${account.personId}, ${user.id}, ${account.state}, ${account.status})`;
        for (const role of account.roles) {
          await sql`insert into public.account_roles (account_id, role) values (${account.accountId}, ${role})`;
        }
        if (isStudent) {
          await sql`insert into public.students (person_id, entry_year, access_ends_academic_year)
            values (${account.personId}, ${account.entryYear}, ${account.entryYear + 7})`;
          await sql`insert into private.student_auth_identities (account_id, student_id_hash, synthetic_identity)
            values (${account.accountId}, ${hash}, ${identity})`;
        } else {
          await sql`insert into private.admin_auth_identities (account_id, admin_login_hash, synthetic_identity)
            values (${account.accountId}, ${hash}, ${identity})`;
        }
      }
      const actor = manifest.accounts.find((account) => account.key === 'instructor-a').accountId;
      for (const round of manifest.rounds) {
        await sql`insert into public.collection_rounds (id, name, status, created_by_account_id)
          values (${round.id}, ${round.name}, ${round.status}, ${actor}) on conflict (id) do nothing`;
      }
      for (const group of manifest.groups) {
        const round = manifest.rounds.find(
          (item) => item.key === (group.key === 'closed' ? 'closed' : 'active'),
        );
        await sql`insert into public.collection_groups (id, round_id, name, created_by_account_id)
          values (${group.id}, ${round.id}, ${group.name}, ${actor}) on conflict (id) do nothing`;
      }
      const mixed = manifest.groups.find((group) => group.key === 'mixed').id;
      for (const key of ['current', 'withdrawn']) {
        const account = manifest.accounts.find((item) => item.key === key);
        const isWithdrawn = key === 'withdrawn';
        await sql`insert into public.collection_group_memberships
          (group_id, student_account_id, membership_source, added_by_account_id, status,
           withdrawn_by_account_id, withdrawn_at, withdrawal_reason)
          values (${mixed}, ${account.accountId}, 'individual', ${actor}, ${isWithdrawn ? 'withdrawn' : 'current'},
            ${isWithdrawn ? actor : null}, ${isWithdrawn ? new Date() : null}, ${isWithdrawn ? 'ถอนสมาชิกตัวอย่างสำหรับ QA' : null})
          on conflict (group_id, student_account_id) do nothing`;
      }
    });
    console.log(
      `QA113 ready: ${manifest.accounts.length} accounts, ${manifest.rounds.length} rounds, ${manifest.groups.length} groups. Credentials: .scratch/qa-pr113.json`,
    );
  } finally {
    await database.end({ timeout: 5 });
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Database/provider errors can contain private identities or connection strings.
    console.error(
      'QA113_SEED_FAILED: check local configuration, migrations and manifest; no data reset performed.',
    );
    process.exitCode = 1;
  });
}
