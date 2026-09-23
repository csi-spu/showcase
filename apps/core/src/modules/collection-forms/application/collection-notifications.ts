/*
 * In-website notification policy for the private collection.
 *
 * Two rules shape everything here:
 *
 * - Eligibility is decided at *dispatch* time, never at queue time. A round
 *   that closes, or a membership that is withdrawn, suppresses work that was
 *   already queued. Deciding earlier would deliver a notification telling a
 *   Student to act on something they can no longer act on.
 * - Deadline reminders chase a *missing first submission*. Once anything has
 *   been submitted the reminder is the wrong instrument, whatever happens to
 *   the response afterwards.
 *
 * Reminders are derived from the obligation rather than stored as scheduled
 * rows, so extending a deadline moves them and closing a round removes them
 * without a backfill. Only the fact that one was delivered is recorded.
 */

/** Days before the deadline a Student is reminded, earliest first. */
export const REMINDER_LEAD_DAYS = [3, 1] as const;

/* One screen of history. The feed is a prompt to act, not an archive. */
export const MAX_NOTIFICATION_FEED = 50;

/* Bounds one worker pass, so a large cohort drains over several polls. */
export const MAX_REMINDER_BATCH = 200;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** The notifications the specification names. Nothing is sent by email or LINE. */
export type CollectionNotificationKind =
  'changes_requested' | 'deadline_reminder' | 'obligation_assigned' | 'submission_passed';

/**
 * What a notification is checked against when it is about to be delivered.
 *
 * `null` stands for an obligation that no longer exists at all, which is why
 * `isDispatchEligible` accepts it rather than forcing every caller to branch.
 */
export interface NotificationObligationState {
  deadlineAt: Date | null;
  firstSubmittedAt: Date | null;
  isMembershipCurrent: boolean;
  isRoundClosed: boolean;
  obligationStatus: 'awaiting_checking' | 'changes_required' | 'not_submitted' | 'passed';
}

export interface DeadlineReminder {
  /** When the reminder becomes due, derived from the form's current deadline. */
  dueAt: Date;
  leadDays: number;
}

/**
 * Whether a queued notification may still be delivered.
 *
 * Checked at the moment of dispatch: closing a round suppresses everything
 * pending for it, and withdrawing a member suppresses everything pending for
 * them, without either action having to find and cancel individual rows.
 */
export function isDispatchEligible(state: NotificationObligationState | null): boolean {
  if (state === null) return false;
  return !state.isRoundClosed && state.isMembershipCurrent;
}

/**
 * The deadline reminders this obligation currently warrants.
 *
 * Returns nothing rather than an empty schedule when a reminder would be
 * pointless: no deadline to count back from, something already submitted, or
 * an obligation that can no longer be acted on.
 */
export function buildDeadlineReminders(
  state: NotificationObligationState | null,
): DeadlineReminder[] {
  if (!isDispatchEligible(state) || state === null) return [];
  if (state.deadlineAt === null) return [];
  /* A reminder to submit is meaningless once something has been submitted. */
  if (state.firstSubmittedAt !== null) return [];
  if (state.obligationStatus !== 'not_submitted') return [];

  const deadline = state.deadlineAt.getTime();
  return REMINDER_LEAD_DAYS.map((leadDays) => ({
    dueAt: new Date(deadline - leadDays * MILLISECONDS_PER_DAY),
    leadDays,
  }));
}

/**
 * Whether a kind is a recurring reminder or a one-off event.
 *
 * Events are recorded once per occurrence; reminders are recorded once per
 * lead time, so a deadline that moves does not re-send one already delivered.
 */
export function describeNotificationKind(kind: CollectionNotificationKind): {
  isReminder: boolean;
} {
  return { isReminder: kind === 'deadline_reminder' };
}
