import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';

@Injectable()
export class DatabaseClient implements OnApplicationShutdown {
  readonly sql: postgres.Sql;

  constructor(config: ConfigService) {
    this.sql = postgres(config.getOrThrow<string>('DATABASE_URL'), {
      connect_timeout: 5,
      idle_timeout: 20,
      max: 20,
      prepare: true,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
