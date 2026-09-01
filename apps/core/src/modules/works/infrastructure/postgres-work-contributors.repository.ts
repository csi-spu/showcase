import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  ContributorMutationResult,
  WorkContributorsRepository,
} from '../application/work-contributors.ports';
import type { WorkDraftContributorView } from '../application/works.ports';

const LOOKUP_LIMIT = 60;
const LOOKUP_WINDOW_MILLISECONDS = 15 * 60 * 1_000;
const CANDIDATE_LIFETIME_MILLISECONDS = 5 * 60 * 1_000;
const CANDIDATE_RESULT_LIMIT = 8;
const EXPIRED_CANDIDATE_CLEANUP_LIMIT = 100;
const CONTRIBUTOR_LIMIT = 20;

type Sql = postgres.Sql;
type ContributorOperation =
  'account_contributor_added' | 'draft_contributor_removed' | 'external_contributor_added';

interface LockedDraftRow {
  version: string;
  work_id: string;
}

interface OperationRow {
  operation: ContributorOperation;
  request_fingerprint: string;
  resulting_version: string;
  work_id: string;
}

interface CandidateRow {
  first_name: string;
  has_public_photo: boolean;
  last_name: string;
  person_id: string;
  public_entry_year: number | null;
  public_profile_id: string | null;
}

@Injectable()
export class PostgresWorkContributorsRepository implements WorkContributorsRepository {
  constructor(private readonly database: DatabaseClient) {}

  async searchCandidates(
    input: Parameters<WorkContributorsRepository['searchCandidates']>[0],
  ): ReturnType<WorkContributorsRepository['searchCandidates']> {
    return this.database.sql.begin(async (sql) => {
      if (!(await this.isCutoverComplete(sql))) return { outcome: 'cutover_unavailable' };
      if (!(await this.consumeLookupAttempt(sql, input))) return { outcome: 'rate_limited' };
      const draft = await this.findOwnedDraft(sql, input.actorAccountId, input.workPublicId);
      if (draft === null) return { outcome: 'not_found' };
      let candidates: CandidateRow[];
      if (input.studentIdPrefixHash === null) {
        if (input.nameQuery === null) {
          throw new Error('WORK_CONTRIBUTOR_SEARCH_QUERY_INVARIANT');
        }
        candidates = await this.searchCandidatesByName(sql, draft.work_id, input.nameQuery);
      } else {
        if (input.studentIdPrefixLength === null) {
          throw new Error('WORK_CONTRIBUTOR_SEARCH_QUERY_INVARIANT');
        }
        candidates =
          input.studentIdPrefixLength === 8
            ? await this.searchCandidateByStudentId(sql, draft.work_id, input.studentIdPrefixHash)
            : await this.searchCandidatesByStudentIdPrefix(
                sql,
                draft.work_id,
                input.studentIdPrefixHash,
                input.studentIdPrefixLength,
              );
      }
      if (candidates.length === 0) return { outcome: 'no_match' };
      await this.deleteExpiredCandidates(sql, input.now);
      const expiresAt = new Date(input.now.getTime() + CANDIDATE_LIFETIME_MILLISECONDS);
      const references = await sql<Array<{ person_id: string; reference: string }>>`
        insert into private.work_contributor_candidates ${sql(
          candidates.map((candidate) => ({
            created_at: input.now,
            expires_at: expiresAt,
            person_id: candidate.person_id,
            work_id: draft.work_id,
          })),
          'work_id',
          'person_id',
          'expires_at',
          'created_at',
        )}
        returning person_id, reference
      `;
      const referenceByPerson = new Map(
        references.map((reference) => [reference.person_id, reference.reference]),
      );
      return {
        candidates: candidates.map((candidate) => ({
          candidateReference: this.required(referenceByPerson.get(candidate.person_id)),
          firstName: candidate.first_name,
          lastName: candidate.last_name,
          publicProfile:
            candidate.public_profile_id === null
              ? null
              : {
                  entryYear: this.requiredPublicEntryYear(candidate.public_entry_year),
                  hasPhoto: candidate.has_public_photo,
                  publicId: candidate.public_profile_id,
                },
        })),
        outcome: 'matches',
      };
    });
  }

  private searchCandidateByStudentId(
    sql: postgres.TransactionSql,
    workId: string,
    studentIdHash: string,
  ): Promise<CandidateRow[]> {
    return sql<CandidateRow[]>`
        select name.first_name_th as first_name, name.last_name_th as last_name,
          account.person_id,
          case when consent.id is null then null else profile.public_id end
            as public_profile_id,
          case when consent.id is null then null else student.entry_year end
            as public_entry_year,
          consent.id is not null and photo.id is not null as has_public_photo
        from private.student_auth_identities as identity
        join public.accounts as account on account.id = identity.account_id
        join public.account_roles as role
          on role.account_id = account.id and role.role = 'student'
        join public.students as student on student.person_id = account.person_id
        join private.person_names as name on name.person_id = account.person_id
        left join public.public_profiles as profile on profile.person_id = account.person_id
        left join public.profile_consents as consent
          on consent.person_id = profile.person_id and consent.withdrawn_at is null
        left join private.profile_photo_assets as photo
          on photo.id = profile.photo_id and photo.status = 'ready'
        where identity.student_id_hash = ${studentIdHash}
          and account.status = 'active'
          and name.first_name_th is not null and name.last_name_th is not null
          and account.person_id <> (
            select submitter_person_id from public.works where id = ${workId}
          )
          and not exists (
            select 1 from private.work_draft_contributors as contributor
            where contributor.work_id = ${workId}
              and contributor.person_id = account.person_id
              and contributor.kind = 'account' and contributor.removed_at is null
          )
        limit 1
      `;
  }

  private searchCandidatesByStudentIdPrefix(
    sql: postgres.TransactionSql,
    workId: string,
    studentIdPrefixHash: string,
    studentIdPrefixLength: number,
  ): Promise<CandidateRow[]> {
    return sql<CandidateRow[]>`
      select name.first_name_th as first_name, name.last_name_th as last_name,
        account.person_id,
        case when consent.id is null then null else profile.public_id end as public_profile_id,
        case when consent.id is null then null else student.entry_year end as public_entry_year,
        consent.id is not null and photo.id is not null as has_public_photo
      from private.student_id_search_prefixes as prefix
      join public.accounts as account on account.id = prefix.account_id
      join public.account_roles as role
        on role.account_id = account.id and role.role = 'student'
      join public.students as student on student.person_id = account.person_id
      join private.person_names as name on name.person_id = account.person_id
      left join public.public_profiles as profile on profile.person_id = account.person_id
      left join public.profile_consents as consent
        on consent.person_id = profile.person_id and consent.withdrawn_at is null
      left join private.profile_photo_assets as photo
        on photo.id = profile.photo_id and photo.status = 'ready'
      where prefix.prefix_hash = ${studentIdPrefixHash}
        and prefix.prefix_length = ${studentIdPrefixLength}
        and account.status = 'active'
        and name.first_name_th is not null and name.last_name_th is not null
        and account.person_id <> (
          select submitter_person_id from public.works where id = ${workId}
        )
        and not exists (
          select 1 from private.work_draft_contributors as contributor
          where contributor.work_id = ${workId}
            and contributor.person_id = account.person_id
            and contributor.kind = 'account' and contributor.removed_at is null
        )
      order by prefix.account_id
      limit ${CANDIDATE_RESULT_LIMIT}
    `;
  }

  private searchCandidatesByName(
    sql: postgres.TransactionSql,
    workId: string,
    nameQuery: string,
  ): Promise<CandidateRow[]> {
    if (Array.from(nameQuery).length < 3) {
      return this.searchCandidatesByShortNamePrefix(sql, workId, nameQuery);
    }
    const prefix = `${this.escapeLike(nameQuery)}%`;
    const contains = `%${this.escapeLike(nameQuery)}%`;
    return sql<CandidateRow[]>`
      select name.first_name_th as first_name, name.last_name_th as last_name,
        account.person_id,
        case when consent.id is null then null else profile.public_id end as public_profile_id,
        case when consent.id is null then null else student.entry_year end as public_entry_year,
        consent.id is not null and photo.id is not null as has_public_photo
      from private.person_names as name
      join public.accounts as account on account.person_id = name.person_id
      join public.account_roles as role
        on role.account_id = account.id and role.role = 'student'
      join public.students as student on student.person_id = account.person_id
      left join public.public_profiles as profile on profile.person_id = account.person_id
      left join public.profile_consents as consent
        on consent.person_id = profile.person_id and consent.withdrawn_at is null
      left join private.profile_photo_assets as photo
        on photo.id = profile.photo_id and photo.status = 'ready'
      where account.status = 'active'
        and name.first_name_th is not null and name.last_name_th is not null
        and (
          lower(name.first_name_th || ' ' || name.last_name_th)
            like ${contains} escape '\\'
          or lower(name.first_name_th || ' ' || name.last_name_th)
            operator(extensions.%) ${nameQuery}
        )
        and account.person_id <> (
          select submitter_person_id from public.works where id = ${workId}
        )
        and not exists (
          select 1 from private.work_draft_contributors as contributor
          where contributor.work_id = ${workId}
            and contributor.person_id = account.person_id
            and contributor.kind = 'account' and contributor.removed_at is null
        )
      order by
        case
          when lower(name.first_name_th || ' ' || name.last_name_th) = ${nameQuery} then 0
          when lower(name.first_name_th || ' ' || name.last_name_th)
            like ${prefix} escape '\\' then 1
          when lower(name.first_name_th || ' ' || name.last_name_th)
            like ${contains} escape '\\' then 2
          else 3
        end,
        extensions.similarity(
          lower(name.first_name_th || ' ' || name.last_name_th), ${nameQuery}
        ) desc,
        lower(name.first_name_th), lower(name.last_name_th), account.person_id
      limit ${CANDIDATE_RESULT_LIMIT}
    `;
  }

  private searchCandidatesByShortNamePrefix(
    sql: postgres.TransactionSql,
    workId: string,
    nameQuery: string,
  ): Promise<CandidateRow[]> {
    const prefix = `${this.escapeLike(nameQuery)}%`;
    return sql<CandidateRow[]>`
      select name.first_name_th as first_name, name.last_name_th as last_name,
        account.person_id,
        case when consent.id is null then null else profile.public_id end as public_profile_id,
        case when consent.id is null then null else student.entry_year end as public_entry_year,
        consent.id is not null and photo.id is not null as has_public_photo
      from private.person_names as name
      join public.accounts as account on account.person_id = name.person_id
      join public.account_roles as role
        on role.account_id = account.id and role.role = 'student'
      join public.students as student on student.person_id = account.person_id
      left join public.public_profiles as profile on profile.person_id = account.person_id
      left join public.profile_consents as consent
        on consent.person_id = profile.person_id and consent.withdrawn_at is null
      left join private.profile_photo_assets as photo
        on photo.id = profile.photo_id and photo.status = 'ready'
      where account.status = 'active'
        and name.first_name_th is not null and name.last_name_th is not null
        and (
          lower(name.first_name_th) like ${prefix} escape '\\'
          or lower(name.last_name_th) like ${prefix} escape '\\'
        )
        and account.person_id <> (
          select submitter_person_id from public.works where id = ${workId}
        )
        and not exists (
          select 1 from private.work_draft_contributors as contributor
          where contributor.work_id = ${workId}
            and contributor.person_id = account.person_id
            and contributor.kind = 'account' and contributor.removed_at is null
        )
      order by
        case when lower(name.first_name_th) like ${prefix} escape '\\' then 0 else 1 end,
        lower(name.first_name_th), lower(name.last_name_th), account.person_id
      limit ${CANDIDATE_RESULT_LIMIT}
    `;
  }

  private async deleteExpiredCandidates(sql: postgres.TransactionSql, now: Date): Promise<void> {
    await sql`
      delete from private.work_contributor_candidates
      where reference in (
        select reference from private.work_contributor_candidates
        where expires_at <= ${now}
        order by expires_at, reference
        limit ${EXPIRED_CANDIDATE_CLEANUP_LIMIT}
      )
    `;
  }

  private requiredPublicEntryYear(value: number | null): number {
    if (value === null) throw new Error('CONTRIBUTOR_PUBLIC_PROFILE_INVARIANT');
    return value;
  }

  addAccount(
    input: Parameters<WorkContributorsRepository['addAccount']>[0],
  ): Promise<ContributorMutationResult> {
    const fingerprint = this.fingerprint({
      candidateReference: input.candidateReference,
      contributionRole: input.contributionRole,
      expectedVersion: input.expectedVersion,
      workPublicId: input.workPublicId,
    });
    return this.mutate(input, 'account_contributor_added', fingerprint, async (sql, draft) => {
      const rows = await sql<Array<{ attribution_name: string; person_id: string }>>`
        select concat(name.first_name_th, ' ', name.last_name_th) as attribution_name,
          candidate.person_id
        from private.work_contributor_candidates as candidate
        join public.accounts as account on account.person_id = candidate.person_id
        join public.account_roles as role
          on role.account_id = account.id and role.role = 'student'
        join private.person_names as name on name.person_id = candidate.person_id
        where candidate.reference = ${input.candidateReference}
          and candidate.work_id = ${draft.work_id}
          and candidate.expires_at > ${input.now}
          and account.status = 'active'
          and candidate.person_id <> (
            select submitter_person_id from public.works where id = ${draft.work_id}
          )
        limit 1
      `;
      const candidate = rows[0];
      if (candidate === undefined) return { outcome: 'candidate_invalid' };
      if (await this.hasAccountContributor(sql, draft.work_id, candidate.person_id)) {
        return { outcome: 'contributor_duplicate' };
      }
      if ((await this.activeCount(sql, draft.work_id)) >= CONTRIBUTOR_LIMIT) {
        return { outcome: 'contributor_limit_reached' };
      }
      const position = await this.nextPosition(sql, draft.work_id);
      const inserted = await sql<Array<{ id: string }>>`
        insert into private.work_draft_contributors (
          work_id, kind, person_id, attribution_name, contribution_role,
          position, created_at, updated_at
        ) values (
          ${draft.work_id}, 'account', ${candidate.person_id}, ${candidate.attribution_name},
          ${input.contributionRole}, ${position}, ${input.now}, ${input.now}
        ) returning id
      `;
      return { contributorId: this.required(inserted[0]).id, outcome: 'added' };
    });
  }

  addExternal(
    input: Parameters<WorkContributorsRepository['addExternal']>[0],
  ): Promise<ContributorMutationResult> {
    const fingerprint = this.fingerprint({
      attributionName: input.attributionName,
      contributionRole: input.contributionRole,
      expectedVersion: input.expectedVersion,
      workPublicId: input.workPublicId,
    });
    return this.mutate(input, 'external_contributor_added', fingerprint, async (sql, draft) => {
      if ((await this.activeCount(sql, draft.work_id)) >= CONTRIBUTOR_LIMIT) {
        return { outcome: 'contributor_limit_reached' };
      }
      const people = await sql<Array<{ id: string }>>`
        insert into public.people (created_at) values (${input.now}) returning id
      `;
      const personId = this.required(people[0]).id;
      const position = await this.nextPosition(sql, draft.work_id);
      const inserted = await sql<Array<{ id: string }>>`
        insert into private.work_draft_contributors (
          work_id, kind, person_id, attribution_name, contribution_role,
          position, created_at, updated_at
        ) values (
          ${draft.work_id}, 'external', ${personId}, ${input.attributionName},
          ${input.contributionRole}, ${position}, ${input.now}, ${input.now}
        ) returning id
      `;
      return { contributorId: this.required(inserted[0]).id, outcome: 'added' };
    });
  }

  remove(
    input: Parameters<WorkContributorsRepository['remove']>[0],
  ): Promise<ContributorMutationResult> {
    const fingerprint = this.fingerprint({
      contributorPublicId: input.contributorPublicId,
      expectedVersion: input.expectedVersion,
      workPublicId: input.workPublicId,
    });
    return this.mutate(input, 'draft_contributor_removed', fingerprint, async (sql, draft) => {
      const rows = await sql<Array<{ id: string }>>`
        update private.work_draft_contributors
        set removed_at = ${input.now}, updated_at = ${input.now}
        where work_id = ${draft.work_id} and public_id = ${input.contributorPublicId}
          and removed_at is null
        returning id
      `;
      const contributor = rows[0];
      return contributor === undefined
        ? { outcome: 'not_found' }
        : { contributorId: contributor.id, outcome: 'removed' };
    });
  }

  private async mutate(
    input: {
      actorAccountId: string;
      expectedVersion: number;
      idempotencyKey: string;
      now: Date;
      workPublicId: string;
    },
    operation: ContributorOperation,
    fingerprint: string,
    change: (
      sql: postgres.TransactionSql,
      draft: LockedDraftRow,
    ) => Promise<
      | { contributorId: string; outcome: 'added' | 'removed' }
      | {
          outcome:
            | 'candidate_invalid'
            | 'contributor_duplicate'
            | 'contributor_limit_reached'
            | 'not_found';
        }
    >,
  ): Promise<ContributorMutationResult> {
    return this.database.sql.begin(async (sql) => {
      await sql`select 1 from (select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}::text, 0))) as advisory_lock`;
      if (!(await this.isCutoverComplete(sql))) return { outcome: 'cutover_unavailable' };
      const replay = await this.resolveReplay(sql, input, operation, fingerprint);
      if (replay !== null) return replay;
      const draft = await this.lockOwnedDraft(sql, input.actorAccountId, input.workPublicId);
      if (draft === null) return { outcome: 'not_found' };
      const pending = await sql<Array<{ exists: boolean }>>`
        select exists (
          select 1 from private.work_revisions
          where work_id = ${draft.work_id} and status = 'pending_review'
        ) as exists
      `;
      if (this.required(pending[0]).exists) return { outcome: 'pending_revision_exists' };
      if (Number(draft.version) !== input.expectedVersion) return { outcome: 'version_conflict' };
      const result = await change(sql, draft);
      if (!('contributorId' in result)) return result;
      const resultingVersion = input.expectedVersion + 1;
      await sql`
        update private.work_drafts set version = ${resultingVersion}, updated_at = ${input.now}
        where work_id = ${draft.work_id}
      `;
      await sql`
        update public.works set version = version + 1, updated_at = ${input.now}
        where id = ${draft.work_id}
      `;
      await sql`
        insert into private.work_draft_contributor_operations (
          idempotency_key, actor_account_id, work_id, contributor_id, operation,
          request_fingerprint, resulting_version, occurred_at
        ) values (
          ${input.idempotencyKey}, ${input.actorAccountId}, ${draft.work_id},
          ${result.contributorId}, ${operation}, ${fingerprint}, ${resultingVersion}, ${input.now}
        )
      `;
      return {
        contributors: await this.listContributors(sql, draft.work_id),
        outcome: result.outcome,
        version: resultingVersion,
      };
    });
  }

  private async resolveReplay(
    sql: postgres.TransactionSql,
    input: { actorAccountId: string; idempotencyKey: string },
    operation: ContributorOperation,
    fingerprint: string,
  ): Promise<ContributorMutationResult | null> {
    const rows = await sql<OperationRow[]>`
      select operation, request_fingerprint, resulting_version, work_id
      from private.work_draft_contributor_operations
      where idempotency_key = ${input.idempotencyKey}
        and actor_account_id = ${input.actorAccountId}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) return null;
    if (row.operation !== operation || row.request_fingerprint !== fingerprint) {
      return { outcome: 'idempotency_conflict' };
    }
    return {
      contributors: await this.listContributors(sql, row.work_id),
      outcome: 'replayed',
      version: Number(row.resulting_version),
    };
  }

  private async lockOwnedDraft(
    sql: postgres.TransactionSql,
    actorAccountId: string,
    workPublicId: string,
  ): Promise<LockedDraftRow | null> {
    const rows = await sql<LockedDraftRow[]>`
      select work.id as work_id, draft.version
      from public.works as work
      join public.accounts as account on account.person_id = work.submitter_person_id
      join private.work_drafts as draft
        on draft.work_id = work.id and draft.lifecycle_state = 'active'
      where account.id = ${actorAccountId} and work.public_id = ${workPublicId}
        and work.activity_state = 'active'
      for update of work, draft
    `;
    return rows[0] ?? null;
  }

  private async findOwnedDraft(
    sql: postgres.TransactionSql,
    actorAccountId: string,
    workPublicId: string,
  ): Promise<LockedDraftRow | null> {
    const rows = await sql<LockedDraftRow[]>`
      select work.id as work_id, draft.version
      from public.works as work
      join public.accounts as account on account.person_id = work.submitter_person_id
      join private.work_drafts as draft
        on draft.work_id = work.id and draft.lifecycle_state = 'active'
      where account.id = ${actorAccountId} and work.public_id = ${workPublicId}
        and work.activity_state = 'active'
      limit 1
    `;
    return rows[0] ?? null;
  }

  private async listContributors(sql: Sql, workId: string): Promise<WorkDraftContributorView[]> {
    return sql<WorkDraftContributorView[]>`
      select public_id as "publicId", kind, attribution_name as "attributionName",
        contribution_role as "contributionRole"
      from private.work_draft_contributors
      where work_id = ${workId} and removed_at is null
      order by position
    `;
  }

  private async activeCount(sql: Sql, workId: string): Promise<number> {
    const rows = await sql<Array<{ count: number }>>`
      select count(*)::integer as count from private.work_draft_contributors
      where work_id = ${workId} and removed_at is null
    `;
    return this.required(rows[0]).count;
  }

  private async hasAccountContributor(sql: Sql, workId: string, personId: string) {
    const rows = await sql<Array<{ exists: boolean }>>`
      select exists (
        select 1 from private.work_draft_contributors
        where work_id = ${workId} and person_id = ${personId}
          and kind = 'account' and removed_at is null
      ) as exists
    `;
    return this.required(rows[0]).exists;
  }

  private async nextPosition(sql: Sql, workId: string): Promise<number> {
    const rows = await sql<Array<{ position: number }>>`
      select candidate.position
      from generate_series(1, ${CONTRIBUTOR_LIMIT}) as candidate(position)
      where not exists (
        select 1 from private.work_draft_contributors as contributor
        where contributor.work_id = ${workId} and contributor.removed_at is null
          and contributor.position = candidate.position
      )
      order by candidate.position limit 1
    `;
    return this.required(rows[0]).position;
  }

  private async consumeLookupAttempt(
    sql: postgres.TransactionSql,
    input: { actorAccountId: string; now: Date; sourceKeyHash: string },
  ): Promise<boolean> {
    const windowStart = new Date(input.now.getTime() - LOOKUP_WINDOW_MILLISECONDS);
    const account = await sql<Array<{ attempt_count: number }>>`
      insert into private.attribution_account_lookup_rate_limits (
        actor_account_id, window_started_at, attempt_count
      ) values (${input.actorAccountId}, ${input.now}, 1)
      on conflict (actor_account_id) do update set
        window_started_at = case when attribution_account_lookup_rate_limits.window_started_at <= ${windowStart}
          then ${input.now} else attribution_account_lookup_rate_limits.window_started_at end,
        attempt_count = case when attribution_account_lookup_rate_limits.window_started_at <= ${windowStart}
          then 1 else attribution_account_lookup_rate_limits.attempt_count + 1 end
      returning attempt_count
    `;
    const source = await sql<Array<{ attempt_count: number }>>`
      insert into private.attribution_source_lookup_rate_limits (
        source_key_hash, window_started_at, attempt_count
      ) values (${input.sourceKeyHash}, ${input.now}, 1)
      on conflict (source_key_hash) do update set
        window_started_at = case when attribution_source_lookup_rate_limits.window_started_at <= ${windowStart}
          then ${input.now} else attribution_source_lookup_rate_limits.window_started_at end,
        attempt_count = case when attribution_source_lookup_rate_limits.window_started_at <= ${windowStart}
          then 1 else attribution_source_lookup_rate_limits.attempt_count + 1 end
      returning attempt_count
    `;
    return (
      this.required(account[0]).attempt_count <= LOOKUP_LIMIT &&
      this.required(source[0]).attempt_count <= LOOKUP_LIMIT
    );
  }

  private async isCutoverComplete(sql: Sql): Promise<boolean> {
    const rows = await sql<Array<{ is_complete: boolean }>>`
      select completed_at is not null as is_complete
      from private.issue_56_contributor_cutover_state
      where singleton = true
    `;
    return rows[0]?.is_complete === true;
  }

  private fingerprint(value: Record<string, string | number>): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/gu, '\\$&');
  }

  private required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('WORK_CONTRIBUTOR_PERSISTENCE_INVARIANT');
    return value;
  }
}
