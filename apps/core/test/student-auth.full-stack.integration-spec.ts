import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { NodeIdentityProtector } from '../src/modules/auth/infrastructure/node-auth-crypto';
import { BetterAuthEngine } from '../src/modules/auth/infrastructure/better-auth.adapter';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { ConfigService } from '@nestjs/config';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const IDENTITY_SECRET = process.env.API_KEY ?? 'local-development-only-shared-api-key';
const STUDENT_BFF_SECRET = process.env.API_KEY ?? 'local-development-only-shared-api-key';
const hasBetterAuthIntegration = process.env.BETTER_AUTH_INTEGRATION === 'true';

(hasBetterAuthIntegration ? describe : describe.skip)(
  'Student authentication full-stack smoke',
  () => {
    const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
    const sql = database.sql;
    const engine = new BetterAuthEngine(database.prisma, {
      baseUrl: process.env.BETTER_AUTH_BASE_URL ?? 'http://127.0.0.1:4100',
      secret: process.env.BETTER_AUTH_SECRET ?? 'local-development-only-better-auth-secret',
    });
    const identityProtector = new NodeIdentityProtector(IDENTITY_SECRET);
    const studentId = '69999998';
    const personId = randomUUID();
    const accountId = randomUUID();
    let providerUserId: string | null = null;
    let app: INestApplication<App>;

    beforeAll(async () => {
      providerUserId = (
        await engine.provision({
          syntheticIdentity: identityProtector.toSyntheticIdentity(studentId),
          password: studentId,
        })
      ).providerUserId;

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
          ${identityProtector.hashSourceAddress('192.0.2.10')}
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
      if (providerUserId !== null) await engine.deleteIdentity(providerUserId);
      await database.onApplicationShutdown();
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
        .post('/v1/internal/student/auth/login')
        .set('x-client-address', '192.0.2.10')
        .set('x-student-bff-secret', STUDENT_BFF_SECRET)
        .send({ password: studentId, studentId })
        .expect(200);
      const loginBody = login.body as { sessionState: string; sessionToken: string };
      expect(loginBody.sessionState).toBe('password_change_required');
      expect(JSON.stringify(login.body)).not.toContain(studentId);

      const changed = await agent
        .post('/v1/internal/student/auth/change-password')
        .set('Authorization', `Bearer ${loginBody.sessionToken}`)
        .set('x-student-bff-secret', STUDENT_BFF_SECRET)
        .send({ currentPassword: studentId, newPassword: 'full stack changed password' })
        .expect(200);
      const changedBody = changed.body as { sessionState: string; sessionToken: string };
      expect(changedBody.sessionState).toBe('active');

      await request(app.getHttpServer())
        .get('/v1/internal/student/auth/session')
        .set('Authorization', `Bearer ${loginBody.sessionToken}`)
        .set('x-student-bff-secret', STUDENT_BFF_SECRET)
        .expect(401)
        .expect({ error: { code: 'SESSION_EXPIRED' } });

      await agent
        .post('/v1/internal/student/auth/logout')
        .set('Authorization', `Bearer ${changedBody.sessionToken}`)
        .set('x-student-bff-secret', STUDENT_BFF_SECRET)
        .expect(204);
    });
  },
);
