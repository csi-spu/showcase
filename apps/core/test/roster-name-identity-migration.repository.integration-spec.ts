import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';

const PERSON_ID = '5f000000-0000-4000-8000-000000000001';
const PROFILE_PUBLIC_ID = '5f000000-0000-4000-8000-000000000002';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

class RollbackMigrationTest extends Error {}

describe('Roster Name identity migration integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));

  afterAll(async () => database.onApplicationShutdown());

  it('protects the Admin correction audit from application database roles', async () => {
    const [tables, grants] = await Promise.all([
      database.sql<{ relrowsecurity: boolean }[]>`
        select relrowsecurity
        from pg_class
        where oid = 'private.person_name_correction_audit_events'::regclass
      `,
      database.sql<{ count: number }[]>`
        select count(*)::integer as count
        from information_schema.role_table_grants
        where table_schema = 'private'
          and table_name = 'person_name_correction_audit_events'
          and grantee in ('public', 'anon', 'authenticated')
      `,
    ]);

    expect(tables).toEqual([{ relrowsecurity: true }]);
    expect(grants).toEqual([{ count: 0 }]);
  });

  it('derives legacy profile columns during compatibility and removes them atomically at cutover', async () => {
    const legacyColumns = await database.sql<{ count: number }[]>`
      select count(*)::integer as count
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'public_profiles'
        and column_name in ('display_name', 'normalized_display_name')
    `;

    if (legacyColumns[0]?.count === 0) {
      expect(legacyColumns).toEqual([{ count: 0 }]);
      return;
    }
    expect(legacyColumns).toEqual([{ count: 2 }]);

    await expect(
      database.sql.begin(async (transaction) => {
        await transaction`insert into public.people (id) values (${PERSON_ID})`;
        await transaction`
          insert into public.students (person_id, entry_year, access_ends_academic_year)
          values (${PERSON_ID}, 2569, 2576)
        `;
        await transaction`
          insert into private.person_names (person_id, first_name_th, last_name_th)
          values (${PERSON_ID}, 'สมชาย', 'ใจดี')
        `;
        await transaction`
          insert into public.public_profiles (person_id, public_id, bio, version)
          values (${PERSON_ID}, ${PROFILE_PUBLIC_ID}, null, 1)
        `;
        await expect(
          transaction<{ display_name: string; normalized_display_name: string }[]>`
            select display_name, normalized_display_name
            from public.public_profiles
            where person_id = ${PERSON_ID}
          `,
        ).resolves.toEqual([{ display_name: 'สมชาย ใจดี', normalized_display_name: 'สมชาย ใจดี' }]);

        await transaction`
          update private.person_names
          set first_name_th = 'สมหญิง', last_name_th = 'มั่นใจ'
          where person_id = ${PERSON_ID}
        `;
        await expect(
          transaction<{ display_name: string }[]>`
            select display_name
            from public.public_profiles
            where person_id = ${PERSON_ID}
          `,
        ).resolves.toEqual([{ display_name: 'สมหญิง มั่นใจ' }]);

        await transaction`select private.execute_roster_name_profile_cutover()`;
        const removed = await transaction<{ count: number }[]>`
          select count(*)::integer as count
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'public_profiles'
            and column_name in ('display_name', 'normalized_display_name')
        `;
        expect(removed).toEqual([{ count: 0 }]);
        await expect(
          transaction<{ first_name_th: string; last_name_th: string }[]>`
            select name.first_name_th, name.last_name_th
            from public.public_profiles as profile
            join private.person_names as name on name.person_id = profile.person_id
            where profile.public_id = ${PROFILE_PUBLIC_ID}
          `,
        ).resolves.toEqual([{ first_name_th: 'สมหญิง', last_name_th: 'มั่นใจ' }]);

        throw new RollbackMigrationTest();
      }),
    ).rejects.toBeInstanceOf(RollbackMigrationTest);
  });
});
