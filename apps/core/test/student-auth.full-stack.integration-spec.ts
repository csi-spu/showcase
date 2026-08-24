import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { NodeIdentityProtector } from '../src/modules/auth/infrastructure/node-auth-crypto';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const IDENTITY_SECRET =
  process.env.AUTH_IDENTITY_SECRET ?? 'local-development-only-identity-secret';
const hasLocalCredentials = PUBLISHABLE_KEY !== undefined && SECRET_KEY !== undefined;

(hasLocalCredentials ? describe : describe.skip)('Student authentication full-stack smoke', () => {
  const sql = postgres(DATABASE_URL, { max: 2 });
  const identityProtector = new NodeIdentityProtector(IDENTITY_SECRET);
  const studentId = '69999998';
  const personId = randomUUID();
  const accountId = randomUUID();
  let providerUserId: string | null = null;
  let app: INestApplication<App>;

  beforeAll(async () => {
    const providerResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      body: JSON.stringify({
        email: identityProtector.toSyntheticIdentity(studentId),
        email_confirm: true,
        password: studentId,
      }),
      headers: {
        apikey: requireSecretKey(),
        authorization: `Bearer ${requireSecretKey()}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    if (!providerResponse.ok) {
      throw new Error(`FULL_STACK_PROVIDER_PROVISION_FAILED_${providerResponse.status}`);
    }
    const providerBody = (await providerResponse.json()) as { id?: unknown };
    if (typeof providerBody.id !== 'string') {
      throw new Error('FULL_STACK_PROVIDER_ID_MISSING');
    }
    providerUserId = providerBody.id;

    await sql.begin(async (transaction) => {
      await transaction`insert into public.people (id) values (${personId})`;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${personId}, 2569, 2576)
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id)
        values (${accountId}, ${personId}, ${providerUserId})
      `;
      await transaction`
        insert into public.account_roles (account_id, role) values (${accountId}, 'student')
      `;
      await transaction`
        insert into private.student_auth_identities (
          account_id,
          student_id_hash,
          synthetic_identity
        ) values (
          ${accountId},
          ${identityProtector.hashStudentId(studentId)},
          ${identityProtector.toSyntheticIdentity(studentId)}
        )
      `;
    });

    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
    await sql.begin(async (transaction) => {
      await transaction`
        delete from private.authentication_audit_events where account_id = ${accountId}
      `;
      await transaction`
        delete from private.authentication_sessions where account_id = ${accountId}
      `;
      await transaction`
        delete from private.authentication_rate_limits
        where key_hash in (
          ${identityProtector.hashStudentId(studentId)},
          ${identityProtector.hashSourceAddress('127.0.0.1')},
          ${identityProtector.hashSourceAddress('::ffff:127.0.0.1')}
        )
      `;
      await transaction`
        delete from private.student_auth_identities where account_id = ${accountId}
      `;
      await transaction`delete from public.account_roles where account_id = ${accountId}`;
      await transaction`delete from public.accounts where id = ${accountId}`;
      await transaction`delete from public.students where person_id = ${personId}`;
      await transaction`delete from public.people where id = ${personId}`;
    });
    if (providerUserId !== null) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${providerUserId}`, {
        headers: {
          apikey: requireSecretKey(),
          authorization: `Bearer ${requireSecretKey()}`,
        },
        method: 'DELETE',
      });
    }
    await sql.end({ timeout: 5 });
  });

  it('runs login, forced change, session rotation, and logout against local providers', async () => {
    await sql`update public.academic_settings set current_academic_year = null where singleton = true`;
    try {
      await request(app.getHttpServer()).get('/v1/health/ready').expect(503);
    } finally {
      await sql`
        update public.academic_settings
        set current_academic_year = 2569
        where singleton = true
      `;
    }
    await request(app.getHttpServer()).get('/v1/health/ready').expect(200);
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/v1/student/auth/login')
      .set('Origin', 'http://localhost:3002')
      .send({ password: studentId, studentId })
      .expect(200);
    const loginBody = login.body as { csrfToken: string; sessionState: string };
    expect(loginBody.sessionState).toBe('password_change_required');
    expect(JSON.stringify(login.body)).not.toContain(studentId);
    const oldCookie = login.headers['set-cookie']?.[0]?.split(';')[0];
    expect(oldCookie).toBeDefined();

    const changed = await agent
      .post('/v1/student/auth/change-password')
      .set('Origin', 'http://localhost:3002')
      .set('x-csrf-token', loginBody.csrfToken)
      .send({ currentPassword: studentId, newPassword: 'full stack changed password' })
      .expect(200);
    const changedBody = changed.body as { csrfToken: string; sessionState: string };
    expect(changedBody.sessionState).toBe('active');

    await request(app.getHttpServer())
      .get('/v1/student/auth/session')
      .set('Cookie', oldCookie ?? '')
      .expect(401)
      .expect({ error: { code: 'SESSION_EXPIRED' } });

    await agent
      .post('/v1/student/auth/logout')
      .set('Origin', 'http://localhost:3002')
      .set('x-csrf-token', changedBody.csrfToken)
      .expect(204);
  });

  function requireSecretKey(): string {
    if (SECRET_KEY === undefined) {
      throw new Error('SUPABASE_SECRET_KEY_REQUIRED');
    }
    return SECRET_KEY;
  }
});
