import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WORKS_CLOCK, WORKS_REPOSITORY, type WorksClock } from './application/works.ports';
import { WorksService } from './application/works.service';
import { PostgresWorksRepository } from './infrastructure/postgres-works.repository';
import { StudentWorksController } from './transport/student-works.controller';
import { WorksExceptionFilter } from './transport/works-exception.filter';

@Module({
  controllers: [StudentWorksController],
  imports: [AuthModule],
  providers: [
    WorksService,
    WorksExceptionFilter,
    { provide: WORKS_REPOSITORY, useClass: PostgresWorksRepository },
    {
      provide: WORKS_CLOCK,
      useValue: { now: () => new Date() } satisfies WorksClock,
    },
  ],
})
export class WorksModule {}
