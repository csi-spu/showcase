import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AdminAuthService } from '../src/modules/auth/application/admin-auth.service';
import { StudentAuthService } from '../src/modules/auth/application/student-auth.service';
import { NotificationsService } from '../src/modules/notifications/application/notifications.service';

const ADMIN_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const NOTIFICATION_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_TOKEN = 'active-session';

describe('Notifications API (e2e)', () => {
  let app: INestApplication<App>;
  const notifications = {
    countUnread: jest.fn().mockResolvedValue({ count: 2 }),
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    maintain: jest.fn(),
    markAllRead: jest.fn().mockResolvedValue({
      cutoff: '2026-08-26T05:00:00.000Z',
      updatedCount: 2,
    }),
    markRead: jest.fn().mockResolvedValue({
      createdAt: '2026-08-26T04:00:00.000Z',
      parameters: {},
      publicId: NOTIFICATION_ID,
      readAt: '2026-08-26T05:00:00.000Z',
      target: { kind: 'student_access' },
      targetAvailable: true,
      targetDestination: 'student_home',
      type: 'student_access_extended',
    }),
    processNext: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AdminAuthService)
      .useValue({ authorizeAdmin: jest.fn().mockResolvedValue({ accountId: ADMIN_ACCOUNT_ID }) })
      .overrideProvider(StudentAuthService)
      .useValue({
        authorizeStudentRead: jest.fn().mockResolvedValue({ accountId: STUDENT_ACCOUNT_ID }),
      })
      .overrideProvider(NotificationsService)
      .useValue(notifications)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => app.close());

  it('keeps Admin and Student inbox reads audience-bound and private', async () => {
    await authorized('admin', request(app.getHttpServer()).get('/v1/internal/admin/notifications'))
      .query({ limit: 50, view: 'unread' })
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    await authorized(
      'student',
      request(app.getHttpServer()).get('/v1/internal/student/notifications/unread-count'),
    )
      .expect(200)
      .expect('Cache-Control', 'private, no-store')
      .expect({ count: 2 });

    expect(notifications.list).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ADMIN_ACCOUNT_ID,
        audience: 'admin',
        limit: 50,
        view: 'unread',
      }),
    );
    expect(notifications.countUnread).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: STUDENT_ACCOUNT_ID, audience: 'student' }),
    );
  });

  it('marks one or all Notifications through server-owned actor identity', async () => {
    await authorized(
      'student',
      request(app.getHttpServer()).post(
        `/v1/internal/student/notifications/${NOTIFICATION_ID}/read`,
      ),
    ).expect(200);
    await authorized(
      'student',
      request(app.getHttpServer()).post('/v1/internal/student/notifications/read-all'),
    )
      .expect(200)
      .expect({ cutoff: '2026-08-26T05:00:00.000Z', updatedCount: 2 });

    expect(notifications.markRead).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: STUDENT_ACCOUNT_ID,
        audience: 'student',
        notificationPublicId: NOTIFICATION_ID,
      }),
    );
    expect(notifications.markAllRead).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: STUDENT_ACCOUNT_ID, audience: 'student' }),
    );
  });

  it('rejects missing surface credentials and invalid bounded queries', async () => {
    await request(app.getHttpServer())
      .get('/v1/internal/student/notifications')
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .expect(403);
    await authorized(
      'student',
      request(app.getHttpServer()).get('/v1/internal/student/notifications'),
    )
      .query({ limit: 51, unexpected: 'value' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
    expect(notifications.list).not.toHaveBeenCalled();
  });

  function authorized(audience: 'admin' | 'student', test: request.Test): request.Test {
    return test
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set(`x-${audience}-bff-secret`, `local-development-only-${audience}-bff-secret`);
  }
});
