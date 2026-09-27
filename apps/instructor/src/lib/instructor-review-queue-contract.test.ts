import { describe, expect, it } from 'vitest';
import { reviewQueueSchema } from './instructor-collection-forms-contract';

const file = {
  byteSize: 1_024,
  createdAt: '2026-09-26T06:55:00.000Z',
  fieldId: 'attachment',
  id: '30000000-0000-4000-8000-000000000001',
  inspectionErrorCode: null,
  originalFilename: 'report.pdf',
  status: 'ready',
};

const queue = {
  entries: [
    {
      firstSubmittedAt: '2026-09-26T07:00:00.000Z',
      isLate: false,
      latestCheckingReason: null,
      latestSubmission: {
        answers: {},
        fields: [],
        files: { attachment: [file] },
        formVersion: 2,
        id: '50000000-0000-4000-8000-000000000001',
        submittedAt: '2026-09-26T07:00:00.000Z',
        version: 1,
      },
      rosterName: { firstNameTh: 'สมชาย', lastNameTh: 'ตัวอย่าง' },
      status: 'awaiting_checking',
      studentAccountId: '40000000-0000-4000-8000-000000000001',
      studentId: '66000001',
    },
  ],
  form: {
    createdFromTemplateId: null,
    deadlineAt: '2026-09-30T10:00:00.000Z',
    description: 'ส่งเอกสาร',
    fields: [],
    groupId: '10000000-0000-4000-8000-000000000001',
    id: '20000000-0000-4000-8000-000000000001',
    status: 'open',
    title: 'เอกสารฝึกงาน',
    version: 2,
  },
};

describe('reviewQueueSchema', () => {
  it('accepts a submitted file projected by Core', () => {
    expect(reviewQueueSchema.parse(queue)).toMatchObject(queue);
  });

  it('rejects private file metadata from Core domain objects', () => {
    const internalFile = {
      ...file,
      declaredContentType: 'application/pdf',
      detectedContentType: 'application/pdf',
      formId: queue.form.id,
      studentAccountId: queue.entries[0]?.studentAccountId,
    };
    const response = {
      ...queue,
      entries: [
        {
          ...queue.entries[0],
          latestSubmission: {
            ...queue.entries[0]?.latestSubmission,
            files: { attachment: [internalFile] },
          },
        },
      ],
    };

    expect(reviewQueueSchema.safeParse(response).success).toBe(false);
  });
});
