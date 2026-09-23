import {
  REMINDER_LEAD_DAYS,
  buildDeadlineReminders,
  describeNotificationKind,
  isDispatchEligible,
  type NotificationObligationState,
} from './collection-notifications';

const deadline = new Date('2026-09-20T17:00:00.000Z');

function state(overrides: Partial<NotificationObligationState> = {}): NotificationObligationState {
  return {
    deadlineAt: deadline,
    firstSubmittedAt: null,
    isMembershipCurrent: true,
    isRoundClosed: false,
    obligationStatus: 'not_submitted',
    ...overrides,
  };
}

describe('isDispatchEligible', () => {
  it('allows a notification while the round is open and the obligation stands', () => {
    expect(isDispatchEligible(state())).toBe(true);
  });

  /*
   * The rule the specification states twice: a closed round suppresses pending
   * notifications at dispatch time, not at the time they were queued.
   */
  it('suppresses a notification once the round has closed', () => {
    expect(isDispatchEligible(state({ isRoundClosed: true }))).toBe(false);
  });

  it('suppresses a notification once the member has been withdrawn', () => {
    expect(isDispatchEligible(state({ isMembershipCurrent: false }))).toBe(false);
  });

  it('suppresses a notification for an obligation that no longer exists', () => {
    expect(isDispatchEligible(null)).toBe(false);
  });
});

describe('buildDeadlineReminders', () => {
  it('reminds three days and one day before the deadline', () => {
    const reminders = buildDeadlineReminders(state());
    expect(reminders.map((reminder) => reminder.leadDays)).toEqual(REMINDER_LEAD_DAYS);
  });

  it('schedules each reminder the stated number of days before the deadline', () => {
    const reminders = buildDeadlineReminders(state());
    expect(reminders[0]?.dueAt).toEqual(new Date('2026-09-17T17:00:00.000Z'));
    expect(reminders[1]?.dueAt).toEqual(new Date('2026-09-19T17:00:00.000Z'));
  });

  /* A reminder to submit is meaningless once something has been submitted. */
  it('schedules nothing once a first submission exists', () => {
    expect(buildDeadlineReminders(state({ firstSubmittedAt: new Date() }))).toEqual([]);
  });

  it('schedules nothing for a form with no deadline', () => {
    expect(buildDeadlineReminders(state({ deadlineAt: null }))).toEqual([]);
  });

  it('schedules nothing once the round has closed', () => {
    expect(buildDeadlineReminders(state({ isRoundClosed: true }))).toEqual([]);
  });

  it('schedules nothing for a withdrawn member', () => {
    expect(buildDeadlineReminders(state({ isMembershipCurrent: false }))).toEqual([]);
  });

  /*
   * Reminders chase a missing first submission. A Student asked to correct a
   * passed-back response has already submitted, so the deadline reminder is not
   * the right instrument.
   */
  it('schedules nothing once the obligation has moved past not_submitted', () => {
    expect(buildDeadlineReminders(state({ obligationStatus: 'awaiting_checking' }))).toEqual([]);
    expect(buildDeadlineReminders(state({ obligationStatus: 'passed' }))).toEqual([]);
  });
});

describe('describeNotificationKind', () => {
  it('distinguishes every notification the specification names', () => {
    expect(describeNotificationKind('obligation_assigned').isReminder).toBe(false);
    expect(describeNotificationKind('changes_requested').isReminder).toBe(false);
    expect(describeNotificationKind('submission_passed').isReminder).toBe(false);
    expect(describeNotificationKind('deadline_reminder').isReminder).toBe(true);
  });
});
