import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { StudentAuthService } from '../src/modules/auth/application/student-auth.service';
import {
  PROFILES_CLOCK,
  PROFILES_REPOSITORY,
  type PrivateProfileState,
  type ProfilesRepository,
  type PublicProfileView,
} from '../src/modules/profiles/application/profiles.ports';

const STUDENT_BFF_SECRET = 'local-development-only-student-bff-secret';
const ACCOUNT_ID = '51000000-0000-4000-8000-000000000001';
const PUBLIC_ID = '51000000-0000-4000-8000-000000000002';
const IDEMPOTENCY_KEY = '51000000-0000-4000-8000-000000000003';

class E2eProfilesRepository implements ProfilesRepository {
  profile: PrivateProfileState | null = null;
  publicProfile: PublicProfileView | null = null;

  findPrivateProfile(): Promise<PrivateProfileState | null> {
    return Promise.resolve(this.profile);
  }

  findPublicProfile(): Promise<PublicProfileView | null> {
    return Promise.resolve(this.publicProfile);
  }

  updateProfile(): Promise<{ outcome: 'updated' }> {
    return Promise.resolve({ outcome: 'updated' });
  }

  grantConsent(): Promise<{ outcome: 'updated' }> {
    return Promise.resolve({ outcome: 'updated' });
  }

  withdrawConsent(): Promise<{ outcome: 'updated' }> {
    return Promise.resolve({ outcome: 'updated' });
  }
}

describe('Public Profile and Profile Consent (e2e)', () => {
  let app: INestApplication<App>;
  let repository: E2eProfilesRepository;
  let canEditProfile: boolean;

  beforeEach(async () => {
    repository = new E2eProfilesRepository();
    canEditProfile = true;
    const auth = {
      authorizeProfileAccess: () => Promise.resolve({ accountId: ACCOUNT_ID, canEditProfile }),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PROFILES_REPOSITORY)
      .useValue(repository)
      .overrideProvider(PROFILES_CLOCK)
      .useValue({ now: () => new Date('2026-08-25T08:00:00.000Z') })
      .overrideProvider(StudentAuthService)
      .useValue(auth)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('authenticates internal profile reads through Student BFF and opaque session', async () => {
    await request(app.getHttpServer())
      .get('/v1/internal/student/profile')
      .set('Authorization', 'Bearer opaque-session')
      .expect(403)
      .expect({ error: { code: 'FORBIDDEN' } });

    await request(app.getHttpServer())
      .get('/v1/internal/student/profile')
      .set('Authorization', 'Bearer opaque-session')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .expect(200)
      .expect({ canEditProfile: true, person: null, profile: null });
  });

  it('rejects unknown fields and denies content editing to an Alumnus', async () => {
    const validBody = {
      bio: null,
      expectedVersion: 0,
      idempotencyKey: IDEMPOTENCY_KEY,
      links: [],
      photoId: null,
    };
    await request(app.getHttpServer())
      .put('/v1/internal/student/profile')
      .set('Authorization', 'Bearer opaque-session')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .send({ ...validBody, studentId: '69000001' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });

    canEditProfile = false;
    await request(app.getHttpServer())
      .put('/v1/internal/student/profile')
      .set('Authorization', 'Bearer opaque-session')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .send(validBody)
      .expect(403)
      .expect({ error: { code: 'PROFILE_EDIT_FORBIDDEN' } });
  });

  it('requires explicit nullable profile fields at the transport boundary', async () => {
    const incompleteBody = {
      expectedVersion: 0,
      idempotencyKey: IDEMPOTENCY_KEY,
      links: [],
    };

    await request(app.getHttpServer())
      .put('/v1/internal/student/profile')
      .set('Authorization', 'Bearer opaque-session')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .send(incompleteBody)
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });
  });

  it('allows an Alumnus to grant and withdraw explicit versioned consent', async () => {
    canEditProfile = false;
    repository.profile = {
      entryYear: 2569,
      firstName: 'ณัฐดนัย',
      lastName: 'สุขใจ',
      profile: {
        bio: null,
        consent: null,
        links: [],
        photo: null,
        photoId: null,
        publicId: PUBLIC_ID,
        version: 1,
      },
    };
    await request(app.getHttpServer())
      .post('/v1/internal/student/profile/consent')
      .set('Authorization', 'Bearer opaque-session')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .send({
        consentTextVersion: 'phase-1-v1',
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
      })
      .expect(200)
      .expect({ outcome: 'updated' });

    await request(app.getHttpServer())
      .delete('/v1/internal/student/profile/consent')
      .set('Authorization', 'Bearer opaque-session')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .send({ expectedVersion: 2, idempotencyKey: IDEMPOTENCY_KEY })
      .expect(200)
      .expect({ outcome: 'updated' });
  });

  it('validates photo presign input and reuses current edit authorization', async () => {
    await request(app.getHttpServer())
      .post('/v1/internal/student/profile/photo-uploads')
      .set('Authorization', 'Bearer opaque-session')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .send({ byteSize: 1_024, contentType: 'image/gif' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST' } });

    canEditProfile = false;
    await request(app.getHttpServer())
      .post('/v1/internal/student/profile/photo-uploads')
      .set('Authorization', 'Bearer opaque-session')
      .set('x-student-bff-secret', STUDENT_BFF_SECRET)
      .send({ byteSize: 1_024, contentType: 'image/png' })
      .expect(403)
      .expect({ error: { code: 'PROFILE_EDIT_FORBIDDEN' } });
  });

  it('returns a cacheable safe public projection and uniform not found', async () => {
    const missing = await request(app.getHttpServer())
      .get(`/v1/public/profiles/${PUBLIC_ID}`)
      .expect(404);
    expect(missing.body).toEqual({ error: { code: 'PUBLIC_PROFILE_NOT_FOUND' } });
    expect(missing.headers['cache-control']).toBe('no-store');

    repository.publicProfile = {
      bio: null,
      entryYear: 2569,
      firstName: 'ณัฐดนัย',
      lastName: 'สุขใจ',
      links: [],
      photo: null,
      publicId: PUBLIC_ID,
    };
    const visible = await request(app.getHttpServer())
      .get(`/v1/public/profiles/${PUBLIC_ID}`)
      .expect(200);
    expect(visible.headers['cache-control']).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
    );
    expect(visible.body).toEqual(repository.publicProfile);
    expect(JSON.stringify(visible.body)).not.toMatch(/studentId|account|session/i);
  });
});
