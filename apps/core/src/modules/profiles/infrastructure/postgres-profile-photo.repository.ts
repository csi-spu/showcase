import { Injectable } from '@nestjs/common';
import type {
  ProfilePhotoContentType,
  ProfilePhotoRepository,
  ProfilePhotoUpload,
} from '../application/profile-photo.ports';
import { DatabaseClient } from '../../auth/infrastructure/database.client';

interface UploadRow {
  created_at: Date;
  declared_byte_size: number;
  declared_content_type: ProfilePhotoContentType;
  expires_at: Date;
  id: string;
  person_id: string;
  quarantine_object_key: string;
  status: 'pending_upload' | 'processing' | 'ready';
}

interface ObjectKeyRow {
  sanitized_object_key: string;
}

@Injectable()
export class PostgresProfilePhotoRepository implements ProfilePhotoRepository {
  constructor(private readonly database: DatabaseClient) {}

  async createUpload(input: {
    actorAccountId: string;
    byteSize: number;
    contentType: ProfilePhotoContentType;
    createdAt: Date;
    expiresAt: Date;
    quarantineObjectKey: string;
    uploadId: string;
  }): Promise<boolean> {
    const rows = await this.database.sql<{ id: string }[]>`
      insert into private.profile_photo_assets (
        id,
        person_id,
        status,
        quarantine_object_key,
        declared_content_type,
        declared_byte_size,
        created_at,
        updated_at,
        expires_at
      )
      select
        ${input.uploadId},
        account.person_id,
        'pending_upload',
        ${input.quarantineObjectKey},
        ${input.contentType},
        ${input.byteSize},
        ${input.createdAt},
        ${input.createdAt},
        ${input.expiresAt}
      from public.accounts as account
      where account.id = ${input.actorAccountId}
      returning id
    `;
    return rows[0] !== undefined;
  }

  async claimUpload(input: {
    actorAccountId: string;
    now: Date;
    uploadId: string;
  }): Promise<ProfilePhotoUpload | null> {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<UploadRow[]>`
        select
          photo.id,
          photo.person_id,
          photo.quarantine_object_key,
          photo.declared_content_type,
          photo.declared_byte_size,
          photo.created_at,
          photo.expires_at,
          photo.status
        from private.profile_photo_assets as photo
        join public.accounts as account on account.person_id = photo.person_id
        where photo.id = ${input.uploadId}
          and account.id = ${input.actorAccountId}
          and (
            photo.status = 'ready'
            or (
              photo.expires_at > ${input.now}
              and (
                photo.status = 'pending_upload'
                or (
                  photo.status = 'processing'
                  and photo.updated_at <= ${input.now} - interval '5 minutes'
                )
              )
            )
          )
        for update of photo
      `;
      const row = rows[0];
      if (row === undefined) {
        return null;
      }
      if (row.status !== 'ready') {
        await transaction`
          update private.profile_photo_assets
          set status = 'processing', updated_at = ${input.now}
          where id = ${input.uploadId}
        `;
      }
      return {
        byteSize: row.declared_byte_size,
        contentType: row.declared_content_type,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        personId: row.person_id,
        quarantineObjectKey: row.quarantine_object_key,
        status: row.status === 'ready' ? 'ready' : 'processing',
        uploadId: row.id,
      };
    });
  }

  async findPrivatePhotoObjectKey(actorAccountId: string): Promise<string | null> {
    const rows = await this.database.sql<ObjectKeyRow[]>`
      select photo.sanitized_object_key
      from public.accounts as account
      join public.public_profiles as profile on profile.person_id = account.person_id
      join private.profile_photo_assets as photo
        on photo.id = profile.photo_id and photo.status = 'ready'
      where account.id = ${actorAccountId}
      limit 1
    `;
    return rows[0]?.sanitized_object_key ?? null;
  }

  async findPublicPhotoObjectKey(publicId: string): Promise<string | null> {
    const rows = await this.database.sql<ObjectKeyRow[]>`
      select photo.sanitized_object_key
      from public.public_profiles as profile
      join public.profile_consents as consent
        on consent.person_id = profile.person_id and consent.withdrawn_at is null
      join private.profile_photo_assets as photo
        on photo.id = profile.photo_id and photo.status = 'ready'
      where profile.public_id = ${publicId}
      limit 1
    `;
    return rows[0]?.sanitized_object_key ?? null;
  }

  async completeUpload(input: {
    byteSize: number;
    contentType: ProfilePhotoContentType;
    height: number;
    now: Date;
    sanitizedObjectKey: string;
    uploadId: string;
    width: number;
  }): Promise<void> {
    const rows = await this.database.sql<{ id: string }[]>`
      update private.profile_photo_assets
      set status = 'ready',
          sanitized_object_key = ${input.sanitizedObjectKey},
          inspected_content_type = ${input.contentType},
          inspected_byte_size = ${input.byteSize},
          width = ${input.width},
          height = ${input.height},
          updated_at = ${input.now}
      where id = ${input.uploadId} and status = 'processing'
      returning id
    `;
    if (rows[0] === undefined) {
      throw new Error('PROFILE_PHOTO_COMPLETE_CONFLICT');
    }
  }

  async rejectUpload(input: {
    now: Date;
    rejectionCode: 'invalid_profile_photo';
    uploadId: string;
  }): Promise<void> {
    await this.database.sql`
      update private.profile_photo_assets
      set status = 'rejected',
          rejection_code = ${input.rejectionCode},
          updated_at = ${input.now}
      where id = ${input.uploadId} and status = 'processing'
    `;
  }

  async releaseUpload(input: { now: Date; uploadId: string }): Promise<void> {
    await this.database.sql`
      update private.profile_photo_assets
      set status = 'pending_upload', updated_at = ${input.now}
      where id = ${input.uploadId} and status = 'processing'
    `;
  }
}
