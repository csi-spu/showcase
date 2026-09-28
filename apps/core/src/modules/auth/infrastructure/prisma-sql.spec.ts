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
   * Prisma sends JavaScript strings as Postgres text. The helper's existing
   * UUID cast must remain the default for UUID columns; text columns that can
   * contain UUID-shaped identifiers opt out explicitly below.
   */
  it('casts a UUID-shaped string parameter for UUID database columns', async () => {
    const { calls, client } = fakeClient();
    const sql = createPrismaSqlClient(client);
    const accountId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    await sql`select 1 from public.accounts where id = ${accountId}`;

    expect(calls[0]?.text).toContain('id = $1::uuid');
    expect(calls[0]?.values).toEqual([accountId]);
  });

  it('leaves non-UUID scalar parameters uncast', async () => {
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

  it('casts an explicitly typed text fragment as text even when it looks like a UUID', async () => {
    const { calls, client } = fakeClient();
    const sql = createPrismaSqlClient(client);
    const fieldId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    await sql`select 1 from private.collection_files where field_id = ${sql.text(fieldId)}`;

    expect(calls[0]?.text).toContain('field_id = $1::text');
    expect(calls[0]?.values).toEqual([fieldId]);
  });

  it('numbers bulk-insert placeholders sequentially with UUID casts', () => {
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

    expect(fragment.text).toBe('("id", "label") values ($1::uuid, $2), ($3::uuid, $4)');
  });

  /*
   * Prisma abandons an interactive transaction after its timeout, but a
   * statement still blocked on a lock keeps the connection until Postgres
   * returns. Postgres must enforce the same bound, or one stuck lock drains
   * the pool and every request fails until Core restarts.
   */
  it('bounds lock waits and idle gaps inside a transaction to the Prisma timeout', async () => {
    const { calls, client } = fakeClient();
    const transactionOptions: unknown[] = [];
    const prisma = {
      ...client,
      $transaction: (
        callback: (transaction: FakePrismaExecutor) => Promise<unknown>,
        options?: unknown,
      ) => {
        transactionOptions.push(options);
        return callback(client);
      },
    } as unknown as PrismaClient;
    const sql = createPrismaSqlClient(prisma);

    await sql.begin(async (transaction) => {
      await transaction`select 1`;
    });

    expect(transactionOptions).toEqual([{ timeout: 5_000 }]);
    expect(calls).toEqual([
      {
        method: 'query',
        text: "select set_config('lock_timeout', $1, true), set_config('idle_in_transaction_session_timeout', $1, true)",
        values: ['5000ms'],
      },
      { method: 'query', text: 'select 1', values: [] },
    ]);
  });
});
