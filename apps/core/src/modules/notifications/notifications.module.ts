import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NOTIFICATION_REPOSITORY } from './application/notifications.ports';
import { NotificationsService } from './application/notifications.service';
import { PostgresNotificationsRepository } from './infrastructure/postgres-notifications.repository';
import { AdminNotificationsController } from './transport/admin-notifications.controller';
import { NotificationsExceptionFilter } from './transport/notifications-exception.filter';
import { StudentNotificationsController } from './transport/student-notifications.controller';

@Module({
  controllers: [AdminNotificationsController, StudentNotificationsController],
  exports: [NotificationsService],
  imports: [AuthModule],
  providers: [
    NotificationsService,
    NotificationsExceptionFilter,
    { provide: NOTIFICATION_REPOSITORY, useClass: PostgresNotificationsRepository },
  ],
})
export class NotificationsModule {}
