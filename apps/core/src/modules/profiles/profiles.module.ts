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
import { R2ProfilePhotoStorage } from './infrastructure/r2-profile-photo.storage';
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
        const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
        const bucket = config.get<string>('R2_BUCKET_NAME');
        const endpoint = config.get<string>('R2_ENDPOINT');
        const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
        if (
          accessKeyId === undefined ||
          bucket === undefined ||
          endpoint === undefined ||
          secretAccessKey === undefined
        ) {
          return new UnavailableProfilePhotoStorage();
        }
        return new R2ProfilePhotoStorage({
          accessKeyId,
          bucket,
          endpoint,
          secretAccessKey,
          timeoutMilliseconds: config.getOrThrow<number>('R2_TIMEOUT_MS'),
        });
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
