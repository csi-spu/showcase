import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AuthModule } from '../auth/auth.module';
import { DatabaseClient } from '../auth/infrastructure/database.client';
import {
  PROFILES_CLOCK,
  PROFILES_REPOSITORY,
  type ProfilesClock,
} from './application/profiles.ports';
import { ProfilesService } from './application/profiles.service';
import {
  PROFILE_PHOTO_CLOCK,
  PROFILE_PHOTO_ID_GENERATOR,
  PROFILE_PHOTO_INSPECTOR,
  PROFILE_PHOTO_REPOSITORY,
  PROFILE_PHOTO_STORAGE,
  type ProfilePhotoClock,
  type ProfilePhotoStorage,
} from './application/profile-photo.ports';
import { ProfilePhotoService } from './application/profile-photo.service';
import { PostgresProfilePhotoRepository } from './infrastructure/postgres-profile-photo.repository';
import { PostgresProfilesRepository } from './infrastructure/postgres-profiles.repository';
import { SelfHostedProfilePhotoStorage } from './infrastructure/self-hosted-profile-photo.storage';
import { SharpProfilePhotoInspector } from './infrastructure/sharp-profile-photo.inspector';
import { UnavailableProfilePhotoStorage } from './infrastructure/unavailable-profile-photo.storage';
import { ProfilesExceptionFilter } from './transport/profiles-exception.filter';
import { PublicProfilesController } from './transport/public-profiles.controller';
import { StudentProfilesController } from './transport/student-profiles.controller';

@Module({
  controllers: [PublicProfilesController, StudentProfilesController],
  imports: [AuthModule],
  providers: [
    DatabaseClient,
    ProfilePhotoService,
    ProfilesService,
    ProfilesExceptionFilter,
    { provide: PROFILES_REPOSITORY, useClass: PostgresProfilesRepository },
    { provide: PROFILE_PHOTO_REPOSITORY, useClass: PostgresProfilePhotoRepository },
    { provide: PROFILE_PHOTO_INSPECTOR, useClass: SharpProfilePhotoInspector },
    {
      inject: [ConfigService],
      provide: PROFILE_PHOTO_STORAGE,
      useFactory: (config: ConfigService): ProfilePhotoStorage => {
        const serviceUrl = config.get<string>('MEDIA_SERVICE_URL');
        const signingSecret = config.get<string>('MEDIA_SERVICE_HMAC_SECRET');
        if (serviceUrl === undefined || signingSecret === undefined) {
          return new UnavailableProfilePhotoStorage();
        }
        const publicMediaOrigin = config.getOrThrow<string>('PUBLIC_MEDIA_ORIGIN');
        return new SelfHostedProfilePhotoStorage(serviceUrl, publicMediaOrigin, signingSecret);
      },
    },
    {
      provide: PROFILE_PHOTO_CLOCK,
      useValue: { now: () => new Date() } satisfies ProfilePhotoClock,
    },
    { provide: PROFILE_PHOTO_ID_GENERATOR, useValue: { generate: () => randomUUID() } },
    {
      provide: PROFILES_CLOCK,
      useValue: { now: () => new Date() } satisfies ProfilesClock,
    },
  ],
})
export class ProfilesModule {}
