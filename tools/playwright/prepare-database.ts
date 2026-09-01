import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('E2E_SETUP_DATABASE_URL_MISSING');
}

const database = postgres(databaseUrl, {
  connect_timeout: 5,
  idle_timeout: 5,
  max: 1,
  prepare: true,
});

try {
  await database`
    insert into public.academic_settings (singleton, current_academic_year)
    values (true, 2569)
    on conflict (singleton) do update
    set current_academic_year = excluded.current_academic_year
  `;
} finally {
  await database.end({ timeout: 5 });
}
