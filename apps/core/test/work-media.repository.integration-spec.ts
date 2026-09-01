import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresWorkMediaRepository } from '../src/modules/works/infrastructure/postgres-work-media.repository';
import { PostgresWorksRepository } from '../src/modules/works/infrastructure/postgres-works.repository';

const PERSON_ID = '65000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '65000000-0000-4000-8000-000000000002';
const PROVIDER_USER_ID = '65000000-0000-4000-8000-000000000003';
const OTHER_PERSON_ID = '65000000-0000-4000-8000-000000000004';
const OTHER_ACCOUNT_ID = '65000000-0000-4000-8000-000000000005';
const OTHER_PROVIDER_USER_ID = '65000000-0000-4000-8000-000000000006';
const ASSET_ID = '65000000-0000-4000-8000-000000000007';
const CREATE_KEY = '65000000-0000-4000-8000-000000000008';
const RETRY_ASSET_ID = '65000000-0000-4000-8000-000000000009';
const EXPIRED_ASSET_ID = '65000000-0000-4000-8000-000000000010';
const MEDIA_AUTHORIZE_KEY = '65000000-0000-4000-8000-000000000011';
const RETRY_AUTHORIZE_KEY = '65000000-0000-4000-8000-000000000012';
const EXPIRED_AUTHORIZE_KEY = '65000000-0000-4000-8000-000000000013';
const ATTACH_KEY = '65000000-0000-4000-8000-000000000014';
const ATTACH_NOT_READY_KEY = '65000000-0000-4000-8000-000000000015';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const NOW = new Date('2026-08-25T12:00:00.000Z');

describe('PostgresWorkMediaRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const media = new PostgresWorkMediaRepository(database);
  const works = new PostgresWorksRepository(database);
  let publicId: string;

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`insert into public.people (id) values (${PERSON_ID}), (${OTHER_PERSON_ID})`;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${PERSON_ID}, 2566, 2573), (${OTHER_PERSON_ID}, 2566, 2573)
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state)
        values (${ACCOUNT_ID}, ${PERSON_ID}, ${PROVIDER_USER_ID}, 'set'),
          (${OTHER_ACCOUNT_ID}, ${OTHER_PERSON_ID}, ${OTHER_PROVIDER_USER_ID}, 'set')
      `;
      await transaction`
        insert into public.account_roles (account_id, role)
        values (${ACCOUNT_ID}, 'student'), (${OTHER_ACCOUNT_ID}, 'student')
      `;
      await transaction`
        insert into private.person_names (person_id, first_name_th, last_name_th)
        values (${PERSON_ID}, 'ชื่อ', 'ผู้ส่ง'), (${OTHER_PERSON_ID}, 'ชื่อ', 'บุคคลอื่น')
      `;
    });
    const created = await works.createWork({
      actorAccountId: ACCOUNT_ID,
      draft: draft(),
      idempotencyKey: CREATE_KEY,
      now: NOW,
      submitterPersonId: PERSON_ID,
    });
    if (!('work' in created)) throw new Error('WORK_CREATE_FAILED');
    publicId = created.work.publicId;
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('re-authorizes each lifecycle boundary, claims once, and only attaches ready media', async () => {
    await expect(
      media.authorizeUpload({
        actorAccountId: OTHER_ACCOUNT_ID,
        assetId: ASSET_ID,
        byteSize: 1_024,
        contentType: 'image/jpeg',
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        fileExtension: 'jpg',
        idempotencyKey: MEDIA_AUTHORIZE_KEY,
        mediaKind: 'poster',
        publicId,
        quarantineObjectKey: `work-quarantine/${ASSET_ID}`,
      }),
    ).resolves.toBeNull();

    await expect(
      media.authorizeUpload({
        actorAccountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        byteSize: 1_024,
        contentType: 'image/jpeg',
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        fileExtension: 'jpg',
        idempotencyKey: MEDIA_AUTHORIZE_KEY,
        mediaKind: 'poster',
        publicId,
        quarantineObjectKey: `work-quarantine/${ASSET_ID}`,
      }),
    ).resolves.toMatchObject({
      outcome: 'created',
      upload: { assetId: ASSET_ID, status: 'pending_upload' },
    });

    await expect(
      media.authorizeUpload({
        actorAccountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        byteSize: 1_024,
        contentType: 'image/jpeg',
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        fileExtension: 'jpg',
        idempotencyKey: MEDIA_AUTHORIZE_KEY,
        mediaKind: 'poster',
        publicId,
        quarantineObjectKey: `work-quarantine/${ASSET_ID}`,
      }),
    ).resolves.toMatchObject({ outcome: 'replayed', upload: { assetId: ASSET_ID } });
    await expect(
      media.authorizeUpload({
        actorAccountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        byteSize: 2_048,
        contentType: 'image/jpeg',
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        fileExtension: 'jpg',
        idempotencyKey: MEDIA_AUTHORIZE_KEY,
        mediaKind: 'poster',
        publicId,
        quarantineObjectKey: `work-quarantine/${ASSET_ID}`,
      }),
    ).resolves.toEqual({ outcome: 'idempotency_conflict' });

    await expect(
      media.attachReadyMedia({
        actorAccountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        expectedVersion: 1,
        idempotencyKey: ATTACH_KEY,
        mediaKind: 'poster',
        now: NOW,
        publicId,
      }),
    ).resolves.toEqual({ outcome: 'attached', version: 2 });
    await expect(
      media.markUploaded({
        actorAccountId: OTHER_ACCOUNT_ID,
        assetId: ASSET_ID,
        now: NOW,
        publicId,
      }),
    ).resolves.toBeNull();
    await media.markUploaded({ actorAccountId: ACCOUNT_ID, assetId: ASSET_ID, now: NOW, publicId });
    await expect(
      media.authorizeUpload({
        actorAccountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        byteSize: 1_024,
        contentType: 'image/jpeg',
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        fileExtension: 'jpg',
        idempotencyKey: MEDIA_AUTHORIZE_KEY,
        mediaKind: 'poster',
        publicId,
        quarantineObjectKey: `work-quarantine/${ASSET_ID}`,
      }),
    ).resolves.toEqual({ outcome: 'idempotency_conflict' });
    await expect(media.claimNext(NOW)).resolves.toMatchObject({
      assetId: ASSET_ID,
      status: 'processing',
    });
    await expect(media.claimNext(NOW)).resolves.toBeNull();
    await media.completeProcessing({
      assetId: ASSET_ID,
      byteSize: 512,
      contentHash: Buffer.alloc(32, 1),
      dominantColor: '#285078',
      expiresAt: new Date(NOW.getTime() + 7 * 86_400_000),
      height: 720,
      masterObjectKey: `work-media/${ASSET_ID}/master.webp`,
      now: NOW,
      variants: [
        {
          byteSize: 128,
          contentHash: Buffer.alloc(32, 2),
          height: 320,
          objectKey: `work-media/${ASSET_ID}/480.webp`,
          width: 480,
        },
      ],
      warnings: ['poster_width_below_recommended'],
      width: 480,
    });
    await expect(
      media.attachReadyMedia({
        actorAccountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        expectedVersion: 1,
        idempotencyKey: ATTACH_KEY,
        mediaKind: 'poster',
        now: NOW,
        publicId,
      }),
    ).resolves.toEqual({ outcome: 'attached', version: 2 });
    await expect(
      media.attachReadyMedia({
        actorAccountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        expectedVersion: 1,
        idempotencyKey: ATTACH_KEY,
        mediaKind: 'poster',
        now: NOW,
        publicId,
      }),
    ).resolves.toEqual({ outcome: 'attached', version: 2 });
    await expect(
      media.attachReadyMedia({
        actorAccountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        expectedVersion: 2,
        idempotencyKey: ATTACH_NOT_READY_KEY,
        mediaKind: 'poster',
        now: NOW,
        publicId,
      }),
    ).resolves.toEqual({ outcome: 'not_ready' });
    await expect(media.claimExpired(new Date(NOW.getTime() + 8 * 86_400_000))).resolves.toBeNull();
  });

  it('bounds processing retries and exposes a stable rejection state', async () => {
    await media.authorizeUpload({
      actorAccountId: ACCOUNT_ID,
      assetId: RETRY_ASSET_ID,
      byteSize: 1_024,
      contentType: 'image/jpeg',
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      fileExtension: 'jpeg',
      idempotencyKey: RETRY_AUTHORIZE_KEY,
      mediaKind: 'gallery',
      publicId,
      quarantineObjectKey: `work-quarantine/${RETRY_ASSET_ID}`,
    });
    await media.markUploaded({
      actorAccountId: ACCOUNT_ID,
      assetId: RETRY_ASSET_ID,
      now: NOW,
      publicId,
    });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expect(media.claimNext(NOW)).resolves.toMatchObject({ assetId: RETRY_ASSET_ID });
      await expect(media.releaseProcessing({ assetId: RETRY_ASSET_ID, now: NOW })).resolves.toEqual(
        { isRejected: attempt === 3 },
      );
    }
    await expect(
      media.findUploadStatus({ actorAccountId: ACCOUNT_ID, assetId: RETRY_ASSET_ID, publicId }),
    ).resolves.toMatchObject({ rejectionCode: 'processing_failed', status: 'rejected' });
  });

  it('claims expired quarantine metadata once and deletes it idempotently', async () => {
    await media.authorizeUpload({
      actorAccountId: ACCOUNT_ID,
      assetId: EXPIRED_ASSET_ID,
      byteSize: 1_024,
      contentType: 'image/png',
      createdAt: NOW,
      expiresAt: NOW,
      fileExtension: 'png',
      idempotencyKey: EXPIRED_AUTHORIZE_KEY,
      mediaKind: 'gallery',
      publicId,
      quarantineObjectKey: `work-quarantine/${EXPIRED_ASSET_ID}`,
    });
    await expect(media.claimExpired(NOW)).resolves.toEqual({
      assetId: EXPIRED_ASSET_ID,
      objectKeys: [
        `work-quarantine/${EXPIRED_ASSET_ID}`,
        `work-media/${EXPIRED_ASSET_ID}/master.webp`,
        `work-media/${EXPIRED_ASSET_ID}/640.webp`,
        `work-media/${EXPIRED_ASSET_ID}/1280.webp`,
        `work-media/${EXPIRED_ASSET_ID}/1920.webp`,
      ],
    });
    await expect(media.claimExpired(NOW)).resolves.toBeNull();
    await expect(media.completeCleanup({ assetId: EXPIRED_ASSET_ID, now: NOW })).resolves.toBe(
      true,
    );
    await expect(media.completeCleanup({ assetId: EXPIRED_ASSET_ID, now: NOW })).resolves.toBe(
      false,
    );
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`delete from private.work_media_variants where asset_id in (${ASSET_ID}, ${RETRY_ASSET_ID}, ${EXPIRED_ASSET_ID})`;
      await transaction`delete from private.work_draft_media where asset_id in (${ASSET_ID}, ${RETRY_ASSET_ID}, ${EXPIRED_ASSET_ID})`;
      await transaction`delete from private.work_media_assets where id in (${ASSET_ID}, ${RETRY_ASSET_ID}, ${EXPIRED_ASSET_ID})`;
      await transaction`delete from private.work_operations where actor_account_id in (${ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})`;
      await transaction`delete from public.works where submitter_person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})`;
      await transaction`delete from public.account_roles where account_id in (${ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})`;
      await transaction`delete from public.accounts where id in (${ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})`;
      await transaction`delete from public.students where person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})`;
      await transaction`
        delete from private.person_names where person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})
      `;
      await transaction`delete from public.people where id in (${PERSON_ID}, ${OTHER_PERSON_ID})`;
    });
  }
});

function draft() {
  return {
    academicPeriod: { semester: '1' as const, year: 2569 },
    category: 'course_work' as const,
    description: 'รายละเอียดผลงาน',
    links: [],
    summary: 'สรุปผลงาน',
    tags: [],
    title: 'ระบบแนะนำผลงาน',
    videoLinks: [],
  };
}
