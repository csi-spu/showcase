import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import {
  COLLECTION_FILE_INSPECTOR,
  COLLECTION_FILE_STORAGE,
  COLLECTION_FORMS_REPOSITORY,
  type CollectionFileStorage,
} from './application/collection-forms.ports';
import { CollectionFormsService } from './application/collection-forms.service';
import { PostgresCollectionFormsRepository } from './infrastructure/postgres-collection-forms.repository';
import { SelfHostedCollectionFileStorage } from './infrastructure/self-hosted-collection-file.storage';
import { StructuralCollectionFileInspector } from './infrastructure/structural-collection-file.inspector';
import { UnavailableCollectionFileStorage } from './infrastructure/unavailable-collection-file.storage';
import { CollectionFormsExceptionFilter } from './transport/collection-forms-exception.filter';
import { InstructorCollectionFormsController } from './transport/instructor-collection-forms.controller';
import { StudentCollectionFormsController } from './transport/student-collection-forms.controller';
import { StudentCollectionNotificationsController } from './transport/student-collection-notifications.controller';

@Module({
  controllers: [
    InstructorCollectionFormsController,
    StudentCollectionFormsController,
    StudentCollectionNotificationsController,
  ],
  imports: [AuthModule],
  providers: [
    CollectionFormsService,
    CollectionFormsExceptionFilter,
    { provide: COLLECTION_FORMS_REPOSITORY, useClass: PostgresCollectionFormsRepository },
    { provide: COLLECTION_FILE_INSPECTOR, useClass: StructuralCollectionFileInspector },
    {
      inject: [ConfigService],
      provide: COLLECTION_FILE_STORAGE,
      useFactory: (config: ConfigService): CollectionFileStorage => {
        /*
         * Without a configured media service there is no private storage, so the
         * null object refuses every call. Uploads fail loudly rather than
         * appearing to succeed against a store that does not exist.
         */
        const serviceUrl = config.get<string>('MEDIA_SERVICE_URL');
        const signingSecret = config.get<string>('MEDIA_SERVICE_HMAC_SECRET');
        if (serviceUrl === undefined || signingSecret === undefined) {
          return new UnavailableCollectionFileStorage();
        }
        const publicMediaOrigin = config.getOrThrow<string>('PUBLIC_MEDIA_ORIGIN');
        return new SelfHostedCollectionFileStorage(serviceUrl, publicMediaOrigin, signingSecret);
      },
    },
  ],
})
export class CollectionFormsModule {}
