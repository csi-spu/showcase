import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  BetterAuthAdminProvisioningProvider,
  BetterAuthEngine,
} from '../auth/infrastructure/better-auth.adapter';
import {
  ACCOUNT_CONTROLS_REPOSITORY,
  ACCOUNT_PASSWORD_PROVIDER,
} from './application/account-controls.ports';
import { AccountControlsService } from './application/account-controls.service';
import { PostgresAccountControlsRepository } from './infrastructure/postgres-account-controls.repository';
import { AdminAccountControlsController } from './transport/admin-account-controls.controller';
import { AccountControlsExceptionFilter } from './transport/account-controls-exception.filter';

@Module({
  controllers: [AdminAccountControlsController],
  imports: [AuthModule],
  providers: [
    AccountControlsService,
    AccountControlsExceptionFilter,
    { provide: ACCOUNT_CONTROLS_REPOSITORY, useClass: PostgresAccountControlsRepository },
    {
      provide: ACCOUNT_PASSWORD_PROVIDER,
      useFactory: (engine: BetterAuthEngine) => new BetterAuthAdminProvisioningProvider(engine),
      inject: [BetterAuthEngine],
    },
  ],
  exports: [AccountControlsService],
})
export class AccountControlsModule {}
