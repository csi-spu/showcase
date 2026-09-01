import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  BetterAuthEngine,
  BetterAuthStudentIdentityProvider,
} from '../auth/infrastructure/better-auth.adapter';
import { ROSTER_REPOSITORY, STUDENT_IDENTITY_PROVIDER } from './application/roster.ports';
import { RosterImportService } from './application/roster-import.service';
import { RosterWorker } from './application/roster.worker';
import { PostgresRosterRepository } from './infrastructure/postgres-roster.repository';
import { AdminRosterController } from './transport/admin-roster.controller';
import { AdminRosterStudentController } from './transport/admin-roster-student.controller';
import { RosterExceptionFilter } from './transport/roster-exception.filter';

@Module({
  imports: [AuthModule],
  controllers: [AdminRosterController, AdminRosterStudentController],
  providers: [
    RosterImportService,
    RosterWorker,
    RosterExceptionFilter,
    { provide: ROSTER_REPOSITORY, useClass: PostgresRosterRepository },
    {
      provide: STUDENT_IDENTITY_PROVIDER,
      useFactory: (engine: BetterAuthEngine) => new BetterAuthStudentIdentityProvider(engine),
      inject: [BetterAuthEngine],
    },
  ],
})
export class RosterModule {}
