import { normalizeChangeRequest } from './review-decision-policy';

describe('Change Request policy', () => {
  it.each(['content', 'attribution', 'media', 'links_tags', 'policy', 'other'] as const)(
    'accepts reason %s with trimmed actionable feedback',
    (reason) => {
      expect(
        normalizeChangeRequest({
          feedback: '  กรุณาระบุรายละเอียดส่วนที่ต้องแก้ไขให้ชัดเจน  ',
          reason,
        }),
      ).toEqual({
        feedback: 'กรุณาระบุรายละเอียดส่วนที่ต้องแก้ไขให้ชัดเจน',
        reason,
      });
    },
  );

  it.each(['123456789', 'x'.repeat(2_001)])(
    'rejects feedback outside the 10 to 2,000 character boundary',
    (feedback) => {
      expect(normalizeChangeRequest({ feedback, reason: 'content' })).toBeNull();
    },
  );

  it('rejects unsupported reason codes at the domain boundary', () => {
    expect(
      normalizeChangeRequest({ feedback: 'คำแนะนำที่นำไปแก้ไขได้', reason: 'reject' }),
    ).toBeNull();
  });
});
