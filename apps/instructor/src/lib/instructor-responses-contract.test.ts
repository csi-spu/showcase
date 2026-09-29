import { describe, expect, it } from 'vitest';
import {
  fieldAnswersPageSchema,
  previewTicketSchema,
  responseSummarySchema,
  submissionHistorySchema,
} from './instructor-collection-forms-contract';

const file = {
  byteSize: 1_024,
  createdAt: '2026-09-26T06:55:00.000Z',
  fieldId: 'poster',
  id: '30000000-0000-4000-8000-000000000001',
  inspectionErrorCode: null,
  isPreviewable: true,
  originalFilename: 'poster.png',
  status: 'ready',
};

const summary = {
  fields: [
    {
      answeredCount: 2,
      fieldId: 'track',
      options: [{ count: 2, value: 'ก' }],
      otherCount: 0,
      type: 'single_choice',
    },
    {
      answeredCount: 2,
      fieldId: 'score',
      histogram: [{ count: 2, from: 3, to: 3 }],
      stats: { max: 3, mean: 3, median: 3, min: 3 },
      type: 'number',
    },
    {
      answeredCount: 1,
      earliest: '2026-09-01',
      fieldId: 'start',
      latest: '2026-09-01',
      months: [{ count: 1, month: '2026-09' }],
      type: 'date',
    },
    {
      answeredCount: 1,
      fieldId: 'company',
      groups: { items: [{ count: 1, value: 'CSI' }], nextCursor: null },
      type: 'short_text',
    },
    {
      answeredCount: 1,
      answers: { items: [{ value: 'ยาว' }], nextCursor: 'bzoxMA' },
      fieldId: 'reflection',
      type: 'long_text',
    },
    { answeredCount: 1, fieldId: 'poster', fileCount: 1, notReadyCount: 0, type: 'file_upload' },
  ],
  form: {
    fields: [],
    id: '20000000-0000-4000-8000-000000000001',
    status: 'open',
    title: 'เอกสารฝึกงาน',
  },
  totals: { assigned: 3, awaitingChecking: 1, changesRequired: 0, notSubmitted: 1, passed: 1 },
};

describe('responseSummarySchema', () => {
  it('accepts every kind of question summary', () => {
    expect(responseSummarySchema.parse(summary)).toEqual(summary);
  });

  it('refuses a Summary that names who answered', () => {
    const named = {
      ...summary,
      fields: [{ ...summary.fields[0], studentAccountId: '40000000-0000-4000-8000-000000000001' }],
    };
    expect(responseSummarySchema.safeParse(named).success).toBe(false);
  });
});

describe('fieldAnswersPageSchema', () => {
  it('accepts a question page naming each Student', () => {
    const page = {
      items: [
        {
          files: [file],
          rosterName: { firstNameTh: 'สมชาย', lastNameTh: 'ตัวอย่าง' },
          studentAccountId: '40000000-0000-4000-8000-000000000001',
          studentId: '66000001',
          value: null,
        },
      ],
      kind: 'students',
      nextCursor: null,
    };
    expect(fieldAnswersPageSchema.parse(page)).toEqual(page);
  });

  it('refuses the detected content type, which stays inside Core', () => {
    const page = {
      items: [
        {
          files: [{ ...file, detectedContentType: 'image/png' }],
          rosterName: { firstNameTh: 'สมชาย', lastNameTh: 'ตัวอย่าง' },
          studentAccountId: '40000000-0000-4000-8000-000000000001',
          studentId: '66000001',
          value: null,
        },
      ],
      kind: 'students',
      nextCursor: null,
    };
    expect(fieldAnswersPageSchema.safeParse(page).success).toBe(false);
  });

  it('accepts Summary text pages as values only', () => {
    expect(
      fieldAnswersPageSchema.safeParse({
        items: [{ value: 'ยาว' }],
        kind: 'texts',
        nextCursor: null,
      }).success,
    ).toBe(true);
    expect(
      fieldAnswersPageSchema.safeParse({
        items: [{ count: 1, value: 'CSI' }],
        kind: 'groups',
        nextCursor: null,
      }).success,
    ).toBe(true);
  });
});

describe('previewTicketSchema', () => {
  it('accepts only an image type', () => {
    const ticket = { contentType: 'image/png', previewUrl: 'https://r2.example/poster?sig=x' };
    expect(previewTicketSchema.parse(ticket)).toEqual(ticket);
    expect(previewTicketSchema.safeParse({ ...ticket, contentType: 'text/html' }).success).toBe(
      false,
    );
  });
});

describe('submissionHistorySchema across the responses-area rollout', () => {
  it('accepts history files with and without the previewable flag', () => {
    const legacyFile = Object.fromEntries(
      Object.entries(file).filter(([key]) => key !== 'isPreviewable'),
    );
    const history = {
      entries: [
        {
          answers: {},
          checkingEvents: [],
          fields: [],
          files: { poster: [file, { ...legacyFile, id: '30000000-0000-4000-8000-000000000002' }] },
          formVersion: 1,
          id: '50000000-0000-4000-8000-000000000001',
          submittedAt: '2026-09-26T07:00:00.000Z',
          version: 1,
        },
      ],
      firstSubmittedAt: '2026-09-26T07:00:00.000Z',
      form: {
        deadlineAt: null,
        fields: [],
        id: '20000000-0000-4000-8000-000000000001',
        status: 'open',
        title: 'เอกสารฝึกงาน',
      },
      isLate: false,
      status: 'awaiting_checking',
    };
    expect(submissionHistorySchema.safeParse(history).success).toBe(true);
  });
});
