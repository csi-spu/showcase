import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { SupabaseAdminAuthAdapter } from '../auth/infrastructure/supabase-admin-auth.adapter';
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
      inject: [ConfigService],
      provide: ACCOUNT_PASSWORD_PROVIDER,
      useFactory: (config: ConfigService) =>
        new SupabaseAdminAuthAdapter({
          baseUrl: config.getOrThrow<string>('SUPABASE_URL'),
          secretKey: config.getOrThrow<string>('SUPABASE_SECRET_KEY'),
          timeoutMilliseconds: config.getOrThrow<number>('SUPABASE_AUTH_TIMEOUT_MS'),
        }),
    },
  ],
  exports: [AccountControlsService],
})
export class AccountControlsModule {}
