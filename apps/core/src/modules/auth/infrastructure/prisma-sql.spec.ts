import type { PrismaClient } from '../../../../generated/prisma-client';
import { createPrismaSqlClient } from './prisma-sql';

type FakePrismaExecutor = Pick<PrismaClient, '$executeRawUnsafe' | '$queryRawUnsafe'>;

function fakeClient() {
  const calls: { method: string; text: string; values: unknown[] }[] = [];
  const client: FakePrismaExecutor = {
    $queryRawUnsafe: ((text: string, ...values: unknown[]) => {
      calls.push({ method: 'query', text, values });
      return Promise.resolve([]);
    }) as PrismaClient['$queryRawUnsafe'],
    $executeRawUnsafe: ((text: string, ...values: unknown[]) => {
      calls.push({ method: 'execute', text, values });
      return Promise.resolve(0);
    }) as PrismaClient['$executeRawUnsafe'],
  };
  return { calls, client };
}

describe('createPrismaSqlClient', () => {
  /*
   * A UUID-shaped value used to be auto-cast to `$n::uuid` based on its shape
   * alone. `collection_files.field_id` is a `text` column that legitimately
   * holds Instructor-chosen ids generated with `crypto.randomUUID()`, so that
   * heuristic produced `field_id = $n::uuid` and failed with Postgres error
   * 42883 (`operator does not exist: text = uuid`). Placeholders must stay
   * uncast and let Postgres infer the type from the comparison.
   */
  it('leaves a UUID-shaped string parameter uncast', async () => {
    const { calls, client } = fakeClient();
    const sql = createPrismaSqlClient(client);
    const fieldId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    await sql`select 1 from private.collection_files where field_id = ${fieldId}`;

    expect(calls[0]?.text).toContain('field_id = $1');
    expect(calls[0]?.text).not.toContain('::uuid');
    expect(calls[0]?.values).toEqual([fieldId]);
  });

  it('leaves every scalar parameter uncast regardless of shape', async () => {
    const { calls, client } = fakeClient();
    const sql = createPrismaSqlClient(client);

    await sql`select 1 where a = ${'plain-text'} and b = ${42} and c = ${true}`;

    expect(calls[0]?.text).toBe('select 1 where a = $1 and b = $2 and c = $3');
    expect(calls[0]?.values).toEqual(['plain-text', 42, true]);
  });

  it('still casts a json fragment explicitly', async () => {
    const { calls, client } = fakeClient();
    const sql = createPrismaSqlClient(client);

    await sql`select 1 where fields = ${sql.json({ a: 1 })}`;

    expect(calls[0]?.text).toBe('select 1 where fields = $1::jsonb');
    expect(calls[0]?.values).toEqual([JSON.stringify({ a: 1 })]);
  });

  it('numbers bulk-insert placeholders sequentially without a cast', () => {
    const { client } = fakeClient();
    const sql = createPrismaSqlClient(client);

    // A bulk fragment is a `PrismaQuery` meant to be spliced into another
    // query (see `buildQuery`'s `PrismaQuery` branch); it is never awaited
    // directly, so this reads its built `.text` rather than executing it.
    const fragment = sql(
      [
        { id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', label: 'a' },
        { id: '4fa85f64-5717-4562-b3fc-2c963f66afa6', label: 'b' },
      ],
      'id',
      'label',
    );

    expect(fragment.text).toBe('("id", "label") values ($1, $2), ($3, $4)');
    expect(fragment.text).not.toContain('::uuid');
  });
});
