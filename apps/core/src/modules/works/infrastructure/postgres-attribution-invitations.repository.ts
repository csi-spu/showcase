import { Injectable } from '@nestjs/common';
import type postgres from 'postgres';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import type {
  AttributionInvitationPage,
  AttributionInvitationRepository,
  AttributionInvitationView,
  InvitationFailureOutcome,
} from '../application/attribution-invitations.ports';

const ACTIVE_CONTRIBUTOR_LIMIT = 20;
const LOOKUP_LIMIT = 10;
const LOOKUP_WINDOW_MILLISECONDS = 15 * 60 * 1_000;
const ACCOUNT_INVITATION_MILLISECONDS = 14 * 24 * 60 * 60 * 1_000;

type Sql = postgres.Sql | postgres.TransactionSql;
type Operation =
  | 'account_invitation_created'
  | 'external_invitation_created'
  | 'invitation_accepted'
  | 'invitation_rejected'
  | 'invitation_revoked'
  | 'attribution_withdrawn';

interface InvitationRow {
  affiliation: string | null;
  attribution_name: string | null;
  contribution_role: string | null;
  created_at: Date;
  expires_at: Date;
  id: string;
  kind: 'account' | 'external';
  proposed_affiliation: string | null;
  proposed_attribution_name: string | null;
  proposed_contribution_role: string | null;
  public_id: string;
  state: AttributionInvitationView['state'];
  study_year: number | null;
  version: string;
  work_id: string;
}

interface OperationRow {
  invitation_id: string | null;
  is_equivalent: boolean;
}

type Replay =
  | { outcome: 'conflict' }
  | { outcome: 'none' }
  | { invitationId: string | null; outcome: 'replay' };

@Injectable()
export class PostgresAttributionInvitationsRepository implements AttributionInvitationRepository {
  constructor(private readonly database: DatabaseClient) {}

  async createAccountInvitation(
    input: Parameters<AttributionInvitationRepository['createAccountInvitation']>[0],
  ): ReturnType<AttributionInvitationRepository['createAccountInvitation']> {
    return this.database.sql.begin(async (transaction) => {
      await this.lockIdempotency(transaction, input.idempotencyKey);
      if (!(await this.consumeLookupAttempt(transaction, input)))
        return { outcome: 'rate_limited' };
      const payload = { publicId: input.publicId, studentIdHash: input.studentIdHash };
      const replay = await this.resolveReplay(
        transaction,
        input.actorAccountId,
        input.idempotencyKey,
        'account_invitation_created',
        payload,
      );
      if (replay.outcome === 'conflict') return { outcome: 'idempotency_conflict' };
      if (replay.outcome === 'replay') return { outcome: 'replayed' };

      const workId = await this.lockOwnedWork(transaction, input.actorAccountId, input.publicId);
      if (workId === null) return { outcome: 'not_found' };
      const recipients = await transaction<Array<{ account_id: string; person_id: string }>>`
        select account.id as account_id, account.person_id
        from private.student_auth_identities as identity
        join public.accounts as account on account.id = identity.account_id
        join public.account_roles as role
          on role.account_id = account.id and role.role = 'student'
        where identity.student_id_hash = ${input.studentIdHash}
          and account.status = 'active'
          and account.credential_state = 'set'
        limit 1
      `;
      const recipient = recipients[0];
      const hasExistingPending =
        recipient === undefined
          ? false
          : await this.hasPendingPersonInvitation(transaction, workId, recipient.person_id);
      if (
        recipient === undefined ||
        hasExistingPending ||
        (await this.isSubmitter(transaction, workId, recipient.person_id))
      ) {
        await this.recordOperation(transaction, {
          actorAccountId: input.actorAccountId,
          idempotencyKey: input.idempotencyKey,
          invitationId: null,
          now: input.now,
          operation: 'account_invitation_created',
          payload,
        });
        return { outcome: 'not_eligible' };
      }
      if ((await this.activeCount(transaction, workId)) >= ACTIVE_CONTRIBUTOR_LIMIT) {
        return { outcome: 'active_limit_reached' };
      }
      const inserted = await transaction<InvitationRow[]>`
        insert into private.attribution_invitations (
          work_id, kind, invitee_person_id, state, expires_at, created_at, updated_at
        ) values (
          ${workId}, 'account', ${recipient.person_id}, 'pending',
          ${new Date(input.now.getTime() + ACCOUNT_INVITATION_MILLISECONDS)},
          ${input.now}, ${input.now}
        )
        returning ${this.returning(transaction)}
      `;
      const invitation = this.required(inserted[0]);
      await this.recordOperation(transaction, {
        actorAccountId: input.actorAccountId,
        idempotencyKey: input.idempotencyKey,
        invitationId: invitation.id,
        now: input.now,
        operation: 'account_invitation_created',
        payload,
        resultingState: 'pending',
        resultingVersion: 1,
      });
      await this.emitEvent(
        transaction,
        invitation.id,
        'attribution_invitation_created',
        {
          invitationPublicId: invitation.public_id,
          recipientAccountId: recipient.account_id,
          workPublicId: input.publicId,
        },
        input.now,
      );
      return { outcome: 'created' };
    });
  }

  async createExternalInvitation(
    input: Parameters<AttributionInvitationRepository['createExternalInvitation']>[0],
  ): ReturnType<AttributionInvitationRepository['createExternalInvitation']> {
    return this.database.sql.begin(async (transaction) => {
      await this.lockIdempotency(transaction, input.idempotencyKey);
      const payload = {
        affiliation: input.affiliation ?? null,
        attributionName: input.attributionName,
        contributionRole: input.contributionRole,
        publicId: input.publicId,
      };
      const replay = await this.resolveReplay(
        transaction,
        input.actorAccountId,
        input.idempotencyKey,
        'external_invitation_created',
        payload,
      );
      if (replay.outcome === 'conflict') return { outcome: 'idempotency_conflict' };
      if (replay.outcome === 'replay') {
        if (replay.invitationId === null) return { outcome: 'idempotency_conflict' };
        const invitation = await this.findInvitation(transaction, replay.invitationId);
        if (invitation === null) return { outcome: 'not_found' };
        return { invitation, outcome: 'replayed' };
      }
      const workId = await this.lockOwnedWork(transaction, input.actorAccountId, input.publicId);
      if (workId === null) return { outcome: 'not_found' };
      if ((await this.activeCount(transaction, workId)) >= ACTIVE_CONTRIBUTOR_LIMIT) {
        return { outcome: 'active_limit_reached' };
      }
      const inserted = await transaction<InvitationRow[]>`
        insert into private.attribution_invitations (
          work_id, kind, state, proposed_attribution_name, proposed_contribution_role,
          proposed_affiliation, invitation_token_hash, expires_at, created_at, updated_at
        ) values (
          ${workId}, 'external', 'pending', ${input.attributionName}, ${input.contributionRole},
          ${input.affiliation ?? null}, ${input.invitationTokenHash}, ${input.expiresAt},
          ${input.now}, ${input.now}
        )
        returning ${this.returning(transaction)}
      `;
      const invitation = this.required(inserted[0]);
      await this.recordOperation(transaction, {
        actorAccountId: input.actorAccountId,
        idempotencyKey: input.idempotencyKey,
        invitationId: invitation.id,
        now: input.now,
        operation: 'external_invitation_created',
        payload,
        resultingState: 'pending',
        resultingVersion: 1,
      });
      return { invitation: this.map(invitation), outcome: 'created' };
    });
  }

  async acceptAccountInvitation(
    input: Parameters<AttributionInvitationRepository['acceptAccountInvitation']>[0],
  ): ReturnType<AttributionInvitationRepository['acceptAccountInvitation']> {
    return this.database.sql.begin(async (transaction) => {
      await this.lockIdempotency(transaction, input.idempotencyKey);
      const payload = {
        attribution: input.attribution,
        expectedVersion: input.expectedVersion,
        invitationPublicId: input.invitationPublicId,
      };
      const replay = await this.resolveReplay(
        transaction,
        input.actorAccountId,
        input.idempotencyKey,
        'invitation_accepted',
        payload,
      );
      if (replay.outcome === 'conflict') return { outcome: 'idempotency_conflict' };
      if (replay.outcome === 'replay') return { outcome: 'replayed' };
      const row = await this.lockAccountInvitation(
        transaction,
        input.actorAccountId,
        input.invitationPublicId,
      );
      const failure = await this.transitionFailure(
        transaction,
        row,
        input.expectedVersion,
        input.now,
      );
      if (failure !== null) return { outcome: failure };
      const current = this.required(row);
      const updated = await transaction<InvitationRow[]>`
        update private.attribution_invitations
        set state = 'accepted', accepted_person_id = invitee_person_id,
            attribution_name = ${input.attribution.attributionName},
            study_year = ${input.attribution.studyYear},
            public_attribution_consented_at = ${input.now},
            resolved_at = ${input.now}, updated_at = ${input.now}, version = version + 1
        where id = ${current.id}
        returning ${this.returning(transaction)}
      `;
      const accepted = this.required(updated[0]);
      await this.recordOperation(transaction, {
        actorAccountId: input.actorAccountId,
        idempotencyKey: input.idempotencyKey,
        invitationId: accepted.id,
        now: input.now,
        operation: 'invitation_accepted',
        payload,
        resultingState: 'accepted',
        resultingVersion: Number(accepted.version),
      });
      await this.emitSubmitterEvent(
        transaction,
        accepted,
        'attribution_invitation_accepted',
        input.now,
      );
      return { outcome: 'accepted' };
    });
  }

  async rejectAccountInvitation(
    input: Parameters<AttributionInvitationRepository['rejectAccountInvitation']>[0],
  ): ReturnType<AttributionInvitationRepository['rejectAccountInvitation']> {
    return this.accountRecipientTransition(input, 'rejected', 'invitation_rejected');
  }

  async withdrawAccountAttribution(
    input: Parameters<AttributionInvitationRepository['withdrawAccountAttribution']>[0],
  ): ReturnType<AttributionInvitationRepository['withdrawAccountAttribution']> {
    return this.accountRecipientTransition(input, 'withdrawn', 'attribution_withdrawn');
  }

  async revokeInvitation(
    input: Parameters<AttributionInvitationRepository['revokeInvitation']>[0],
  ): ReturnType<AttributionInvitationRepository['revokeInvitation']> {
    return this.database.sql.begin(async (transaction) => {
      await this.lockIdempotency(transaction, input.idempotencyKey);
      const payload = {
        expectedVersion: input.expectedVersion,
        invitationPublicId: input.invitationPublicId,
        publicId: input.publicId,
      };
      const replay = await this.resolveReplay(
        transaction,
        input.actorAccountId,
        input.idempotencyKey,
        'invitation_revoked',
        payload,
      );
      if (replay.outcome === 'conflict') return { outcome: 'idempotency_conflict' };
      if (replay.outcome === 'replay') return { outcome: 'replayed' };
      const rows = await transaction<InvitationRow[]>`
        select ${this.columns(transaction)}
        from private.attribution_invitations as invitation
        join public.works as work on work.id = invitation.work_id
        join public.accounts as actor on actor.person_id = work.submitter_person_id
        where actor.id = ${input.actorAccountId}
          and work.public_id = ${input.publicId}
          and invitation.public_id = ${input.invitationPublicId}
        for update of invitation
      `;
      const row = rows[0];
      const failure = await this.transitionFailure(
        transaction,
        row,
        input.expectedVersion,
        input.now,
      );
      if (failure !== null) return { outcome: failure };
      const revoked = await this.updateSimpleState(
        transaction,
        this.required(row),
        'revoked',
        input.now,
      );
      await this.recordOperation(transaction, {
        actorAccountId: input.actorAccountId,
        idempotencyKey: input.idempotencyKey,
        invitationId: revoked.id,
        now: input.now,
        operation: 'invitation_revoked',
        payload,
        resultingState: 'revoked',
        resultingVersion: Number(revoked.version),
      });
      if (revoked.kind === 'account') {
        await this.emitRecipientEvent(
          transaction,
          revoked,
          'attribution_invitation_revoked',
          input.now,
        );
      }
      return { outcome: 'revoked' };
    });
  }

  async exchangeExternalToken(
    input: Parameters<AttributionInvitationRepository['exchangeExternalToken']>[0],
  ): ReturnType<AttributionInvitationRepository['exchangeExternalToken']> {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<InvitationRow[]>`
        select ${this.columns(transaction)}
        from private.attribution_invitations as invitation
        where invitation.kind = 'external'
          and invitation.invitation_token_hash = ${input.invitationTokenHash}
        for update of invitation
      `;
      const row = rows[0];
      if (
        row === undefined ||
        row.state !== 'pending' ||
        row.expires_at.getTime() <= input.now.getTime() ||
        (await this.hasExchangedToken(transaction, row.id))
      ) {
        if (row !== undefined && row.state === 'pending' && row.expires_at <= input.now) {
          await this.expireInvitation(transaction, row, input.now);
        }
        return { outcome: 'invalid_or_expired' };
      }
      await transaction`
        update private.attribution_invitations
        set invitation_token_exchanged_at = ${input.now}, updated_at = ${input.now}
        where id = ${row.id}
      `;
      await transaction`
        insert into private.attribution_invitation_sessions (
          session_hash, invitation_id, account_id, expires_at, created_at
        ) values (
          ${input.invitationSessionHash}, ${row.id}, ${input.actorAccountId ?? null},
          ${input.sessionExpiresAt}, ${input.now}
        )
      `;
      return { invitation: this.map(row), outcome: 'exchanged' };
    });
  }

  async exchangeExternalRecoveryCode(
    input: Parameters<AttributionInvitationRepository['exchangeExternalRecoveryCode']>[0],
  ): ReturnType<AttributionInvitationRepository['exchangeExternalRecoveryCode']> {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<InvitationRow[]>`
        select ${this.columns(transaction)}
        from private.attribution_invitations as invitation
        where invitation.kind = 'external'
          and invitation.state = 'accepted'
          and invitation.recovery_code_hash = ${input.recoveryCodeHash}
        for update of invitation
      `;
      const invitation = rows[0];
      if (invitation === undefined) return { outcome: 'invalid_or_expired' };
      await transaction`
        insert into private.attribution_invitation_sessions (
          session_hash, invitation_id, account_id, expires_at, created_at
        ) values (
          ${input.invitationSessionHash}, ${invitation.id}, null,
          ${input.sessionExpiresAt}, ${input.now}
        )
      `;
      return { invitation: this.map(invitation), outcome: 'exchanged' };
    });
  }

  async acceptExternalInvitation(
    input: Parameters<AttributionInvitationRepository['acceptExternalInvitation']>[0],
  ): ReturnType<AttributionInvitationRepository['acceptExternalInvitation']> {
    return this.database.sql.begin(async (transaction) => {
      await this.lockIdempotency(transaction, input.idempotencyKey);
      const payload = {
        attribution: input.attribution,
        expectedVersion: input.expectedVersion,
      };
      const replay = await this.resolveReplay(
        transaction,
        null,
        input.idempotencyKey,
        'invitation_accepted',
        payload,
      );
      if (replay.outcome === 'conflict') return { outcome: 'idempotency_conflict' };
      if (replay.outcome === 'replay') return { outcome: 'replayed' };
      const row = await this.lockExternalSessionInvitation(
        transaction,
        input.invitationSessionHash,
        input.now,
      );
      const failure = await this.transitionFailure(
        transaction,
        row,
        input.expectedVersion,
        input.now,
      );
      if (failure !== null) return { outcome: failure };
      const current = this.required(row);
      const linked = await transaction<Array<{ person_id: string }>>`
        select account.person_id
        from private.attribution_invitation_sessions as session
        join public.accounts as account on account.id = session.account_id
        where session.session_hash = ${input.invitationSessionHash}
        limit 1
      `;
      const linkedPerson = linked[0];
      const personId = linkedPerson?.person_id ?? (await this.createExternalPerson(transaction));
      const updated = await transaction<InvitationRow[]>`
        update private.attribution_invitations
        set state = 'accepted', accepted_person_id = ${personId},
            attribution_name = ${input.attribution.attributionName},
            contribution_role = ${input.attribution.contributionRole},
            affiliation = ${input.attribution.affiliation ?? null},
            public_attribution_consented_at = ${input.now},
            recovery_code_hash = ${input.recoveryCodeHash}, resolved_at = ${input.now},
            updated_at = ${input.now}, version = version + 1
        where id = ${current.id}
        returning ${this.returning(transaction)}
      `;
      const accepted = this.required(updated[0]);
      await transaction`
        update private.attribution_invitation_sessions
        set revoked_at = ${input.now}
        where invitation_id = ${accepted.id} and revoked_at is null
      `;
      await this.recordOperation(transaction, {
        actorAccountId: null,
        idempotencyKey: input.idempotencyKey,
        invitationId: accepted.id,
        now: input.now,
        operation: 'invitation_accepted',
        payload,
        resultingState: 'accepted',
        resultingVersion: Number(accepted.version),
      });
      await this.emitSubmitterEvent(
        transaction,
        accepted,
        'attribution_invitation_accepted',
        input.now,
      );
      return { outcome: 'accepted' };
    });
  }

  async rejectExternalInvitation(
    input: Parameters<AttributionInvitationRepository['rejectExternalInvitation']>[0],
  ): ReturnType<AttributionInvitationRepository['rejectExternalInvitation']> {
    return this.database.sql.begin(async (transaction) => {
      await this.lockIdempotency(transaction, input.idempotencyKey);
      const payload = { expectedVersion: input.expectedVersion };
      const replay = await this.resolveReplay(
        transaction,
        null,
        input.idempotencyKey,
        'invitation_rejected',
        payload,
      );
      if (replay.outcome === 'conflict') return { outcome: 'idempotency_conflict' };
      if (replay.outcome === 'replay') return { outcome: 'replayed' };
      const row = await this.lockExternalSessionInvitation(
        transaction,
        input.invitationSessionHash,
        input.now,
      );
      const failure = await this.transitionFailure(
        transaction,
        row,
        input.expectedVersion,
        input.now,
      );
      if (failure !== null) return { outcome: failure };
      const rejected = await this.updateSimpleState(
        transaction,
        this.required(row),
        'rejected',
        input.now,
      );
      await this.recordOperation(transaction, {
        actorAccountId: null,
        idempotencyKey: input.idempotencyKey,
        invitationId: rejected.id,
        now: input.now,
        operation: 'invitation_rejected',
        payload,
        resultingState: 'rejected',
        resultingVersion: Number(rejected.version),
      });
      await transaction`
        update private.attribution_invitation_sessions set revoked_at = ${input.now}
        where invitation_id = ${rejected.id} and revoked_at is null
      `;
      await this.emitSubmitterEvent(
        transaction,
        rejected,
        'attribution_invitation_rejected',
        input.now,
      );
      return { outcome: 'rejected' };
    });
  }

  async listReceivedInvitations(
    accountId: string,
    limit: number,
    cursor: string | undefined,
    now: Date,
  ): Promise<AttributionInvitationPage> {
    return this.database.sql.begin(async (transaction) => {
      await this.expireForRecipient(transaction, accountId, now);
      const pageCursor = this.decodeCursor(cursor);
      const rows = await transaction<InvitationRow[]>`
        select ${this.columns(transaction)}
        from private.attribution_invitations as invitation
        join public.accounts as account on account.person_id = invitation.invitee_person_id
        where account.id = ${accountId}
          and ${this.cursorCondition(transaction, pageCursor)}
        order by invitation.created_at desc, invitation.id desc
        limit ${limit + 1}
      `;
      return this.page(rows, limit);
    });
  }

  async findExternalSessionInvitation(
    invitationSessionHash: string,
    now: Date,
  ): Promise<AttributionInvitationView | null> {
    const rows = await this.database.sql<InvitationRow[]>`
      select ${this.columns(this.database.sql)}
      from private.attribution_invitations as invitation
      join private.attribution_invitation_sessions as session
        on session.invitation_id = invitation.id
      where session.session_hash = ${invitationSessionHash}
        and session.revoked_at is null
        and session.expires_at > ${now}
        and invitation.kind = 'external'
      limit 1
    `;
    return rows[0] === undefined ? null : this.map(rows[0]);
  }

  async listWorkInvitations(
    actorAccountId: string,
    publicId: string,
    limit: number,
    cursor: string | undefined,
    now: Date,
  ): Promise<AttributionInvitationPage | null> {
    return this.database.sql.begin(async (transaction) => {
      const workRows = await transaction<Array<{ id: string }>>`
        select work.id
        from public.works as work
        join public.accounts as account on account.person_id = work.submitter_person_id
        where account.id = ${actorAccountId} and work.public_id = ${publicId}
        limit 1
      `;
      const work = workRows[0];
      if (work === undefined) return null;
      await this.expireForWork(transaction, work.id, now);
      const pageCursor = this.decodeCursor(cursor);
      const rows = await transaction<InvitationRow[]>`
        select ${this.columns(transaction)}
        from private.attribution_invitations as invitation
        where invitation.work_id = ${work.id}
          and ${this.cursorCondition(transaction, pageCursor)}
        order by invitation.created_at desc, invitation.id desc
        limit ${limit + 1}
      `;
      return this.page(rows, limit);
    });
  }

  private async accountRecipientTransition<State extends 'rejected' | 'withdrawn'>(
    input:
      | Parameters<AttributionInvitationRepository['rejectAccountInvitation']>[0]
      | Parameters<AttributionInvitationRepository['withdrawAccountAttribution']>[0],
    state: State,
    operation: 'invitation_rejected' | 'attribution_withdrawn',
  ): Promise<{ outcome: State | 'replayed' | InvitationFailureOutcome }> {
    return this.database.sql.begin(async (transaction) => {
      await this.lockIdempotency(transaction, input.idempotencyKey);
      const payload = {
        expectedVersion: input.expectedVersion,
        invitationPublicId: input.invitationPublicId,
      };
      const replay = await this.resolveReplay(
        transaction,
        input.actorAccountId,
        input.idempotencyKey,
        operation,
        payload,
      );
      if (replay.outcome === 'conflict') return { outcome: 'idempotency_conflict' };
      if (replay.outcome === 'replay') return { outcome: 'replayed' };
      const row = await this.lockAccountInvitation(
        transaction,
        input.actorAccountId,
        input.invitationPublicId,
      );
      if (row === undefined) return { outcome: 'not_found' };
      if (Number(row.version) !== input.expectedVersion) return { outcome: 'version_conflict' };
      if (
        (state === 'rejected' && row.state !== 'pending') ||
        (state === 'withdrawn' && row.state !== 'accepted')
      ) {
        return { outcome: 'invalid_transition' };
      }
      if (row.state === 'pending' && row.expires_at <= input.now) {
        await this.expireInvitation(transaction, row, input.now);
        return { outcome: 'invalid_transition' };
      }
      const updated = await this.updateSimpleState(transaction, row, state, input.now);
      await this.recordOperation(transaction, {
        actorAccountId: input.actorAccountId,
        idempotencyKey: input.idempotencyKey,
        invitationId: updated.id,
        now: input.now,
        operation,
        payload,
        resultingState: state,
        resultingVersion: Number(updated.version),
      });
      await this.emitSubmitterEvent(
        transaction,
        updated,
        state === 'rejected' ? 'attribution_invitation_rejected' : 'attribution_withdrawn',
        input.now,
      );
      return { outcome: state };
    });
  }

  private async consumeLookupAttempt(
    sql: postgres.TransactionSql,
    input: { actorAccountId: string; now: Date; sourceKeyHash: string },
  ): Promise<boolean> {
    const windowStart = new Date(input.now.getTime() - LOOKUP_WINDOW_MILLISECONDS);
    const accountRows = await sql<Array<{ attempt_count: number }>>`
      insert into private.attribution_account_lookup_rate_limits (
        actor_account_id, window_started_at, attempt_count
      ) values (${input.actorAccountId}, ${input.now}, 1)
      on conflict (actor_account_id) do update
      set window_started_at = case
            when attribution_account_lookup_rate_limits.window_started_at <= ${windowStart}
              then ${input.now}
            else attribution_account_lookup_rate_limits.window_started_at
          end,
          attempt_count = case
            when attribution_account_lookup_rate_limits.window_started_at <= ${windowStart} then 1
            else attribution_account_lookup_rate_limits.attempt_count + 1
          end
      returning attempt_count
    `;
    const sourceRows = await sql<Array<{ attempt_count: number }>>`
      insert into private.attribution_source_lookup_rate_limits (
        source_key_hash, window_started_at, attempt_count
      ) values (${input.sourceKeyHash}, ${input.now}, 1)
      on conflict (source_key_hash) do update
      set window_started_at = case
            when attribution_source_lookup_rate_limits.window_started_at <= ${windowStart}
              then ${input.now}
            else attribution_source_lookup_rate_limits.window_started_at
          end,
          attempt_count = case
            when attribution_source_lookup_rate_limits.window_started_at <= ${windowStart} then 1
            else attribution_source_lookup_rate_limits.attempt_count + 1
          end
      returning attempt_count
    `;
    return (
      this.required(accountRows[0]).attempt_count <= LOOKUP_LIMIT &&
      this.required(sourceRows[0]).attempt_count <= LOOKUP_LIMIT
    );
  }

  private async lockOwnedWork(sql: postgres.TransactionSql, accountId: string, publicId: string) {
    const rows = await sql<Array<{ id: string }>>`
      select work.id
      from public.works as work
      join public.accounts as account on account.person_id = work.submitter_person_id
      join private.work_drafts as draft on draft.work_id = work.id
      where account.id = ${accountId}
        and work.public_id = ${publicId}
        and work.activity_state = 'active'
      for update of work, draft
    `;
    return rows[0]?.id ?? null;
  }

  private async activeCount(sql: postgres.TransactionSql, workId: string): Promise<number> {
    const rows = await sql<Array<{ count: number }>>`
      select count(*)::integer as count
      from private.attribution_invitations
      where work_id = ${workId} and state in ('pending', 'accepted')
    `;
    return this.required(rows[0]).count;
  }

  private async hasPendingPersonInvitation(sql: Sql, workId: string, personId: string) {
    const rows = await sql<Array<{ exists: boolean }>>`
      select exists(
        select 1 from private.attribution_invitations
        where work_id = ${workId} and invitee_person_id = ${personId} and state = 'pending'
      ) as exists
    `;
    return this.required(rows[0]).exists;
  }

  private async isSubmitter(sql: Sql, workId: string, personId: string) {
    const rows = await sql<Array<{ exists: boolean }>>`
      select exists(
        select 1 from public.works where id = ${workId} and submitter_person_id = ${personId}
      ) as exists
    `;
    return this.required(rows[0]).exists;
  }

  private async lockAccountInvitation(
    sql: postgres.TransactionSql,
    accountId: string,
    publicId: string,
  ) {
    const rows = await sql<InvitationRow[]>`
      select ${this.columns(sql)}
      from private.attribution_invitations as invitation
      join public.accounts as account on account.person_id = invitation.invitee_person_id
      join public.works as work on work.id = invitation.work_id
      join private.work_drafts as draft on draft.work_id = work.id
      where account.id = ${accountId}
        and invitation.public_id = ${publicId}
        and invitation.kind = 'account'
      for update of work, draft, invitation
    `;
    return rows[0];
  }

  private async lockExternalSessionInvitation(
    sql: postgres.TransactionSql,
    sessionHash: string,
    now: Date,
  ) {
    const rows = await sql<InvitationRow[]>`
      select ${this.columns(sql)}
      from private.attribution_invitations as invitation
      join private.attribution_invitation_sessions as session
        on session.invitation_id = invitation.id
      join public.works as work on work.id = invitation.work_id
      join private.work_drafts as draft on draft.work_id = work.id
      where session.session_hash = ${sessionHash}
        and session.revoked_at is null
        and session.expires_at > ${now}
        and invitation.kind = 'external'
      for update of work, draft, invitation, session
    `;
    return rows[0];
  }

  private async transitionFailure(
    sql: postgres.TransactionSql,
    row: InvitationRow | undefined,
    expectedVersion: number,
    now: Date,
  ): Promise<InvitationFailureOutcome | null> {
    if (row === undefined) return 'not_found';
    if (Number(row.version) !== expectedVersion) return 'version_conflict';
    if (row.state !== 'pending') return 'invalid_transition';
    if (row.expires_at <= now) {
      await this.expireInvitation(sql, row, now);
      return 'invalid_transition';
    }
    return null;
  }

  private async updateSimpleState(
    sql: postgres.TransactionSql,
    row: InvitationRow,
    state: 'rejected' | 'revoked' | 'withdrawn',
    now: Date,
  ) {
    const rows = await sql<InvitationRow[]>`
      update private.attribution_invitations
      set state = ${state}, resolved_at = ${now}, updated_at = ${now}, version = version + 1
      where id = ${row.id}
      returning ${this.returning(sql)}
    `;
    return this.required(rows[0]);
  }

  private async expireInvitation(sql: postgres.TransactionSql, row: InvitationRow, now: Date) {
    const expired = await sql<InvitationRow[]>`
      update private.attribution_invitations
      set state = 'expired', resolved_at = ${now}, updated_at = ${now}, version = version + 1
      where id = ${row.id} and state = 'pending'
      returning ${this.returning(sql)}
    `;
    const updated = expired[0];
    if (updated !== undefined) {
      await this.emitSubmitterEvent(sql, updated, 'attribution_invitation_expired', now);
    }
  }

  private async hasExchangedToken(sql: Sql, invitationId: string) {
    const rows = await sql<Array<{ exchanged: boolean }>>`
      select invitation_token_exchanged_at is not null as exchanged
      from private.attribution_invitations where id = ${invitationId}
    `;
    return this.required(rows[0]).exchanged;
  }

  private async createExternalPerson(sql: postgres.TransactionSql): Promise<string> {
    const rows = await sql<
      Array<{ id: string }>
    >`insert into public.people default values returning id`;
    return this.required(rows[0]).id;
  }

  private async resolveReplay(
    sql: Sql,
    actorAccountId: string | null,
    idempotencyKey: string,
    operation: Operation,
    payload: postgres.JSONValue,
  ): Promise<Replay> {
    const rows = await sql<OperationRow[]>`
      select invitation_id,
        (actor_account_id is not distinct from ${actorAccountId}
          and operation = ${operation}
          and request_payload = ${sql.json(payload)}) as is_equivalent
      from private.attribution_invitation_operations
      where idempotency_key = ${idempotencyKey}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) return { outcome: 'none' };
    return row.is_equivalent
      ? { invitationId: row.invitation_id, outcome: 'replay' }
      : { outcome: 'conflict' };
  }

  private async lockIdempotency(
    sql: postgres.TransactionSql,
    idempotencyKey: string,
  ): Promise<void> {
    await sql`select pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))`;
  }

  private async recordOperation(
    sql: Sql,
    input: {
      actorAccountId: string | null;
      idempotencyKey: string;
      invitationId: string | null;
      now: Date;
      operation: Operation;
      payload: postgres.JSONValue;
      resultingState?: AttributionInvitationView['state'];
      resultingVersion?: number;
    },
  ) {
    await sql`
      insert into private.attribution_invitation_operations (
        idempotency_key, invitation_id, actor_account_id, operation, request_payload,
        resulting_state, resulting_version, occurred_at
      ) values (
        ${input.idempotencyKey}, ${input.invitationId}, ${input.actorAccountId}, ${input.operation},
        ${sql.json(input.payload)}, ${input.resultingState ?? null},
        ${input.resultingVersion ?? null}, ${input.now}
      )
    `;
  }

  private async emitEvent(
    sql: Sql,
    aggregateId: string,
    eventType: string,
    payload: postgres.JSONValue,
    now: Date,
  ) {
    await sql`
      insert into private.outbox_events (
        aggregate_type, aggregate_id, event_type, payload, occurred_at
      ) values ('attribution_invitation', ${aggregateId}, ${eventType}, ${sql.json(payload)}, ${now})
      on conflict (aggregate_type, aggregate_id, event_type) do nothing
    `;
  }

  private async emitSubmitterEvent(
    sql: Sql,
    invitation: InvitationRow,
    eventType: string,
    now: Date,
  ) {
    const rows = await sql<Array<{ account_id: string; work_public_id: string }>>`
      select account.id as account_id, work.public_id as work_public_id
      from public.works as work
      join public.accounts as account on account.person_id = work.submitter_person_id
      where work.id = ${invitation.work_id}
      limit 1
    `;
    const recipient = this.required(rows[0]);
    await this.emitEvent(
      sql,
      invitation.id,
      eventType,
      {
        invitationPublicId: invitation.public_id,
        recipientAccountId: recipient.account_id,
        workPublicId: recipient.work_public_id,
      },
      now,
    );
  }

  private async emitRecipientEvent(
    sql: Sql,
    invitation: InvitationRow,
    eventType: string,
    now: Date,
  ) {
    const rows = await sql<Array<{ account_id: string; work_public_id: string }>>`
      select account.id as account_id, work.public_id as work_public_id
      from public.accounts as account
      join public.works as work on work.id = ${invitation.work_id}
      where account.person_id = (
        select invitee_person_id from private.attribution_invitations where id = ${invitation.id}
      )
      limit 1
    `;
    const recipient = rows[0];
    if (recipient !== undefined) {
      await this.emitEvent(
        sql,
        invitation.id,
        eventType,
        {
          invitationPublicId: invitation.public_id,
          recipientAccountId: recipient.account_id,
          workPublicId: recipient.work_public_id,
        },
        now,
      );
    }
  }

  private async expireForRecipient(sql: postgres.TransactionSql, accountId: string, now: Date) {
    const rows = await sql<InvitationRow[]>`
      update private.attribution_invitations as invitation
      set state = 'expired', resolved_at = ${now}, updated_at = ${now}, version = version + 1
      from public.accounts as account
      where account.id = ${accountId}
        and account.person_id = invitation.invitee_person_id
        and invitation.state = 'pending'
        and invitation.expires_at <= ${now}
      returning ${this.returning(sql, 'invitation')}
    `;
    for (const row of rows) {
      await this.emitSubmitterEvent(sql, row, 'attribution_invitation_expired', now);
    }
  }

  private async expireForWork(sql: postgres.TransactionSql, workId: string, now: Date) {
    const rows = await sql<InvitationRow[]>`
      update private.attribution_invitations as invitation
      set state = 'expired', resolved_at = ${now}, updated_at = ${now}, version = version + 1
      where invitation.work_id = ${workId}
        and invitation.state = 'pending'
        and invitation.expires_at <= ${now}
      returning ${this.returning(sql, 'invitation')}
    `;
    for (const row of rows) {
      await this.emitSubmitterEvent(sql, row, 'attribution_invitation_expired', now);
    }
  }

  private async findInvitation(sql: Sql, id: string): Promise<AttributionInvitationView | null> {
    const rows = await sql<InvitationRow[]>`
      select ${this.columns(sql)} from private.attribution_invitations as invitation
      where invitation.id = ${id} limit 1
    `;
    return rows[0] === undefined ? null : this.map(rows[0]);
  }

  private page(rows: InvitationRow[], limit: number): AttributionInvitationPage {
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      items: visible.map((row) => this.map(row)),
      nextCursor:
        rows.length > limit && last !== undefined
          ? Buffer.from(JSON.stringify([last.created_at.toISOString(), last.id])).toString(
              'base64url',
            )
          : null,
    };
  }

  private decodeCursor(cursor?: string): { createdAt: Date; id: string } | null {
    if (cursor === undefined) return null;
    try {
      const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (
        !Array.isArray(value) ||
        value.length !== 2 ||
        typeof value[0] !== 'string' ||
        typeof value[1] !== 'string'
      )
        return null;
      const createdAt = new Date(value[0]);
      return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: value[1] };
    } catch {
      return null;
    }
  }

  private cursorCondition(sql: Sql, cursor: { createdAt: Date; id: string } | null) {
    return cursor === null
      ? sql`true`
      : sql`(invitation.created_at, invitation.id) < (${cursor.createdAt}, ${cursor.id}::uuid)`;
  }

  private columns(sql: Sql) {
    return sql`
      invitation.id, invitation.public_id, invitation.work_id, invitation.kind,
      invitation.state, invitation.proposed_attribution_name,
      invitation.proposed_contribution_role, invitation.proposed_affiliation,
      invitation.attribution_name, invitation.study_year, invitation.contribution_role,
      invitation.affiliation, invitation.expires_at, invitation.version, invitation.created_at
    `;
  }

  private returning(sql: Sql, alias?: string) {
    if (alias !== undefined) {
      return sql`
        invitation.id, invitation.public_id, invitation.work_id, invitation.kind,
        invitation.state, invitation.proposed_attribution_name,
        invitation.proposed_contribution_role, invitation.proposed_affiliation,
        invitation.attribution_name, invitation.study_year, invitation.contribution_role,
        invitation.affiliation, invitation.expires_at, invitation.version, invitation.created_at
      `;
    }
    return sql`
      id, public_id, work_id, kind, state, proposed_attribution_name,
      proposed_contribution_role, proposed_affiliation, attribution_name, study_year,
      contribution_role, affiliation, expires_at, version, created_at
    `;
  }

  private map(row: InvitationRow): AttributionInvitationView {
    return {
      affiliation: row.affiliation ?? row.proposed_affiliation,
      attributionName: row.attribution_name,
      contributionRole: row.contribution_role ?? row.proposed_contribution_role,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      kind: row.kind,
      proposedAttributionName: row.proposed_attribution_name,
      publicId: row.public_id,
      state: row.state,
      studyYear: row.study_year,
      version: Number(row.version),
    };
  }

  private required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('ATTRIBUTION_PERSISTENCE_INVARIANT');
    return value;
  }
}
