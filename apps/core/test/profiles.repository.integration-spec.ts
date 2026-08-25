import { ConfigService } from '@nestjs/config';
import { PostgresProfilesRepository } from '../src/modules/profiles/infrastructure/postgres-profiles.repository';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';

const PERSON_ID = '41000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '41000000-0000-4000-8000-000000000002';
const PROVIDER_USER_ID = '41000000-0000-4000-8000-000000000003';
const UPDATE_KEY = '41000000-0000-4000-8000-000000000004';
const GRANT_KEY = '41000000-0000-4000-8000-000000000005';
const WITHDRAW_KEY = '41000000-0000-4000-8000-000000000006';
const CONSENTED_EDIT_KEY = '41000000-0000-4000-8000-000000000007';
const CONCURRENT_UPDATE_KEY = '41000000-0000-4000-8000-000000000009';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('PostgresProfilesRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresProfilesRepository(
    database,
    new ConfigService({ PUBLIC_MEDIA_ORIGIN: 'https://media.example.com' }),
  );

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`insert into public.people (id) values (${PERSON_ID})`;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${PERSON_ID}, 2569, 2576)
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state)
        values (${ACCOUNT_ID}, ${PERSON_ID}, ${PROVIDER_USER_ID}, 'set')
      `;
      await transaction`
        insert into public.account_roles (account_id, role) values (${ACCOUNT_ID}, 'student')
      `;
    });
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('proves roster-like Account creation grants neither Public Profile nor Profile Consent', async () => {
    await expect(repository.findPrivateProfile(ACCOUNT_ID)).resolves.toBeNull();
    const consents = await database.sql<{ count: number }[]>`
      select count(*)::integer as count
      from public.profile_consents
      where person_id = ${PERSON_ID}
    `;
    expect(consents).toEqual([{ count: 0 }]);
  });

  it('keeps a valid profile private until explicit versioned consent is committed', async () => {
    const createProfile = (idempotencyKey: string) =>
      repository.updateProfile({
        actorAccountId: ACCOUNT_ID,
        expectedVersion: 0,
        idempotencyKey,
        now: new Date('2026-08-25T08:00:00.000Z'),
        profile: {
          bio: 'สนใจระบบเว็บ',
          displayName: 'ณัฐดนัย สุขใจ',
          links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
          photoId: null,
        },
      });
    const concurrentOutcomes = await Promise.all([
      createProfile(UPDATE_KEY),
      createProfile(CONCURRENT_UPDATE_KEY),
    ]);
    expect(concurrentOutcomes).toEqual(
      expect.arrayContaining([{ outcome: 'updated' }, { outcome: 'version_conflict' }]),
    );

    const privateProfile = await repository.findPrivateProfile(ACCOUNT_ID);
    expect(privateProfile).toMatchObject({
      consent: null,
      displayName: 'ณัฐดนัย สุขใจ',
      entryYear: 2569,
      version: 1,
    });
    expect(privateProfile?.publicId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(repository.findPublicProfile(privateProfile!.publicId)).resolves.toBeNull();

    await expect(
      repository.grantConsent({
        actorAccountId: ACCOUNT_ID,
        consentTextVersion: 'phase-1-v1',
        expectedVersion: 1,
        idempotencyKey: GRANT_KEY,
        now: new Date('2026-08-25T08:05:00.000Z'),
      }),
    ).resolves.toEqual({ outcome: 'updated' });

    await expect(repository.findPublicProfile(privateProfile!.publicId)).resolves.toEqual({
      bio: 'สนใจระบบเว็บ',
      displayName: 'ณัฐดนัย สุขใจ',
      entryYear: 2569,
      links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
      photo: null,
      publicId: privateProfile!.publicId,
    });
  });

  it('withdraws authoritative eligibility immediately while retaining identifier and history', async () => {
    const before = await repository.findPrivateProfile(ACCOUNT_ID);
    await expect(
      repository.updateProfile({
        actorAccountId: ACCOUNT_ID,
        expectedVersion: 2,
        idempotencyKey: CONSENTED_EDIT_KEY,
        now: new Date('2026-08-25T08:07:00.000Z'),
        profile: {
          bio: 'ปรับข้อมูลล่าสุด',
          displayName: 'ณัฐดนัย สุขใจ',
          links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
          photoId: null,
        },
      }),
    ).resolves.toEqual({ outcome: 'updated' });
    await expect(
      repository.withdrawConsent({
        actorAccountId: ACCOUNT_ID,
        expectedVersion: 3,
        idempotencyKey: WITHDRAW_KEY,
        now: new Date('2026-08-25T08:10:00.000Z'),
      }),
    ).resolves.toEqual({ outcome: 'updated' });

    await expect(repository.findPublicProfile(before!.publicId)).resolves.toBeNull();
    await expect(repository.findPrivateProfile(ACCOUNT_ID)).resolves.toMatchObject({
      consent: null,
      publicId: before!.publicId,
      version: 4,
    });
    const [history, outbox] = await Promise.all([
      database.sql<{ count: number }[]>`
        select count(*)::integer as count
        from public.profile_consents
        where person_id = ${PERSON_ID}
      `,
      database.sql<{ event_type: string }[]>`
        select event_type
        from private.outbox_events
        where aggregate_type = 'public_profile'
          and aggregate_id in (${GRANT_KEY}, ${CONSENTED_EDIT_KEY}, ${WITHDRAW_KEY})
        order by occurred_at
      `,
    ]);
    expect(history).toEqual([{ count: 1 }]);
    expect(outbox).toEqual([
      { event_type: 'public_profile_visible' },
      { event_type: 'public_profile_cache_invalidated' },
      { event_type: 'public_profile_cache_invalidated' },
    ]);
  });

  it('replays the same idempotency key and rejects stale optimistic versions', async () => {
    await expect(
      repository.withdrawConsent({
        actorAccountId: ACCOUNT_ID,
        expectedVersion: 3,
        idempotencyKey: WITHDRAW_KEY,
        now: new Date('2026-08-25T08:10:00.000Z'),
      }),
    ).resolves.toEqual({ outcome: 'replayed' });
    await expect(
      repository.grantConsent({
        actorAccountId: ACCOUNT_ID,
        consentTextVersion: 'phase-1-v1',
        expectedVersion: 3,
        idempotencyKey: '41000000-0000-4000-8000-000000000008',
        now: new Date('2026-08-25T08:15:00.000Z'),
      }),
    ).resolves.toEqual({ outcome: 'version_conflict' });
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`
        delete from private.outbox_events
        where aggregate_type = 'public_profile'
          and aggregate_id::text like '41000000-0000-4000-8000-%'
      `;
      await transaction`delete from private.profile_operations where person_id = ${PERSON_ID}`;
      await transaction`delete from public.profile_consents where person_id = ${PERSON_ID}`;
      await transaction`delete from public.public_profile_links where person_id = ${PERSON_ID}`;
      await transaction`delete from public.public_profiles where person_id = ${PERSON_ID}`;
      await transaction`delete from private.profile_photo_assets where person_id = ${PERSON_ID}`;
      await transaction`delete from public.account_roles where account_id = ${ACCOUNT_ID}`;
      await transaction`delete from public.accounts where id = ${ACCOUNT_ID}`;
      await transaction`delete from public.students where person_id = ${PERSON_ID}`;
      await transaction`delete from public.people where id = ${PERSON_ID}`;
    });
  }
});
