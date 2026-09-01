import type { PrismaQuery, PrismaSql } from '../modules/auth/infrastructure/prisma-sql';

declare module 'postgres' {
  function postgres<T extends Record<string, unknown> = Record<string, unknown>>(
    url?: string,
    options?: Record<string, unknown>,
  ): postgres.Sql<T>;
  namespace postgres {
    type Sql<TTypes extends Record<string, unknown> = Record<string, unknown>> = PrismaSql & {
      readonly __sql?: TTypes;
    };
    type TransactionSql<TTypes extends Record<string, unknown> = Record<string, unknown>> =
      PrismaSql & {
        readonly __transaction?: TTypes;
      };
    type PendingQuery<T> = PrismaQuery<T>;
    type JSONValue = Record<string, unknown> | unknown[] | string | number | boolean | null;
    type Row = Record<string, unknown>;
  }
  export = postgres;
}
