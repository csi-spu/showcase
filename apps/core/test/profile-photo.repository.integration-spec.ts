import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresProfilePhotoRepository } from '../src/modules/profiles/infrastructure/postgres-profile-photo.repository';
import { PostgresProfilesRepository } from '../src/modules/profiles/infrastructure/postgres-profiles.repository';

const PERSON_ID = '62000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '62000000-0000-4000-8000-000000000002';
const OTHER_PERSON_ID = '62000000-0000-4000-8000-000000000003';
const OTHER_ACCOUNT_ID = '62000000-0000-4000-8000-000000000004';
const UPLOAD_ID = '62000000-0000-4000-8000-000000000005';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('PostgresProfilePhotoRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const photos = new PostgresProfilePhotoRepository(database);
  const profiles = new PostgresProfilesRepository(
    database,
    new ConfigService({ PUBLIC_MEDIA_ORIGIN: 'https://media.example.com' }),
  );

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`insert into public.people (id) values (${PERSON_ID}), (${OTHER_PERSON_ID})`;
      await transaction`
        insert into private.person_names (person_id, first_name_th, last_name_th) values
          (${PERSON_ID}, 'เจ้าของ', 'รูป'), (${OTHER_PERSON_ID}, 'บุคคล', 'อื่น')
      `;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${PERSON_ID}, 2569, 2576), (${OTHER_PERSON_ID}, 2569, 2576)
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state)
        values
          (${ACCOUNT_ID}, ${PERSON_ID}, ${'62000000-0000-4000-8000-000000000006'}, 'set'),
          (${OTHER_ACCOUNT_ID}, ${OTHER_PERSON_ID}, ${'62000000-0000-4000-8000-000000000007'}, 'set')
      `;
    });
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('reauthorizes an owned upload and makes only a completed sanitized asset attachable', async () => {
    await expect(
      photos.createUpload({
        actorAccountId: ACCOUNT_ID,
        byteSize: 1_024,
        contentType: 'image/png',
        createdAt: new Date('2026-08-25T08:00:00.000Z'),
        expiresAt: new Date('2026-08-26T08:00:00.000Z'),
        quarantineObjectKey: `profile-quarantine/${UPLOAD_ID}`,
        uploadId: UPLOAD_ID,
      }),
    ).resolves.toBe(true);
    await expect(
      photos.claimUpload({
        actorAccountId: OTHER_ACCOUNT_ID,
        now: new Date('2026-08-25T08:05:00.000Z'),
        uploadId: UPLOAD_ID,
      }),
    ).resolves.toBeNull();

    await expect(
      photos.claimUpload({
        actorAccountId: ACCOUNT_ID,
        now: new Date('2026-08-25T08:05:00.000Z'),
        uploadId: UPLOAD_ID,
      }),
    ).resolves.toMatchObject({ personId: PERSON_ID, status: 'processing' });
    await photos.completeUpload({
      byteSize: 900,
      contentType: 'image/webp',
      height: 512,
      now: new Date('2026-08-25T08:06:00.000Z'),
      sanitizedObjectKey: `profile-media/${UPLOAD_ID}.webp`,
      uploadId: UPLOAD_ID,
      width: 512,
    });
    await expect(
      photos.claimUpload({
        actorAccountId: ACCOUNT_ID,
        now: new Date('2026-08-25T08:06:30.000Z'),
        uploadId: UPLOAD_ID,
      }),
    ).resolves.toMatchObject({ personId: PERSON_ID, status: 'ready' });

    await expect(
      profiles.updateProfile({
        actorAccountId: ACCOUNT_ID,
        expectedVersion: 0,
        idempotencyKey: '62000000-0000-4000-8000-000000000008',
        now: new Date('2026-08-25T08:07:00.000Z'),
        profile: {
          bio: null,
          links: [],
          photoId: UPLOAD_ID,
        },
      }),
    ).resolves.toEqual({ outcome: 'updated' });
    await profiles.grantConsent({
      actorAccountId: ACCOUNT_ID,
      consentTextVersion: 'phase-1-v1',
      expectedVersion: 1,
      idempotencyKey: '62000000-0000-4000-8000-000000000009',
      now: new Date('2026-08-25T08:08:00.000Z'),
    });
    const privateProfile = await profiles.findPrivateProfile(ACCOUNT_ID);
    await expect(
      profiles.findPublicProfile(privateProfile!.profile!.publicId),
    ).resolves.toMatchObject({
      photo: {
        height: 512,
        url: `https://media.example.com/profile-media/${UPLOAD_ID}.webp`,
        width: 512,
      },
    });
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`
        delete from private.outbox_events
        where aggregate_type = 'public_profile'
          and aggregate_id::text like '62000000-0000-4000-8000-%'
      `;
      await transaction`
        delete from private.profile_operations where person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})
      `;
      await transaction`
        delete from public.profile_consents where person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})
      `;
      await transaction`
        delete from public.public_profile_links where person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})
      `;
      await transaction`
        delete from public.public_profiles where person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})
      `;
      await transaction`
        delete from private.profile_photo_assets where person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})
      `;
      await transaction`delete from public.accounts where id in (${ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})`;
      await transaction`delete from public.students where person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})`;
      await transaction`delete from public.people where id in (${PERSON_ID}, ${OTHER_PERSON_ID})`;
    });
  }
});
