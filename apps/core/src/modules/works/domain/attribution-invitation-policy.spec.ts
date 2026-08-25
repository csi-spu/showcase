import {
  evaluateAttributionAcceptance,
  transitionAttributionInvitation,
} from './attribution-invitation-policy';

describe('Attribution Invitation policy', () => {
  const now = new Date('2026-08-25T10:00:00.000Z');
  const later = new Date('2026-08-26T10:00:00.000Z');

  it.each([
    ['accept', 'accepted'],
    ['reject', 'rejected'],
    ['revoke', 'revoked'],
  ] as const)('moves a pending invitation through %s', (action, expected) => {
    expect(
      transitionAttributionInvitation({
        action,
        expiresAt: later,
        now,
        state: 'pending',
      }),
    ).toEqual({ outcome: 'transitioned', state: expected });
  });

  it('expires an overdue pending invitation before another outcome', () => {
    expect(
      transitionAttributionInvitation({
        action: 'accept',
        expiresAt: new Date('2026-08-25T09:59:59.999Z'),
        now,
        state: 'pending',
      }),
    ).toEqual({ outcome: 'expired', state: 'expired' });
  });

  it('allows an accepted Contributor to withdraw and rejects every other terminal transition', () => {
    expect(
      transitionAttributionInvitation({
        action: 'withdraw',
        expiresAt: later,
        now,
        state: 'accepted',
      }),
    ).toEqual({ outcome: 'transitioned', state: 'withdrawn' });
    for (const state of ['rejected', 'revoked', 'expired', 'withdrawn'] as const) {
      expect(
        transitionAttributionInvitation({ action: 'accept', expiresAt: later, now, state }),
      ).toEqual({ outcome: 'invalid_transition', state });
    }
  });

  it('requires explicit consent, a bounded name, and Study Year 1 through 8 for Account attribution', () => {
    expect(
      evaluateAttributionAcceptance({
        attributionName: '  สมหญิง ใจดี  ',
        consent: true,
        kind: 'account',
        studyYear: 4,
      }),
    ).toEqual({
      attribution: { attributionName: 'สมหญิง ใจดี', kind: 'account', studyYear: 4 },
      isValid: true,
    });
    for (const studyYear of [0, 9]) {
      expect(
        evaluateAttributionAcceptance({
          attributionName: 'สมหญิง ใจดี',
          consent: true,
          kind: 'account',
          studyYear,
        }).isValid,
      ).toBe(false);
    }
    expect(
      evaluateAttributionAcceptance({
        attributionName: 'สมหญิง ใจดี',
        consent: false,
        kind: 'account',
        studyYear: 4,
      }).isValid,
    ).toBe(false);
  });

  it('requires an External Contributor role and bounds optional affiliation without Study Year', () => {
    expect(
      evaluateAttributionAcceptance({
        affiliation: '  ชุมชนโอเพนซอร์ส  ',
        attributionName: '  Alex Example  ',
        consent: true,
        contributionRole: '  ที่ปรึกษาด้าน UX  ',
        kind: 'external',
      }),
    ).toEqual({
      attribution: {
        affiliation: 'ชุมชนโอเพนซอร์ส',
        attributionName: 'Alex Example',
        contributionRole: 'ที่ปรึกษาด้าน UX',
        kind: 'external',
      },
      isValid: true,
    });
    expect(
      evaluateAttributionAcceptance({
        attributionName: 'Alex Example',
        consent: true,
        contributionRole: '',
        kind: 'external',
      }).isValid,
    ).toBe(false);
  });
});
