import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { DatabaseClient } from '../auth/infrastructure/database.client';

@Injectable()
export class DatabaseReadinessIndicator {
  constructor(
    private readonly database: DatabaseClient,
    private readonly indicator: HealthIndicatorService,
  ) {}

  async check(): Promise<HealthIndicatorResult<'database'>> {
    const status = this.indicator.check('database');
    try {
      const rows = await this.database.sql<{ current_academic_year: number | null }[]>`
        select current_academic_year
        from public.academic_settings
        where singleton = true
        limit 1
      `;
      if (rows[0]?.current_academic_year === null || rows[0] === undefined) {
        return status.down({ errorCode: 'CURRENT_ACADEMIC_YEAR_MISSING' });
      }
      return status.up();
    } catch {
      return status.down({ errorCode: 'DATABASE_UNAVAILABLE' });
    }
  }
}
