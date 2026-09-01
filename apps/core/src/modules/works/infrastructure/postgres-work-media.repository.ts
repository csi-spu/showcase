import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type { PrismaSql } from '../../auth/infrastructure/prisma-sql';
import type {
  WorkMediaContentType,
  WorkMediaExtension,
  WorkMediaKind,
  WorkMediaRepository,
  WorkMediaStatus,
  WorkMediaUpload,
  WorkMediaWarning,
} from '../application/work-media.ports';

interface AssetRow {
  declared_byte_size: number;
  declared_content_type: WorkMediaContentType;
  declared_extension: WorkMediaExtension;
  id: string;
  media_kind: WorkMediaKind;
  quarantine_object_key: string;
  status: WorkMediaStatus;
  expires_at?: Date;
}

@Injectable()
export class PostgresWorkMediaRepository implements WorkMediaRepository {
  constructor(private readonly database: DatabaseClient) {}

  async authorizeUpload(input: {
    actorAccountId: string;
    assetId: string;
    byteSize: number;
    contentType: WorkMediaContentType;
    createdAt: Date;
    expiresAt: Date;
    fileExtension: WorkMediaExtension;
    idempotencyKey: string;
    mediaKind: WorkMediaKind;
    publicId: string;
    quarantineObjectKey: string;
  }): ReturnType<WorkMediaRepository['authorizeUpload']> {
    const rows = await this.database.sql<AssetRow[]>`
      insert into private.work_media_assets (
        id, work_id, media_kind, status, quarantine_object_key, authorize_idempotency_key,
        declared_content_type, declared_extension, declared_byte_size, created_at, updated_at, expires_at
      )
      select
        ${input.assetId}, work.id, ${input.mediaKind}, 'pending_upload', ${input.quarantineObjectKey},
        ${input.idempotencyKey}, ${input.contentType}, ${input.fileExtension}, ${input.byteSize},
        ${input.createdAt}, ${input.createdAt}, ${input.expiresAt}
      from public.works as work
      join public.accounts as account on account.person_id = work.submitter_person_id
      join private.work_drafts as draft
        on draft.work_id = work.id and draft.lifecycle_state = 'active'
      where account.id = ${input.actorAccountId}
        and work.public_id = ${input.publicId}
        and work.activity_state = 'active'
      on conflict (work_id, authorize_idempotency_key) do nothing
      returning id, declared_byte_size, declared_content_type, declared_extension, media_kind,
        quarantine_object_key, status, expires_at
    `;
    if (rows[0] !== undefined) return { outcome: 'created', upload: this.mapAsset(rows[0]) };
    const existing = await this.database.sql<AssetRow[]>`
      select asset.id, asset.declared_byte_size, asset.declared_content_type,
        asset.declared_extension, asset.media_kind, asset.quarantine_object_key, asset.status,
        asset.expires_at
      from private.work_media_assets as asset
      join public.works as work on work.id = asset.work_id
      join public.accounts as account on account.person_id = work.submitter_person_id
      join private.work_drafts as draft
        on draft.work_id = work.id and draft.lifecycle_state = 'active'
      where account.id = ${input.actorAccountId}
        and work.public_id = ${input.publicId}
        and asset.authorize_idempotency_key = ${input.idempotencyKey}
      limit 1
    `;
    const replay = existing[0];
    if (replay === undefined) return null;
    if (
      replay.declared_byte_size !== input.byteSize ||
      replay.declared_content_type !== input.contentType ||
      replay.declared_extension !== input.fileExtension ||
      replay.media_kind !== input.mediaKind ||
      replay.status !== 'pending_upload' ||
      replay.expires_at === undefined ||
      replay.expires_at <= input.createdAt
    ) {
      return { outcome: 'idempotency_conflict' };
    }
    return { outcome: 'replayed', upload: this.mapAsset(replay) };
  }

  async markUploaded(input: {
    actorAccountId: string;
    assetId: string;
    now: Date;
    publicId: string;
  }): Promise<{ assetId: string; status: WorkMediaStatus } | null> {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<AssetRow[]>`
        select asset.id, asset.declared_byte_size, asset.declared_content_type,
          asset.declared_extension, asset.media_kind, asset.quarantine_object_key, asset.status
        from private.work_media_assets as asset
        join public.works as work on work.id = asset.work_id
        join public.accounts as account on account.person_id = work.submitter_person_id
        join private.work_drafts as draft
          on draft.work_id = work.id and draft.lifecycle_state = 'active'
        where asset.id = ${input.assetId}
          and work.public_id = ${input.publicId}
          and account.id = ${input.actorAccountId}
          and work.activity_state = 'active'
        for update of asset
      `;
      const asset = rows[0];
      if (asset === undefined) return null;
      if (asset.status === 'pending_upload') {
        if (await this.isExpired(transaction, input.assetId, input.now)) return null;
        await transaction`
          update private.work_media_assets
          set status = 'uploaded', updated_at = ${input.now}
          where id = ${input.assetId} and status = 'pending_upload'
        `;
        return { assetId: input.assetId, status: 'uploaded' };
      }
      return { assetId: input.assetId, status: asset.status };
    });
  }

  async findUploadStatus(input: {
    actorAccountId: string;
    assetId: string;
    publicId: string;
  }): ReturnType<WorkMediaRepository['findUploadStatus']> {
    const rows = await this.database.sql<
      Array<{
        height: number | null;
        id: string;
        master_object_key: string | null;
        rejection_code: 'expired' | 'invalid_media' | 'processing_failed' | null;
        status: WorkMediaStatus;
        warnings: WorkMediaWarning[];
        width: number | null;
      }>
    >`
      select asset.id, asset.status, asset.master_object_key, asset.width, asset.height,
        asset.rejection_code, asset.warnings
      from private.work_media_assets as asset
      join public.works as work on work.id = asset.work_id
      join public.accounts as account on account.person_id = work.submitter_person_id
      join private.work_drafts as draft
        on draft.work_id = work.id and draft.lifecycle_state = 'active'
      where asset.id = ${input.assetId}
        and work.public_id = ${input.publicId}
        and account.id = ${input.actorAccountId}
        and work.activity_state = 'active'
      limit 1
    `;
    const row = rows[0];
    return row === undefined
      ? null
      : {
          assetId: row.id,
          height: row.height,
          masterObjectKey: row.master_object_key,
          rejectionCode: row.rejection_code,
          status: row.status,
          warnings: row.warnings,
          width: row.width,
        };
  }

  async findPrivateVariantObjectKey(input: {
    actorAccountId: string;
    assetId: string;
    publicId: string;
    width: number;
  }): Promise<string | null> {
    const rows = await this.database.sql<Array<{ object_key: string }>>`
      select variant.object_key
      from private.work_media_variants as variant
      join private.work_media_assets as asset on asset.id = variant.asset_id
      join public.works as work on work.id = asset.work_id
      join public.accounts as account on account.person_id = work.submitter_person_id
      where asset.id = ${input.assetId}
        and asset.status = 'ready'
        and variant.width = ${input.width}
        and work.public_id = ${input.publicId}
        and account.id = ${input.actorAccountId}
        and (
          exists (
            select 1 from private.work_draft_media as draft_media
            where draft_media.asset_id = asset.id and draft_media.work_id = work.id
          )
          or exists (
            select 1 from private.work_revision_media as revision_media
            join private.work_revisions as revision on revision.id = revision_media.revision_id
            where revision_media.asset_id = asset.id and revision.work_id = work.id
          )
        )
      limit 1
    `;
    return rows[0]?.object_key ?? null;
  }

  async claimNext(now: Date): Promise<WorkMediaUpload | null> {
    return this.database.sql.begin(async (transaction) => {
      await transaction`set local statement_timeout = '5s'`;
      const rows = await transaction<AssetRow[]>`
        select id, declared_byte_size, declared_content_type, declared_extension, media_kind,
          quarantine_object_key, status
        from private.work_media_assets
        where expires_at > ${now}
          and (status = 'uploaded' or (status = 'processing' and processing_started_at <= ${now} - interval '5 minutes'))
        order by created_at, id
        limit 1
        for update skip locked
      `;
      const asset = rows[0];
      if (asset === undefined) return null;
      await transaction`
        update private.work_media_assets
        set status = 'processing', processing_attempts = processing_attempts + 1,
          processing_started_at = ${now}, updated_at = ${now}
        where id = ${asset.id}
      `;
      return { ...this.mapAsset(asset), status: 'processing' };
    });
  }

  async completeProcessing(input: {
    assetId: string;
    byteSize: number;
    contentHash: Buffer;
    dominantColor: string;
    expiresAt: Date;
    height: number;
    masterObjectKey: string;
    now: Date;
    variants: Array<{
      byteSize: number;
      contentHash: Buffer;
      height: number;
      objectKey: string;
      width: number;
    }>;
    warnings: WorkMediaWarning[];
    width: number;
  }): Promise<void> {
    await this.database.sql.begin(async (transaction) => {
      const rows = await transaction<{ id: string }[]>`
        update private.work_media_assets
        set status = 'ready', master_object_key = ${input.masterObjectKey}, inspected_byte_size = ${input.byteSize},
          width = ${input.width}, height = ${input.height}, content_hash = ${input.contentHash},
          dominant_color = ${input.dominantColor}, warnings = ${input.warnings},
          expires_at = ${input.expiresAt}, updated_at = ${input.now}, processing_started_at = null
        where id = ${input.assetId} and status = 'processing'
        returning id
      `;
      if (rows[0] === undefined) throw new Error('WORK_MEDIA_COMPLETE_CONFLICT');
      for (const variant of input.variants) {
        await transaction`
          insert into private.work_media_variants (asset_id, width, height, byte_size, content_hash, object_key)
          values (${input.assetId}, ${variant.width}, ${variant.height}, ${variant.byteSize}, ${variant.contentHash}, ${variant.objectKey})
        `;
      }
    });
  }

  async rejectProcessing(input: {
    assetId: string;
    now: Date;
    rejectionCode: 'invalid_media';
  }): Promise<void> {
    await this.database.sql`
      update private.work_media_assets
      set status = 'rejected', rejection_code = ${input.rejectionCode}, updated_at = ${input.now}, processing_started_at = null
      where id = ${input.assetId} and status = 'processing'
    `;
  }

  async releaseProcessing(input: { assetId: string; now: Date }): Promise<{ isRejected: boolean }> {
    const rows = await this.database.sql<{ status: WorkMediaStatus }[]>`
      update private.work_media_assets
      set status = case when processing_attempts >= 3 then 'rejected' else 'uploaded' end,
        rejection_code = case when processing_attempts >= 3 then 'processing_failed' else null end,
        updated_at = ${input.now}, processing_started_at = null
      where id = ${input.assetId} and status = 'processing'
      returning status
    `;
    return { isRejected: rows[0]?.status === 'rejected' };
  }

  async claimExpired(now: Date): Promise<{ assetId: string; objectKeys: string[] } | null> {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<
        Array<{
          id: string;
          master_object_key: string | null;
          media_kind: WorkMediaKind;
          quarantine_object_key: string;
          status: WorkMediaStatus;
        }>
      >`
        select asset.id, asset.master_object_key, asset.media_kind, asset.quarantine_object_key,
          asset.status
        from private.work_media_assets as asset
        where asset.expires_at <= ${now}
          and (asset.cleanup_started_at is null or asset.cleanup_started_at <= ${now} - interval '5 minutes')
          and (
            asset.status in ('pending_upload', 'uploaded', 'rejected')
            or (asset.status = 'processing' and asset.processing_started_at <= ${now} - interval '5 minutes')
            or (
              asset.status = 'ready'
              and not exists (
                select 1 from private.work_draft_media as draft_media
                where draft_media.asset_id = asset.id
              )
              and not exists (
                select 1 from private.work_revision_media as revision_media
                where revision_media.asset_id = asset.id
              )
            )
          )
        order by asset.expires_at, asset.id
        limit 1
        for update of asset skip locked
      `;
      const asset = rows[0];
      if (asset === undefined) return null;
      await transaction`
        update private.work_media_assets set cleanup_started_at = ${now}, updated_at = ${now}
        where id = ${asset.id}
      `;
      if (asset.status !== 'ready') {
        const variantWidths = asset.media_kind === 'poster' ? [480, 768, 1200] : [640, 1280, 1920];
        return {
          assetId: asset.id,
          objectKeys: [
            asset.quarantine_object_key,
            `work-media/${asset.id}/master.webp`,
            ...variantWidths.map((width) => `work-media/${asset.id}/${width}.webp`),
          ],
        };
      }
      const variants = await transaction<{ object_key: string }[]>`
        select object_key from private.work_media_variants
        where asset_id = ${asset.id} order by width
      `;
      if (asset.master_object_key === null) throw new Error('WORK_MEDIA_READY_WITHOUT_MASTER');
      return {
        assetId: asset.id,
        objectKeys: [asset.master_object_key, ...variants.map((variant) => variant.object_key)],
      };
    });
  }

  async completeCleanup(input: { assetId: string; now: Date }): Promise<boolean> {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<{ id: string }[]>`
        select asset.id from private.work_media_assets as asset
        where asset.id = ${input.assetId}
          and asset.cleanup_started_at is not null
          and not exists (
            select 1 from private.work_draft_media as draft_media
            where draft_media.asset_id = asset.id
          )
          and not exists (
            select 1 from private.work_revision_media as revision_media
            where revision_media.asset_id = asset.id
          )
        for update of asset
      `;
      if (rows[0] === undefined) return false;
      await transaction`delete from private.work_media_variants where asset_id = ${input.assetId}`;
      const deleted = await transaction<{ id: string }[]>`
        delete from private.work_media_assets where id = ${input.assetId} returning id
      `;
      return deleted[0] !== undefined;
    });
  }

  async releaseCleanup(input: { assetId: string; now: Date }): Promise<void> {
    await this.database.sql`
      update private.work_media_assets
      set cleanup_started_at = null, updated_at = ${input.now}
      where id = ${input.assetId} and cleanup_started_at is not null
    `;
  }

  async attachReadyMedia(input: {
    actorAccountId: string;
    assetId: string;
    expectedVersion: number;
    idempotencyKey: string;
    mediaKind: WorkMediaKind;
    now: Date;
    publicId: string;
  }): Promise<
    | { outcome: 'attached'; version: number }
    | {
        outcome:
          | 'gallery_full'
          | 'idempotency_conflict'
          | 'not_found'
          | 'not_ready'
          | 'pending_revision_exists'
          | 'version_conflict';
      }
  > {
    return this.database.sql.begin(async (transaction) => {
      await transaction`select 1 from (select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}::text, 0))) as advisory_lock`;
      const payload = {
        assetId: input.assetId,
        expectedVersion: input.expectedVersion,
        mediaKind: input.mediaKind,
        publicId: input.publicId,
      };
      const replay = await transaction<
        Array<{ is_equivalent: boolean; resulting_version: string }>
      >`
        select (actor_account_id = ${input.actorAccountId}
          and operation = 'work_media_attached'
          and request_payload = ${transaction.json(payload)}) as is_equivalent,
          resulting_version
        from private.work_operations
        where idempotency_key = ${input.idempotencyKey}
        limit 1
      `;
      if (replay[0] !== undefined) {
        return replay[0].is_equivalent
          ? { outcome: 'attached', version: Number(replay[0].resulting_version) }
          : { outcome: 'idempotency_conflict' };
      }
      const works = await transaction<Array<{ version: string; work_id: string }>>`
        select draft.version, work.id as work_id
        from public.works as work
        join public.accounts as account on account.person_id = work.submitter_person_id
        join private.work_drafts as draft
          on draft.work_id = work.id and draft.lifecycle_state = 'active'
        where work.public_id = ${input.publicId}
          and account.id = ${input.actorAccountId}
          and work.activity_state = 'active'
        for update of work, draft
      `;
      const work = works[0];
      if (work === undefined) return { outcome: 'not_found' };
      const pending = await transaction<Array<{ exists: boolean }>>`
        select exists(
          select 1 from private.work_revisions
          where work_id = ${work.work_id} and status = 'pending_review'
        ) as exists
      `;
      if (pending[0]?.exists === true) return { outcome: 'pending_revision_exists' };
      if (Number(work.version) !== input.expectedVersion) return { outcome: 'version_conflict' };
      const assets = await transaction<
        Array<{
          cleanup_started_at: Date | null;
          is_attached: boolean;
          media_kind: WorkMediaKind;
          status: WorkMediaStatus;
          work_id: string;
        }>
      >`
        select asset.work_id, asset.media_kind, asset.status, asset.cleanup_started_at,
          exists (
            select 1 from private.work_draft_media as draft_media
            where draft_media.asset_id = asset.id
          ) as is_attached
        from private.work_media_assets as asset where asset.id = ${input.assetId} for update
      `;
      const asset = assets[0];
      if (
        asset === undefined ||
        asset.work_id !== work.work_id ||
        asset.media_kind !== input.mediaKind
      )
        return { outcome: 'not_found' };
      if (asset.status === 'rejected' || asset.cleanup_started_at !== null || asset.is_attached)
        return { outcome: 'not_ready' };
      let position = 1;
      if (input.mediaKind === 'poster') {
        await transaction`delete from private.work_draft_media where work_id = ${work.work_id} and media_kind = 'poster'`;
      } else {
        const positions = await transaction<{ position: number }[]>`
          select position from private.work_draft_media
          where work_id = ${work.work_id} and media_kind = 'gallery'
          order by position for update
        `;
        if (positions.length >= 3) return { outcome: 'gallery_full' };
        position = (positions.at(-1)?.position ?? 0) + 1;
      }
      await transaction`
        insert into private.work_draft_media (work_id, media_kind, position, asset_id, created_at)
        values (${work.work_id}, ${input.mediaKind}, ${position}, ${input.assetId}, ${input.now})
      `;
      const version = input.expectedVersion + 1;
      await transaction`update private.work_drafts set version = ${version}, updated_at = ${input.now} where work_id = ${work.work_id}`;
      await transaction`
        update public.works set version = version + 1, updated_at = ${input.now}
        where id = ${work.work_id}
      `;
      await transaction`
        insert into private.work_operations (
          idempotency_key, actor_account_id, work_id, operation, request_payload,
          resulting_version, occurred_at
        ) values (
          ${input.idempotencyKey}, ${input.actorAccountId}, ${work.work_id},
          'work_media_attached', ${transaction.json(payload)}, ${version}, ${input.now}
        )
      `;
      return { outcome: 'attached', version };
    });
  }

  private async isExpired(sql: PrismaSql, assetId: string, now: Date): Promise<boolean> {
    const rows = await sql<{ is_expired: boolean }[]>`
      select expires_at <= ${now} as is_expired from private.work_media_assets where id = ${assetId}
    `;
    return rows[0]?.is_expired ?? true;
  }

  private mapAsset(row: AssetRow): WorkMediaUpload {
    return {
      assetId: row.id,
      byteSize: row.declared_byte_size,
      contentType: row.declared_content_type,
      fileExtension: row.declared_extension,
      mediaKind: row.media_kind,
      quarantineObjectKey: row.quarantine_object_key,
      status: row.status,
    };
  }
}
