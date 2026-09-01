import type { Prisma, PrismaClient } from '@prisma/client';

export class PrismaValueFragment {
  constructor(
    readonly value: unknown,
    readonly isJson = false,
  ) {}
}

export class PrismaQuery<T> implements Promise<T> {
  constructor(
    private readonly executeQuery: () => Promise<T>,
    readonly text: string,
    readonly values: readonly unknown[],
  ) {}

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.executeQuery().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T | TResult> {
    return this.executeQuery().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    return this.executeQuery().finally(onfinally);
  }

  get [Symbol.toStringTag](): string {
    return 'Promise';
  }
}

export interface PrismaSql {
  <T extends unknown[]>(strings: TemplateStringsArray, ...values: unknown[]): PrismaQuery<T>;
  (values: readonly unknown[], ...columns: string[]): PrismaQuery<unknown[]>;
  begin<T>(callback: (transaction: PrismaSql) => Promise<T>): Promise<T>;
  json(value: unknown): PrismaValueFragment;
  unsafe<T extends unknown[]>(text: string, ...values: unknown[]): PrismaQuery<T>;
  end(options?: { timeout?: number }): Promise<void>;
}

type PrismaExecutor = Pick<PrismaClient, '$executeRawUnsafe' | '$queryRawUnsafe'>;

export function createPrismaSqlClient(
  client: PrismaExecutor | Prisma.TransactionClient,
): PrismaSql {
  const sql = (<T extends unknown[]>(
    strings: TemplateStringsArray | readonly unknown[],
    ...values: unknown[]
  ): PrismaQuery<T> => {
    if (!isTemplateStringsArray(strings)) {
      return buildBulkQuery(client, strings, values as string[]) as PrismaQuery<T>;
    }
    const query = buildQuery(strings, values);
    return new PrismaQuery(
      async () => execute<T>(client, query.text, query.values),
      query.text,
      query.values,
    );
  }) as PrismaSql;

  sql.begin = <T>(callback: (transaction: PrismaSql) => Promise<T>): Promise<T> => {
    if (!('$transaction' in client)) {
      return Promise.reject(new Error('PRISMA_TRANSACTION_NESTED'));
    }
    return (client as PrismaClient).$transaction(async (transaction) => {
      return callback(createPrismaSqlClient(transaction));
    });
  };
  sql.json = (value: unknown) => new PrismaValueFragment(JSON.stringify(value), true);
  sql.unsafe = <T extends unknown[]>(text: string, ...values: unknown[]) =>
    new PrismaQuery(async () => execute<T>(client, text, values), text, values);
  sql.end = () => Promise.resolve();
  return sql;
}

function isTemplateStringsArray(
  value: TemplateStringsArray | readonly unknown[],
): value is TemplateStringsArray {
  return 'raw' in value;
}

function buildBulkQuery(
  _client: PrismaExecutor | Prisma.TransactionClient,
  values: readonly unknown[],
  columns: readonly string[],
): PrismaQuery<unknown[]> {
  const rows =
    columns.length > 0
      ? values.map((value) => columns.map((column) => (value as Record<string, unknown>)[column]))
      : [values];
  const parameters = rows.flat();
  let parameter = 1;
  const valuesText =
    rows.length === 1 && columns.length === 0
      ? `(${rows[0]!.map((value) => parameterPlaceholder(value, parameter++)).join(', ')})`
      : rows
          .map(
            (row) => `(${row.map((value) => parameterPlaceholder(value, parameter++)).join(', ')})`,
          )
          .join(', ');
  const text =
    columns.length === 0
      ? valuesText
      : `(${columns.map((column) => `"${column.replaceAll('"', '""')}"`).join(', ')}) values ${valuesText}`;
  return new PrismaQuery(
    () => Promise.reject(new Error('PRISMA_FRAGMENT_AWAITED')),
    text,
    parameters,
  );
}

async function execute<T>(
  client: PrismaExecutor | Prisma.TransactionClient,
  text: string,
  values: readonly unknown[],
): Promise<T> {
  const hasRows =
    /\breturning\b/i.test(text) || /^(select|with|show|explain|values)\b/i.test(text.trim());
  try {
    if (hasRows) {
      return await client.$queryRawUnsafe(text, ...values);
    }
    await client.$executeRawUnsafe(text, ...values);
    return [] as T;
  } catch (error: unknown) {
    throw normalizePrismaError(error);
  }
}

function normalizePrismaError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error('PRISMA_QUERY_FAILED', { cause: error });
  const code = /Raw query failed\. Code: `([^`]+)`/.exec(error.message)?.[1];
  if (code === undefined) return error;
  const detail = /Message: `ERROR: ([^\n`]+)/.exec(error.message)?.[1] ?? error.message;
  const normalized = new Error(detail, { cause: error });
  Object.assign(normalized, { code });
  return normalized;
}

function buildQuery(strings: TemplateStringsArray, values: readonly unknown[]) {
  let text = strings[0] ?? '';
  const parameters: unknown[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value instanceof PrismaQuery) {
      const offset = parameters.length;
      text += value.text.replace(/\$(\d+)/g, (_, number: string) => `$${Number(number) + offset}`);
      parameters.push(...value.values);
    } else {
      const isJson = value instanceof PrismaValueFragment && value.isJson;
      const parameterValue = value instanceof PrismaValueFragment ? value.value : value;
      text += parameterPlaceholder(parameterValue, parameters.length + 1, isJson);
      parameters.push(parameterValue);
    }
    text += strings[index + 1] ?? '';
  }
  return { text, values: parameters };
}

function parameterPlaceholder(value: unknown, index: number, isJson = false): string {
  if (isJson) return `$${index}::jsonb`;
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? `$${index}::uuid`
    : `$${index}`;
}
