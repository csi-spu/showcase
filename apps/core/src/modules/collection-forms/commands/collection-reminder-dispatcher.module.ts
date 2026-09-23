import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnvironment } from '../../../config/environment.schema';
import { CollectionFormsModule } from '../collection-forms.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['apps/core/.env', '.env'],
      isGlobal: true,
      validate: parseEnvironment,
    }),
    CollectionFormsModule,
  ],
})
export class CollectionReminderDispatcherModule {}
