import type { CollectionFile } from '../application/collection-files';
import type { CollectionForm, CollectionReviewEntry } from '../application/collection-forms.ports';
import {
  toFieldAnswersView,
  toReviewPositionView,
  toReviewQueueView,
} from './collection-forms.view';

const FORM: CollectionForm = {
  createdFromTemplateId: null,
  deadlineAt: new Date('2026-09-30T10:00:00.000Z'),
  description: 'ส่งเอกสาร',
  fields: [],
  groupId: '10000000-0000-4000-8000-000000000001',
  id: '20000000-0000-4000-8000-000000000001',
  status: 'open',
  title: 'เอกสารฝึกงาน',
  version: 2,
};

const FILE: CollectionFile = {
  byteSize: 1_024,
  createdAt: new Date('2026-09-26T06:55:00.000Z'),
  declaredContentType: 'image/png',
  detectedContentType: 'image/png',
  fieldId: 'attachment',
  formId: FORM.id,
  id: '30000000-0000-4000-8000-000000000001',
  inspectionErrorCode: null,
  originalFilename: 'poster.png',
  status: 'ready',
  studentAccountId: '40000000-0000-4000-8000-000000000001',
};

describe('collection forms transport views', () => {
  const STATUS_COUNTS = {
    awaiting_checking: 1,
    changes_required: 0,
    not_submitted: 2,
    passed: 0,
    withdrawn: 0,
  };

  it('projects an Instructor review queue page as an index without answers or files', () => {
    const entries: CollectionReviewEntry[] = [
      {
        firstSubmittedAt: new Date('2026-09-26T07:00:00.000Z'),
        isLate: false,
        latestCheckingReason: null,
        latestSubmission: {
          formVersion: 2,
          id: '50000000-0000-4000-8000-000000000001',
          submittedAt: new Date('2026-09-26T07:00:00.000Z'),
          version: 1,
        },
        rosterName: { firstNameTh: 'สมชาย', lastNameTh: 'ตัวอย่าง' },
        status: 'awaiting_checking',
        studentAccountId: '40000000-0000-4000-8000-000000000001',
        studentId: '69000001',
      },
    ];

    expect(
      toReviewQueueView({ entries, form: FORM, page: 1, statusCounts: STATUS_COUNTS, total: 1 }),
    ).toEqual({
      entries: [
        {
          firstSubmittedAt: '2026-09-26T07:00:00.000Z',
          isLate: false,
          latestCheckingReason: null,
          latestSubmission: {
            formVersion: 2,
            id: '50000000-0000-4000-8000-000000000001',
            submittedAt: '2026-09-26T07:00:00.000Z',
            version: 1,
          },
          rosterName: { firstNameTh: 'สมชาย', lastNameTh: 'ตัวอย่าง' },
          status: 'awaiting_checking',
          studentAccountId: '40000000-0000-4000-8000-000000000001',
          studentId: '69000001',
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
      page: 1,
      statusCounts: STATUS_COUNTS,
      total: 1,
    });
  });

  it("names a Student's neighbours and page without their Student IDs", () => {
    const student = {
      rosterName: { firstNameTh: 'สมหญิง', lastNameTh: 'ตัวอย่าง' },
      studentAccountId: '40000000-0000-4000-8000-000000000002',
    };
    const view = toReviewPositionView({
      entry: {
        firstSubmittedAt: null,
        isLate: true,
        latestCheckingReason: null,
        latestSubmission: null,
        rosterName: { firstNameTh: 'สมชาย', lastNameTh: 'ตัวอย่าง' },
        status: 'not_submitted',
        studentAccountId: '40000000-0000-4000-8000-000000000001',
        studentId: '69000001',
      },
      next: student,
      page: 1,
      pageStudents: [student],
      position: null,
      previous: null,
      total: 1,
    });

    expect(view).toEqual({
      entry: {
        firstSubmittedAt: null,
        isLate: true,
        latestCheckingReason: null,
        latestSubmission: null,
        rosterName: { firstNameTh: 'สมชาย', lastNameTh: 'ตัวอย่าง' },
        status: 'not_submitted',
        studentAccountId: '40000000-0000-4000-8000-000000000001',
        studentId: '69000001',
      },
      next: student,
      page: 1,
      pageStudents: [student],
      position: null,
      previous: null,
      total: 1,
    });
  });

  it('marks a submitted image previewable without exposing the detected type', () => {
    const view = toFieldAnswersView({
      items: [
        {
          files: [FILE, { ...FILE, detectedContentType: 'application/pdf', id: 'pdf' }],
          position: { accountId: FILE.studentAccountId, number: '0', rank: 0, text: '' },
          rosterName: { firstNameTh: 'สมชาย', lastNameTh: 'ตัวอย่าง' },
          studentAccountId: FILE.studentAccountId,
          studentId: '69000001',
          value: null,
        },
      ],
      kind: 'students',
      nextCursor: null,
    });

    expect(view).toEqual({
      items: [
        {
          files: [
            {
              byteSize: 1_024,
              createdAt: '2026-09-26T06:55:00.000Z',
              fieldId: 'attachment',
              id: FILE.id,
              inspectionErrorCode: null,
              isPreviewable: true,
              originalFilename: 'poster.png',
              status: 'ready',
            },
            expect.objectContaining({ id: 'pdf', isPreviewable: false }),
          ],
          rosterName: { firstNameTh: 'สมชาย', lastNameTh: 'ตัวอย่าง' },
          studentAccountId: FILE.studentAccountId,
          studentId: '69000001',
          value: null,
        },
      ],
      kind: 'students',
      nextCursor: null,
    });
    expect(JSON.stringify(view)).not.toContain('ContentType');
    /* The keyset position is internal: the cursor already carries it. */
    expect(JSON.stringify(view)).not.toContain('position');
  });

  it('projects Summary text pages as values only', () => {
    expect(toFieldAnswersView({ items: ['ข้อความ'], kind: 'texts', nextCursor: 'next' })).toEqual({
      items: [{ value: 'ข้อความ' }],
      kind: 'texts',
      nextCursor: 'next',
    });
    expect(
      toFieldAnswersView({ items: [{ count: 2, value: 'ก' }], kind: 'groups', nextCursor: null }),
    ).toEqual({ items: [{ count: 2, value: 'ก' }], kind: 'groups', nextCursor: null });
  });
});
