import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AuthError } from '../src/modules/auth/application/auth.error';
import { InstructorAuthService } from '../src/modules/auth/application/instructor-auth.service';
import { COLLECTION_DELETIONS_REPOSITORY } from '../src/modules/collection-deletions/application/collection-deletions.ports';

const INSTRUCTOR_ACCOUNT = '5a000000-0000-4000-8000-000000000001';
const ROUND_ID = '5a000000-0000-4000-8000-000000000002';
const GROUP_ID = '5a000000-0000-4000-8000-000000000003';
const FORM_ID = '5a000000-0000-4000-8000-000000000004';
const DELETION_ID = '5a000000-0000-4000-8000-000000000005';
const DELETED_AT = new Date('2026-09-29T06:00:00.000Z');

/*
 * Transport boundaries for Collection Deletion.
 *
 * The real service runs behind a stubbed repository, so these assertions cover
 * what reaches the edge: who is let through, which target a route addresses,
 * what a malformed request does, and how each outcome is reported.
 */
describe('collection deletions (e2e)', () => {
  let app: INestApplication<App>;
  let isInstructorAuthorized: boolean;
  let instructorSecret: string;

  const counts = {
    assignedStudentCount: 12,
    formCount: 3,
    groupCount: 1,
    submittedStudentCount: 4,
  };
  const repository = {
    deleteItem: jest.fn(),
    listDeletions: jest.fn(),
    previewDeletion: jest.fn(),
    restoreDeletion: jest.fn(),
  };

  beforeEach(async () => {
    isInstructorAuthorized = true;
    jest.clearAllMocks();
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(InstructorAuthService)
      .useValue({
        authorizeInstructor: () => {
          if (!isInstructorAuthorized) throw new AuthError('FORBIDDEN', 403);
          return Promise.resolve({ accountId: INSTRUCTOR_ACCOUNT });
        },
      })
      .overrideProvider(COLLECTION_DELETIONS_REPOSITORY)
      .useValue(repository)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
    instructorSecret = app.get(ConfigService).getOrThrow<string>('INSTRUCTOR_BFF_SECRET');
  });

  afterEach(async () => app.close());

  describe('access', () => {
    it('refuses a request without the Instructor BFF secret', async () => {
      await request(app.getHttpServer())
        .post(`/v1/internal/instructor/collection/groups/${GROUP_ID}/delete`)
        .set('Authorization', 'Bearer opaque-session')
        .send({ confirmationName: 'กลุ่มสหกิจ' })
        .expect(403);
      expect(repository.deleteItem).not.toHaveBeenCalled();
    });

    it('refuses a request without a session', async () => {
      await request(app.getHttpServer())
        .get('/v1/internal/instructor/collection/deletions')
        .set('x-instructor-bff-secret', instructorSecret)
        .expect(401)
        .expect({ error: { code: 'UNAUTHENTICATED' } });
      expect(repository.listDeletions).not.toHaveBeenCalled();
    });

    it('refuses a session that is not an active Instructor', async () => {
      isInstructorAuthorized = false;
      await instructorRequest('post', `deletions/${DELETION_ID}/restore`)
        .send({ reason: 'ลบผิดกลุ่ม' })
        .expect(403)
        .expect({ error: { code: 'FORBIDDEN' } });
      expect(repository.restoreDeletion).not.toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    it.each([
      ['rounds', ROUND_ID, 'round'],
      ['groups', GROUP_ID, 'group'],
      ['forms', FORM_ID, 'form'],
    ] as const)('previews the %s target it addresses', async (segment, id, kind) => {
      repository.previewDeletion.mockResolvedValue({
        blockedReason: null,
        counts,
        group: null,
        kind,
        name: 'ชื่อ',
        round: null,
      });
      await instructorRequest('get', `${segment}/${id}/deletion-preview`)
        .expect(200)
        .expect('Cache-Control', 'no-store')
        .expect({ blockedReason: null, counts, group: null, kind, name: 'ชื่อ', round: null });
      expect(repository.previewDeletion).toHaveBeenCalledWith({ id, kind });
    });

    it.each([
      ['rounds', 'ROUND_NOT_FOUND'],
      ['groups', 'GROUP_NOT_FOUND'],
      ['forms', 'FORM_NOT_FOUND'],
    ])('reports a missing or deleted %s as not found', async (segment, code) => {
      repository.previewDeletion.mockResolvedValue(null);
      await instructorRequest('get', `${segment}/${ROUND_ID}/deletion-preview`)
        .expect(404)
        .expect({ error: { code } });
    });

    it('rejects a malformed target id', async () => {
      await instructorRequest('get', 'groups/not-a-uuid/deletion-preview')
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      expect(repository.previewDeletion).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes the addressed target as the session Instructor', async () => {
      repository.deleteItem.mockResolvedValue({ deletionId: DELETION_ID, outcome: 'deleted' });
      await instructorRequest('post', `forms/${FORM_ID}/delete`)
        .send({ confirmationName: 'แบบฟอร์มรายงาน' })
        .expect(200)
        .expect({ deletionId: DELETION_ID });
      expect(repository.deleteItem).toHaveBeenCalledWith({
        actorAccountId: INSTRUCTOR_ACCOUNT,
        confirmationName: 'แบบฟอร์มรายงาน',
        now: expect.any(Date) as Date,
        target: { id: FORM_ID, kind: 'form' },
      });
    });

    it.each([
      ['no confirmation name', {}],
      ['an empty confirmation name', { confirmationName: '' }],
      ['an over-long confirmation name', { confirmationName: 'ก'.repeat(201) }],
      [
        'an acting Account in the body',
        { actorAccountId: INSTRUCTOR_ACCOUNT, confirmationName: 'ก' },
      ],
    ])('rejects a request with %s', async (_case, body) => {
      await instructorRequest('post', `rounds/${ROUND_ID}/delete`)
        .send(body)
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      expect(repository.deleteItem).not.toHaveBeenCalled();
    });

    it.each([
      [{ outcome: 'confirmation_mismatch' }, 409, 'COLLECTION_DELETION_CONFIRMATION_MISMATCH'],
      [{ outcome: 'not_found' }, 404, 'GROUP_NOT_FOUND'],
      [{ outcome: 'round_closed' }, 409, 'ROUND_CLOSED'],
    ])('reports %j as %i', async (result, status, code) => {
      repository.deleteItem.mockResolvedValue(result);
      await instructorRequest('post', `groups/${GROUP_ID}/delete`)
        .send({ confirmationName: 'กลุ่มสหกิจ' })
        .expect(status)
        .expect({ error: { code } });
    });
  });

  describe('deletion log', () => {
    it('lists a page and hands back an opaque cursor for the next one', async () => {
      repository.listDeletions.mockResolvedValue({
        entries: Array.from({ length: 20 }, (_, index) => ({
          counts,
          deletedAt: DELETED_AT,
          deletedAtMicros: String(DELETED_AT.getTime() * 1000 - index),
          deletedByName: 'อาจารย์ใจดี',
          groupName: null,
          id: DELETION_ID,
          kind: 'group',
          name: 'กลุ่มสหกิจ',
          restore: null,
          restoreAvailability: { status: 'available' },
          roundName: 'สหกิจ 2569',
        })),
        hasMore: true,
      });
      const response = await instructorRequest('get', 'deletions').expect(200);
      const body = response.body as { entries: Record<string, unknown>[]; nextCursor: string };
      expect(body.entries).toHaveLength(20);
      expect(body.entries[0]).not.toHaveProperty('deletedAtMicros');
      expect(body.entries[0]).toMatchObject({ deletedAt: DELETED_AT.toISOString(), kind: 'group' });
      expect(body.nextCursor).toEqual(expect.any(String));

      repository.listDeletions.mockResolvedValue({ entries: [], hasMore: false });
      await instructorRequest('get', `deletions?cursor=${encodeURIComponent(body.nextCursor)}`)
        .expect(200)
        .expect({ entries: [], nextCursor: null });
      expect(repository.listDeletions).toHaveBeenLastCalledWith({
        before: {
          deletedAtMicros: String(DELETED_AT.getTime() * 1000 - 19),
          deletionId: DELETION_ID,
        },
        limit: 20,
      });
    });

    it('rejects a cursor Core did not issue', async () => {
      await instructorRequest('get', 'deletions?cursor=forged')
        .expect(400)
        .expect({ error: { code: 'COLLECTION_DELETION_CURSOR_INVALID' } });
      expect(repository.listDeletions).not.toHaveBeenCalled();
    });

    it('rejects an unknown query parameter', async () => {
      await instructorRequest('get', 'deletions?kind=group')
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
    });
  });

  describe('restore', () => {
    it('restores the deletion with the trimmed reason', async () => {
      repository.restoreDeletion.mockResolvedValue({ outcome: 'restored' });
      await instructorRequest('post', `deletions/${DELETION_ID}/restore`)
        .send({ reason: '  ลบผิดกลุ่ม  ' })
        .expect(200)
        .expect({ deletionId: DELETION_ID });
      expect(repository.restoreDeletion).toHaveBeenCalledWith({
        actorAccountId: INSTRUCTOR_ACCOUNT,
        deletionId: DELETION_ID,
        now: expect.any(Date) as Date,
        reason: 'ลบผิดกลุ่ม',
      });
    });

    it.each([
      ['no reason', {}],
      ['a blank reason', { reason: '   ' }],
      ['an over-long reason', { reason: 'ก'.repeat(2_001) }],
    ])('rejects a request with %s', async (_case, body) => {
      await instructorRequest('post', `deletions/${DELETION_ID}/restore`)
        .send(body)
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      expect(repository.restoreDeletion).not.toHaveBeenCalled();
    });

    it.each([
      [{ outcome: 'not_found' }, 404, { code: 'COLLECTION_DELETION_NOT_FOUND' }],
      [
        { availability: { status: 'already_restored' }, outcome: 'unavailable' },
        409,
        { code: 'COLLECTION_DELETION_ALREADY_RESTORED' },
      ],
      [
        { availability: { status: 'round_closed' }, outcome: 'unavailable' },
        409,
        { code: 'ROUND_CLOSED' },
      ],
      [
        {
          availability: {
            ancestorKind: 'round',
            ancestorName: 'สหกิจ 2569',
            status: 'ancestor_deleted',
          },
          outcome: 'unavailable',
        },
        409,
        {
          code: 'COLLECTION_DELETION_ANCESTOR_DELETED',
          details: { ancestorKind: 'round', ancestorName: 'สหกิจ 2569' },
        },
      ],
    ])('reports %j as %i', async (result, status, error) => {
      repository.restoreDeletion.mockResolvedValue(result);
      await instructorRequest('post', `deletions/${DELETION_ID}/restore`)
        .send({ reason: 'ลบผิดกลุ่ม' })
        .expect(status)
        .expect({ error });
    });
  });

  it('reports an unexpected repository failure as unavailable', async () => {
    repository.previewDeletion.mockRejectedValue(new Error('connection reset'));
    await instructorRequest('get', `rounds/${ROUND_ID}/deletion-preview`)
      .expect(503)
      .expect({ error: { code: 'COLLECTION_DELETIONS_SERVICE_UNAVAILABLE' } });
  });

  function instructorRequest(method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())
      [method](`/v1/internal/instructor/collection/${path}`)
      .set('x-instructor-bff-secret', instructorSecret)
      .set('Authorization', 'Bearer opaque-session');
  }
});
