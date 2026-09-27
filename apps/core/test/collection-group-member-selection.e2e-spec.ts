import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { AuthError } from '../src/modules/auth/application/auth.error';
import { InstructorAuthService } from '../src/modules/auth/application/instructor-auth.service';
import { COLLECTION_GROUPS_REPOSITORY } from '../src/modules/collection-groups/application/collection-groups.ports';

const INSTRUCTOR_ACCOUNT = '59000000-0000-4000-8000-000000000001';
const STUDENT_ACCOUNT = '59000000-0000-4000-8000-000000000002';
const OTHER_STUDENT_ACCOUNT = '59000000-0000-4000-8000-000000000003';
const ROUND_ID = '59000000-0000-4000-8000-000000000004';
const GROUP_ID = '59000000-0000-4000-8000-000000000005';
const IDEMPOTENCY_KEY = '59000000-0000-4000-8000-000000000006';
const STUDENT_ID = '65001234';
const UNKNOWN_STUDENT_ID = '65009999';
const NOW = new Date('2026-09-20T06:00:00.000Z');

/*
 * Transport boundaries for Instructor member selection.
 *
 * The real service runs behind a stubbed repository, so these assertions cover
 * what reaches the edge: who is let through, what a malformed request does, and
 * that a Student ID reaches Instructors only in bodies, never in a URL or
 * cursor (ADR 0020).
 */
describe('collection group member selection (e2e)', () => {
  let app: INestApplication<App>;
  let isInstructorAuthorized: boolean;
  let instructorSecret: string;

  const group = {
    createdAt: NOW,
    createdByAccountId: INSTRUCTOR_ACCOUNT,
    id: GROUP_ID,
    name: 'กลุ่มสหกิจ',
    roundId: ROUND_ID,
  };
  const selectableStudent = {
    accountId: STUDENT_ACCOUNT,
    entryYear: 2569,
    firstNameTh: 'สมชาย',
    lastNameTh: 'ใจดี',
    status: 'selectable' as const,
    studentId: STUDENT_ID,
  };

  const repository = {
    addMembers: jest.fn(),
    countSelectableStudents: jest.fn(),
    createGroupWithMembers: jest.fn(),
    createRoundWithGroupAndMembers: jest.fn(),
    findCurrentAcademicYear: jest.fn(),
    findGroup: jest.fn(),
    findStudentsByIdHashes: jest.fn(),
    listSelectableStudentSnapshot: jest.fn(),
    listStudents: jest.fn(),
  };

  beforeEach(async () => {
    isInstructorAuthorized = true;
    jest.clearAllMocks();
    repository.findCurrentAcademicYear.mockResolvedValue(2569);
    repository.findGroup.mockResolvedValue(group);
    repository.listStudents.mockResolvedValue([selectableStudent]);
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(InstructorAuthService)
      .useValue({
        authorizeInstructor: () => {
          if (!isInstructorAuthorized) throw new AuthError('FORBIDDEN', 403);
          return Promise.resolve({ accountId: INSTRUCTOR_ACCOUNT });
        },
      })
      .overrideProvider(COLLECTION_GROUPS_REPOSITORY)
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
        .post('/v1/internal/instructor/students/search')
        .set('Authorization', 'Bearer opaque-session')
        .send({})
        .expect(403);
      expect(repository.listStudents).not.toHaveBeenCalled();
    });

    it('refuses a request without a session', async () => {
      await request(app.getHttpServer())
        .post('/v1/internal/instructor/students/resolve')
        .set('x-instructor-bff-secret', instructorSecret)
        .send({ studentIds: [STUDENT_ID] })
        .expect(401)
        .expect({ error: { code: 'UNAUTHENTICATED' } });
      expect(repository.findStudentsByIdHashes).not.toHaveBeenCalled();
    });

    it('refuses a session that is not an active Instructor', async () => {
      isInstructorAuthorized = false;
      await instructorRequest('post', `groups/${GROUP_ID}/members`)
        .send({ memberAccountIds: [STUDENT_ACCOUNT] })
        .expect(403)
        .expect({ error: { code: 'FORBIDDEN' } });
      expect(repository.addMembers).not.toHaveBeenCalled();
    });
  });

  describe('request validation', () => {
    it.each([
      ['an acting Account in the body', { actorAccountId: OTHER_STUDENT_ACCOUNT }],
      ['a paste list of Student IDs', { studentIds: [STUDENT_ID] }],
      ['an Entry Year to add wholesale', { entryYear: 2569 }],
    ])('rejects a create request carrying %s', async (_case, extra) => {
      await instructorRequest('post', `rounds/${ROUND_ID}/groups`)
        .send({
          idempotencyKey: IDEMPOTENCY_KEY,
          memberAccountIds: [STUDENT_ACCOUNT],
          name: 'กลุ่มสหกิจ',
          ...extra,
        })
        .expect(400)
        .expect({ error: { code: 'INVALID_REQUEST' } });
      expect(repository.createGroupWithMembers).not.toHaveBeenCalled();
    });

    it.each([
      ['no members', { memberAccountIds: [] }],
      ['a repeated member', { memberAccountIds: [STUDENT_ACCOUNT, STUDENT_ACCOUNT] }],
      ['a malformed member', { memberAccountIds: ['not-an-account'] }],
      ['no idempotency key', { idempotencyKey: undefined }],
    ])('rejects a create request with %s', async (_case, override) => {
      await instructorRequest('post', 'rounds/with-group')
        .send({
          groupName: 'กลุ่มแรก',
          idempotencyKey: IDEMPOTENCY_KEY,
          memberAccountIds: [STUDENT_ACCOUNT],
          roundName: 'รอบแรก',
          ...override,
        })
        .expect(400);
      expect(repository.createRoundWithGroupAndMembers).not.toHaveBeenCalled();
    });

    it('rejects more than one resolve chunk of Student IDs or a malformed one', async () => {
      await instructorRequest('post', 'students/resolve')
        .send({ studentIds: Array.from({ length: 501 }, () => STUDENT_ID) })
        .expect(400);
      await instructorRequest('post', 'students/resolve')
        .send({ studentIds: ['6500123'] })
        .expect(400);
      expect(repository.findStudentsByIdHashes).not.toHaveBeenCalled();
    });

    it('rejects an unknown body field and a page larger than 50', async () => {
      await instructorRequest('post', 'students/search')
        .send({ studentId: STUDENT_ID })
        .expect(400);
      await instructorRequest('post', 'students/search').send({ limit: 51 }).expect(400);
      expect(repository.listStudents).not.toHaveBeenCalled();
    });

    it('offers no URL form of the student search, so a Student ID prefix never enters a URL', async () => {
      await instructorRequest('get', 'students?q=6500').expect(404);
      await instructorRequest('get', 'students/select-all?q=6500&selectedCount=0').expect(404);
      expect(repository.listStudents).not.toHaveBeenCalled();
      expect(repository.listSelectableStudentSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('Student ID handling', () => {
    it('resolves Student IDs by position, looking them up by keyed hash only', async () => {
      repository.findStudentsByIdHashes.mockImplementation(
        ({ studentIdHashes }: { studentIdHashes: string[] }) =>
          Promise.resolve(new Map([[studentIdHashes[0]!, selectableStudent]])),
      );

      const response = await instructorRequest('post', 'students/resolve')
        .send({ studentIds: [STUDENT_ID, UNKNOWN_STUDENT_ID] })
        .expect(200)
        .expect('Cache-Control', 'no-store');

      expect(response.body).toEqual({
        results: [
          { outcome: 'matched', position: 0, student: selectableStudent },
          { outcome: 'not_found', position: 1 },
        ],
      });
      expect(response.text).not.toContain(UNKNOWN_STUDENT_ID);
      const [[{ studentIdHashes }]] = repository.findStudentsByIdHashes.mock.calls as [
        [{ studentIdHashes: string[] }],
      ];
      expect(studentIdHashes).not.toContain(STUDENT_ID);
    });

    it('pages the table with an opaque cursor that carries no name or Student ID', async () => {
      repository.listStudents.mockResolvedValueOnce([
        selectableStudent,
        { ...selectableStudent, accountId: OTHER_STUDENT_ACCOUNT },
      ]);

      const response = await instructorRequest('post', 'students/search')
        .send({ entryYear: 2569, limit: 1, q: 'สม' })
        .expect(200)
        .expect('Cache-Control', 'no-store');

      const body = response.body as { nextCursor: string; students: unknown[] };
      expect(body.students).toEqual([selectableStudent]);
      expect(Buffer.from(body.nextCursor, 'base64url').toString()).toBe(STUDENT_ACCOUNT);
      expect(repository.listStudents).toHaveBeenCalledWith({
        afterAccountId: null,
        entryYear: 2569,
        groupId: null,
        limit: 1,
        search: { kind: 'name', name: 'สม' },
      });
    });

    it('searches a Student ID prefix by keyed hash and returns the Student ID', async () => {
      const response = await instructorRequest('post', 'students/search')
        .send({ q: '6500' })
        .expect(200);

      expect(response.body).toMatchObject({ students: [{ studentId: STUDENT_ID }] });
      const [[{ search }]] = repository.listStudents.mock.calls as [
        [{ search: { kind: string; prefixHash: string; prefixLength: number } }],
      ];
      expect(search).toMatchObject({ kind: 'student_id_prefix', prefixLength: 4 });
      expect(search.prefixHash).toMatch(/^[0-9a-f]{64}$/u);
    });
  });

  describe('confirmation', () => {
    const createBody = {
      idempotencyKey: IDEMPOTENCY_KEY,
      memberAccountIds: [STUDENT_ACCOUNT, OTHER_STUDENT_ACCOUNT],
      name: 'กลุ่มสหกิจ',
    };

    it('returns the same Group when a create request is repeated with its key', async () => {
      repository.createGroupWithMembers
        .mockResolvedValueOnce({ group, outcome: 'created' })
        .mockResolvedValueOnce({ group, outcome: 'replayed' });

      const first = await instructorRequest('post', `rounds/${ROUND_ID}/groups`)
        .send(createBody)
        .expect(201);
      const second = await instructorRequest('post', `rounds/${ROUND_ID}/groups`)
        .send(createBody)
        .expect(201);

      expect(second.body).toEqual(first.body);
      expect(repository.createGroupWithMembers).toHaveBeenLastCalledWith(
        expect.objectContaining({
          createdByAccountId: INSTRUCTOR_ACCOUNT,
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      );
    });

    it('refuses a key reused for a different Group', async () => {
      repository.createGroupWithMembers.mockResolvedValueOnce({ outcome: 'idempotency_conflict' });
      await instructorRequest('post', `rounds/${ROUND_ID}/groups`)
        .send(createBody)
        .expect(409)
        .expect({ error: { code: 'IDEMPOTENCY_KEY_CONFLICT' } });
    });

    it('names the Accounts that stopped being selectable before confirmation', async () => {
      repository.addMembers.mockResolvedValueOnce({
        accountIds: [OTHER_STUDENT_ACCOUNT],
        outcome: 'members_not_selectable',
      });
      await instructorRequest('post', `groups/${GROUP_ID}/members`)
        .send({ memberAccountIds: [STUDENT_ACCOUNT, OTHER_STUDENT_ACCOUNT] })
        .expect(409)
        .expect({
          error: {
            code: 'MEMBER_NOT_SELECTABLE',
            details: { accountIds: [OTHER_STUDENT_ACCOUNT] },
          },
        });
    });

    it('reports a closed Round with its own code', async () => {
      repository.addMembers.mockResolvedValueOnce({ outcome: 'round_closed' });
      await instructorRequest('post', `groups/${GROUP_ID}/members`)
        .send({ memberAccountIds: [STUDENT_ACCOUNT] })
        .expect(409)
        .expect({ error: { code: 'ROUND_CLOSED' } });
    });

    it('reports added and already-present members', async () => {
      repository.addMembers.mockResolvedValueOnce({ added: 1, alreadyMember: 1, outcome: 'added' });
      await instructorRequest('post', `groups/${GROUP_ID}/members`)
        .send({ memberAccountIds: [STUDENT_ACCOUNT, OTHER_STUDENT_ACCOUNT] })
        .expect(201)
        .expect({ added: 1, alreadyMember: 1 });
    });

    it('reports how many rows match when select all exceeds the remaining capacity', async () => {
      repository.listSelectableStudentSnapshot.mockResolvedValueOnce([
        selectableStudent,
        { ...selectableStudent, accountId: OTHER_STUDENT_ACCOUNT },
      ]);
      repository.countSelectableStudents.mockResolvedValueOnce(2_400);
      await instructorRequest('post', 'students/select-all')
        .send({ selectedCount: 1999 })
        .expect(422)
        .expect({ error: { code: 'SELECTION_LIMIT_EXCEEDED', details: { matchingCount: 2_400 } } });
    });
  });

  function instructorRequest(method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())
      [method](`/v1/internal/instructor/${path}`)
      .set('x-instructor-bff-secret', instructorSecret)
      .set('Authorization', 'Bearer opaque-session');
  }
});
