import { describe, expect, it } from 'vitest';
import { obligationSchema } from './student-collection-forms-contract';

const FIELD = {
  description: '',
  id: 'company',
  label: 'บริษัท',
  required: true,
  type: 'short_text' as const,
};

describe('obligationSchema', () => {
  it('accepts draft state separately from the immutable latest submission schema', () => {
    const result = obligationSchema.parse({
      draft: {
        answers: { company: 'CSI' },
        files: {},
        updatedAt: '2026-09-25T00:00:00.000Z',
        version: 2,
      },
      firstSubmittedAt: '2026-09-24T00:00:00.000Z',
      form: {
        createdFromTemplateId: null,
        deadlineAt: null,
        description: '',
        fields: [FIELD],
        groupId: '40000000-0000-4000-8000-000000000001',
        id: '50000000-0000-4000-8000-000000000001',
        status: 'open',
        title: 'เอกสารฝึกงาน',
        version: 3,
      },
      hasDeadlinePassed: false,
      isLate: false,
      isWritable: true,
      latestCheckingReason: 'กรุณาแก้ไข',
      latestSubmission: {
        answers: { company: 'CSI' },
        fields: [FIELD],
        files: {},
        formVersion: 2,
        id: '60000000-0000-4000-8000-000000000001',
        submittedAt: '2026-09-24T00:00:00.000Z',
        version: 1,
      },
      rosterName: { firstNameTh: 'ทดสอบ', lastNameTh: 'ระบบ' },
      status: 'changes_required',
    });

    expect(result.draft?.version).toBe(2);
    expect(result.latestSubmission?.formVersion).toBe(2);
    expect(result.latestSubmission?.fields).toEqual([FIELD]);
  });
});
