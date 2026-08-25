import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { StudentAuthService } from '../src/modules/auth/application/student-auth.service';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';

const ACCOUNT_ID = '68000000-0000-4000-8000-000000000001';
const PERSON_ID = '68000000-0000-4000-8000-000000000002';
const PROVIDER_USER_ID = '68000000-0000-4000-8000-000000000003';
const BFF_SECRET = 'local-development-only-student-bff-secret';
const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

jest.setTimeout(20_000);

describe('Attribution invitation inbox HTTP integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL: LOCAL_DATABASE_URL }));
  let app: INestApplication<App>;

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`insert into public.people (id) values (${PERSON_ID})`;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state)
        values (${ACCOUNT_ID}, ${PERSON_ID}, ${PROVIDER_USER_ID}, 'set')
      `;
    });

    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseClient)
      .useValue(database)
      .overrideProvider(StudentAuthService)
      .useValue({
        authorizeProfileAccess: () =>
          Promise.resolve({ accountId: ACCOUNT_ID, canEditProfile: false }),
      })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await cleanup();
    if (app !== undefined) await app.close();
  });

  it('returns an empty bounded inbox through the real HTTP and database path', async () => {
    await request(app.getHttpServer())
      .get('/v1/internal/student/contributor-invitations')
      .set('Authorization', 'Bearer local-integration-session')
      .set('x-student-bff-secret', BFF_SECRET)
      .expect(200)
      .expect({ items: [], nextCursor: null });
  });

  async function cleanup() {
    await database.sql.begin(async (transaction) => {
      await transaction`
        delete from private.attribution_invitations where invitee_person_id = ${PERSON_ID}
      `;
      await transaction`delete from public.accounts where id = ${ACCOUNT_ID}`;
      await transaction`delete from public.people where id = ${PERSON_ID}`;
    });
  }
});
