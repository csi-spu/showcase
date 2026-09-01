import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type postgres from 'postgres';
import type {
  PrivateProfileState,
  PrivatePublicProfile,
  ProfileMutationResult,
  ProfilePhotoView,
  ProfilesRepository,
  PublicProfileView,
} from '../application/profiles.ports';
import type { PublicProfileDraftInput } from '../domain/public-profile-policy';
import { DatabaseClient } from '../../auth/infrastructure/database.client';

interface ProfileRow {
  bio: string | null;
  consent_granted_at: Date | null;
  consent_text_version: string | null;
  entry_year: number;
  first_name_th: string;
  last_name_th: string;
  photo_height: number | null;
  photo_id: string | null;
  photo_object_key: string | null;
  photo_width: number | null;
  profile_links: LinkRow[];
  public_id: string;
  version: string;
}

interface PrivateProfileRow {
  bio: string | null;
  consent_granted_at: Date | null;
  consent_text_version: string | null;
  entry_year: number;
  first_name_th: string;
  last_name_th: string;
  photo_height: number | null;
  photo_id: string | null;
  photo_object_key: string | null;
  photo_width: number | null;
  profile_links: LinkRow[];
  public_id: string | null;
  version: string | null;
}

interface LinkRow {
  label: string;
  url: string;
}

interface PhotoRow {
  photo_height: number | null;
  photo_object_key: string | null;
  photo_width: number | null;
}

interface PersonRow {
  entry_year: number;
  person_id: string;
}

interface VersionRow {
  public_id: string;
  version: string;
}

type ProfileOperation = 'profile_consent_granted' | 'profile_consent_withdrawn' | 'profile_updated';

@Injectable()
export class PostgresProfilesRepository implements ProfilesRepository {
  private readonly publicMediaOrigin: string;

  constructor(
    private readonly database: DatabaseClient,
    config: ConfigService,
  ) {
    this.publicMediaOrigin = config.get<string>('PUBLIC_MEDIA_ORIGIN') ?? 'https://media.invalid';
  }

  async findPrivateProfile(accountId: string): Promise<PrivateProfileState | null> {
    const rows = await this.database.sql<PrivateProfileRow[]>`
      select
        profile.public_id,
        profile.bio,
        profile.version,
        profile.photo_id,
        student.entry_year,
        name.first_name_th,
        name.last_name_th,
        consent.consent_text_version,
        consent.granted_at as consent_granted_at,
        photo.sanitized_object_key as photo_object_key,
        photo.width as photo_width,
        photo.height as photo_height,
        coalesce((
          select jsonb_agg(
            jsonb_build_object('label', link.label, 'url', link.url)
            order by link.position
          )
          from public.public_profile_links as link
          where link.person_id = profile.person_id
        ), '[]'::jsonb) as profile_links
      from public.accounts as account
      join public.students as student on student.person_id = account.person_id
      join private.person_names as name on name.person_id = account.person_id
      left join public.public_profiles as profile on profile.person_id = account.person_id
      left join public.profile_consents as consent
        on consent.person_id = profile.person_id and consent.withdrawn_at is null
      left join private.profile_photo_assets as photo
        on photo.id = profile.photo_id and photo.status = 'ready'
      where account.id = ${accountId}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) return null;
    return {
      entryYear: row.entry_year,
      firstName: row.first_name_th,
      lastName: row.last_name_th,
      profile: this.mapPrivateProfile(row),
    };
  }

  async findPublicProfile(publicId: string): Promise<PublicProfileView | null> {
    const rows = await this.database.sql<ProfileRow[]>`
      select
        profile.public_id,
        profile.bio,
        profile.version,
        profile.photo_id,
        student.entry_year,
        name.first_name_th,
        name.last_name_th,
        consent.consent_text_version,
        consent.granted_at as consent_granted_at,
        photo.sanitized_object_key as photo_object_key,
        photo.width as photo_width,
        photo.height as photo_height,
        coalesce((
          select jsonb_agg(
            jsonb_build_object('label', link.label, 'url', link.url)
            order by link.position
          )
          from public.public_profile_links as link
          where link.person_id = profile.person_id
        ), '[]'::jsonb) as profile_links
      from public.public_profiles as profile
      join public.students as student on student.person_id = profile.person_id
      join private.person_names as name on name.person_id = profile.person_id
      join public.profile_consents as consent
        on consent.person_id = profile.person_id and consent.withdrawn_at is null
      left join private.profile_photo_assets as photo
        on photo.id = profile.photo_id and photo.status = 'ready'
      where profile.public_id = ${publicId}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      bio: row.bio,
      entryYear: row.entry_year,
      firstName: row.first_name_th,
      lastName: row.last_name_th,
      links: row.profile_links,
      photo: this.mapPhoto(row),
      publicId: row.public_id,
    };
  }

  async updateProfile(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    profile: PublicProfileDraftInput;
  }): Promise<ProfileMutationResult> {
    return this.database.sql.begin(async (transaction) => {
      const requestPayload: postgres.JSONValue = {
        expectedVersion: input.expectedVersion,
        profile: {
          bio: input.profile.bio,
          links: input.profile.links.map((link) => ({ label: link.label, url: link.url })),
          photoId: input.profile.photoId,
        },
      };
      const replay = await this.resolveReplay(
        transaction,
        input.idempotencyKey,
        'profile_updated',
        requestPayload,
      );
      if (replay !== null) {
        return replay;
      }

      const person = await this.findPerson(transaction, input.actorAccountId);
      if (person === null) {
        return { outcome: 'not_found' };
      }
      if (
        input.profile.photoId !== null &&
        !(await this.isReadyOwnedPhoto(transaction, person.person_id, input.profile.photoId))
      ) {
        return { outcome: 'not_found' };
      }

      const current = await this.lockProfile(transaction, person.person_id);
      if (
        (current === null && input.expectedVersion !== 0) ||
        (current !== null && Number(current.version) !== input.expectedVersion)
      ) {
        return { outcome: 'version_conflict' };
      }

      const resultingVersion = current === null ? 1 : input.expectedVersion + 1;
      let publicId: string;
      if (current === null) {
        const inserted = await transaction<VersionRow[]>`
          insert into public.public_profiles (
            person_id, bio, photo_id,
            version, created_at, updated_at
          ) values (
            ${person.person_id},
            ${input.profile.bio},
            ${input.profile.photoId},
            ${resultingVersion},
            ${input.now},
            ${input.now}
          )
          returning public_id, version
        `;
        const row = inserted[0];
        if (row === undefined) {
          throw new Error('PROFILE_INSERT_FAILED');
        }
        publicId = row.public_id;
      } else {
        await transaction`
          update public.public_profiles
          set bio = ${input.profile.bio},
              photo_id = ${input.profile.photoId},
              version = ${resultingVersion},
              updated_at = ${input.now}
          where person_id = ${person.person_id}
        `;
        publicId = current.public_id;
      }

      await transaction`
        delete from public.public_profile_links where person_id = ${person.person_id}
      `;
      for (const [index, link] of input.profile.links.entries()) {
        await transaction`
          insert into public.public_profile_links (person_id, position, label, url)
          values (${person.person_id}, ${index + 1}, ${link.label}, ${link.url})
        `;
      }

      await this.recordOperation(transaction, {
        actorAccountId: input.actorAccountId,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
        operation: 'profile_updated',
        personId: person.person_id,
        requestPayload,
        resultingVersion,
      });
      if (await this.hasActiveConsent(transaction, person.person_id)) {
        await this.recordOutbox(
          transaction,
          input.idempotencyKey,
          'public_profile_cache_invalidated',
          publicId,
          input.now,
        );
      }
      return { outcome: 'updated' };
    });
  }

  async grantConsent(input: {
    actorAccountId: string;
    consentTextVersion: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
  }): Promise<ProfileMutationResult> {
    return this.database.sql.begin(async (transaction) => {
      const requestPayload = {
        consentTextVersion: input.consentTextVersion,
        expectedVersion: input.expectedVersion,
      };
      const replay = await this.resolveReplay(
        transaction,
        input.idempotencyKey,
        'profile_consent_granted',
        requestPayload,
      );
      if (replay !== null) {
        return replay;
      }
      const person = await this.findPerson(transaction, input.actorAccountId);
      if (person === null) {
        return { outcome: 'not_found' };
      }
      const current = await this.lockProfile(transaction, person.person_id);
      if (current === null) {
        return { outcome: 'not_found' };
      }
      if (Number(current.version) !== input.expectedVersion) {
        return { outcome: 'version_conflict' };
      }
      if (await this.hasActiveConsent(transaction, person.person_id)) {
        await this.recordOperation(transaction, {
          actorAccountId: input.actorAccountId,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          now: input.now,
          operation: 'profile_consent_granted',
          personId: person.person_id,
          requestPayload,
          resultingVersion: input.expectedVersion,
        });
        return { outcome: 'unchanged' };
      }

      const resultingVersion = input.expectedVersion + 1;
      await transaction`
        insert into public.profile_consents (
          person_id, consent_text_version, granted_at
        ) values (
          ${person.person_id}, ${input.consentTextVersion}, ${input.now}
        )
      `;
      await transaction`
        update public.public_profiles
        set version = ${resultingVersion}, updated_at = ${input.now}
        where person_id = ${person.person_id}
      `;
      await this.recordOperation(transaction, {
        actorAccountId: input.actorAccountId,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
        operation: 'profile_consent_granted',
        personId: person.person_id,
        requestPayload,
        resultingVersion,
      });
      await this.recordOutbox(
        transaction,
        input.idempotencyKey,
        'public_profile_visible',
        current.public_id,
        input.now,
      );
      return { outcome: 'updated' };
    });
  }

  async withdrawConsent(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
  }): Promise<ProfileMutationResult> {
    return this.database.sql.begin(async (transaction) => {
      const requestPayload = { expectedVersion: input.expectedVersion };
      const replay = await this.resolveReplay(
        transaction,
        input.idempotencyKey,
        'profile_consent_withdrawn',
        requestPayload,
      );
      if (replay !== null) {
        return replay;
      }
      const person = await this.findPerson(transaction, input.actorAccountId);
      if (person === null) {
        return { outcome: 'not_found' };
      }
      const current = await this.lockProfile(transaction, person.person_id);
      if (current === null) {
        return { outcome: 'not_found' };
      }
      if (Number(current.version) !== input.expectedVersion) {
        return { outcome: 'version_conflict' };
      }
      const activeConsent = await transaction<{ id: string }[]>`
        select id
        from public.profile_consents
        where person_id = ${person.person_id} and withdrawn_at is null
        for update
      `;
      if (activeConsent[0] === undefined) {
        await this.recordOperation(transaction, {
          actorAccountId: input.actorAccountId,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          now: input.now,
          operation: 'profile_consent_withdrawn',
          personId: person.person_id,
          requestPayload,
          resultingVersion: input.expectedVersion,
        });
        return { outcome: 'unchanged' };
      }

      const resultingVersion = input.expectedVersion + 1;
      await transaction`
        update public.profile_consents
        set withdrawn_at = ${input.now}
        where id = ${activeConsent[0].id}
      `;
      await transaction`
        update public.public_profiles
        set version = ${resultingVersion}, updated_at = ${input.now}
        where person_id = ${person.person_id}
      `;
      await this.recordOperation(transaction, {
        actorAccountId: input.actorAccountId,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
        operation: 'profile_consent_withdrawn',
        personId: person.person_id,
        requestPayload,
        resultingVersion,
      });
      await this.recordOutbox(
        transaction,
        input.idempotencyKey,
        'public_profile_cache_invalidated',
        current.public_id,
        input.now,
      );
      return { outcome: 'updated' };
    });
  }

  private async findPerson(
    transaction: postgres.TransactionSql,
    accountId: string,
  ): Promise<PersonRow | null> {
    const rows = await transaction<PersonRow[]>`
      select account.person_id, student.entry_year
      from public.accounts as account
      join public.students as student on student.person_id = account.person_id
      where account.id = ${accountId}
      limit 1
      for update of account
    `;
    return rows[0] ?? null;
  }

  private async lockProfile(
    transaction: postgres.TransactionSql,
    personId: string,
  ): Promise<VersionRow | null> {
    const rows = await transaction<VersionRow[]>`
      select public_id, version
      from public.public_profiles
      where person_id = ${personId}
      for update
    `;
    return rows[0] ?? null;
  }

  private async hasActiveConsent(
    transaction: postgres.TransactionSql,
    personId: string,
  ): Promise<boolean> {
    const rows = await transaction<{ exists: boolean }[]>`
      select exists (
        select 1 from public.profile_consents
        where person_id = ${personId} and withdrawn_at is null
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  private async isReadyOwnedPhoto(
    transaction: postgres.TransactionSql,
    personId: string,
    photoId: string,
  ): Promise<boolean> {
    const rows = await transaction<{ exists: boolean }[]>`
      select exists (
        select 1 from private.profile_photo_assets
        where id = ${photoId} and person_id = ${personId} and status = 'ready'
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  private async resolveReplay(
    transaction: postgres.TransactionSql,
    idempotencyKey: string,
    operation: ProfileOperation,
    requestPayload: postgres.JSONValue,
  ): Promise<ProfileMutationResult | null> {
    await transaction`
      select 1
      from (select pg_advisory_xact_lock(hashtextextended(${idempotencyKey}::text, 0))) as advisory_lock
    `;
    const rows = await transaction<{ is_same: boolean }[]>`
      select operation = ${operation}
        and request_payload = ${transaction.json(requestPayload)} as is_same
      from private.profile_operations
      where idempotency_key = ${idempotencyKey}
    `;
    const existing = rows[0];
    return existing === undefined
      ? null
      : { outcome: existing.is_same ? 'replayed' : 'idempotency_conflict' };
  }

  private async recordOperation(
    transaction: postgres.TransactionSql,
    input: {
      actorAccountId: string;
      expectedVersion: number;
      idempotencyKey: string;
      now: Date;
      operation: ProfileOperation;
      personId: string;
      requestPayload: postgres.JSONValue;
      resultingVersion: number;
    },
  ): Promise<void> {
    await transaction`
      insert into private.profile_operations (
        idempotency_key,
        person_id,
        actor_account_id,
        operation,
        expected_version,
        resulting_version,
        request_payload,
        occurred_at
      ) values (
        ${input.idempotencyKey},
        ${input.personId},
        ${input.actorAccountId},
        ${input.operation},
        ${input.expectedVersion},
        ${input.resultingVersion},
        ${transaction.json(input.requestPayload)},
        ${input.now}
      )
    `;
  }

  private async recordOutbox(
    transaction: postgres.TransactionSql,
    eventId: string,
    eventType: 'public_profile_cache_invalidated' | 'public_profile_visible',
    publicId: string,
    now: Date,
  ): Promise<void> {
    await transaction`
      insert into private.outbox_events (
        aggregate_type, aggregate_id, event_type, payload, occurred_at
      ) values (
        'public_profile',
        ${eventId},
        ${eventType},
        ${transaction.json({ publicId })},
        ${now}
      )
      on conflict (aggregate_type, aggregate_id, event_type) do nothing
    `;
  }

  private mapPrivateProfile(row: PrivateProfileRow): PrivatePublicProfile | null {
    if (row.public_id === null || row.version === null) {
      return null;
    }
    return {
      bio: row.bio,
      consent:
        row.consent_text_version === null || row.consent_granted_at === null
          ? null
          : {
              consentTextVersion: row.consent_text_version,
              grantedAt: row.consent_granted_at.toISOString(),
            },
      links: row.profile_links,
      photo: this.mapPhoto(row),
      photoId: row.photo_id,
      publicId: row.public_id,
      version: Number(row.version),
    };
  }

  private mapPhoto(row: PhotoRow): ProfilePhotoView | null {
    if (row.photo_object_key === null || row.photo_width === null || row.photo_height === null) {
      return null;
    }
    return {
      height: row.photo_height,
      url: new URL(row.photo_object_key, `${this.publicMediaOrigin}/`).toString(),
      width: row.photo_width,
    };
  }
}
