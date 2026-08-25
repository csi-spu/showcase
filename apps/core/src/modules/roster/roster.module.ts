import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { ROSTER_REPOSITORY, STUDENT_IDENTITY_PROVIDER } from './application/roster.ports';
import { RosterImportService } from './application/roster-import.service';
import { RosterWorker } from './application/roster.worker';
import { PostgresRosterRepository } from './infrastructure/postgres-roster.repository';
import { SupabaseStudentIdentityAdapter } from './infrastructure/supabase-student-identity.adapter';
import { AdminRosterController } from './transport/admin-roster.controller';
import { RosterExceptionFilter } from './transport/roster-exception.filter';

@Module({
  imports: [AuthModule],
  controllers: [AdminRosterController],
  providers: [
    RosterImportService,
    RosterWorker,
    RosterExceptionFilter,
    { provide: ROSTER_REPOSITORY, useClass: PostgresRosterRepository },
    {
      inject: [ConfigService],
      provide: STUDENT_IDENTITY_PROVIDER,
      useFactory: (config: ConfigService) =>
        new SupabaseStudentIdentityAdapter({
          baseUrl: config.getOrThrow<string>('SUPABASE_URL'),
          secretKey: config.getOrThrow<string>('SUPABASE_SECRET_KEY'),
          timeoutMilliseconds: config.getOrThrow<number>('SUPABASE_AUTH_TIMEOUT_MS'),
        }),
    },
  ],
})
export class RosterModule {}
