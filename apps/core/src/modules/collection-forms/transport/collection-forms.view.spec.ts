import type { CollectionForm, CollectionReviewEntry } from '../application/collection-forms.ports';
import { toReviewQueueView } from './collection-forms.view';

describe('collection forms transport views', () => {
  it('projects an Instructor review queue without private file metadata', () => {
    const form: CollectionForm = {
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
    const entries: CollectionReviewEntry[] = [
      {
        firstSubmittedAt: new Date('2026-09-26T07:00:00.000Z'),
        isLate: false,
        latestCheckingReason: null,
        latestSubmission: {
          answers: {},
          fields: [],
          files: {
            attachment: [
              {
                byteSize: 1_024,
                createdAt: new Date('2026-09-26T06:55:00.000Z'),
                declaredContentType: 'application/pdf',
                detectedContentType: 'application/pdf',
                fieldId: 'attachment',
                formId: form.id,
                id: '30000000-0000-4000-8000-000000000001',
                inspectionErrorCode: null,
                originalFilename: 'report.pdf',
                status: 'ready',
                studentAccountId: '40000000-0000-4000-8000-000000000001',
              },
            ],
          },
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

    expect(toReviewQueueView({ entries, form })).toEqual({
      entries: [
        {
          firstSubmittedAt: '2026-09-26T07:00:00.000Z',
          isLate: false,
          latestCheckingReason: null,
          latestSubmission: {
            answers: {},
            fields: [],
            files: {
              attachment: [
                {
                  byteSize: 1_024,
                  createdAt: '2026-09-26T06:55:00.000Z',
                  fieldId: 'attachment',
                  id: '30000000-0000-4000-8000-000000000001',
                  inspectionErrorCode: null,
                  originalFilename: 'report.pdf',
                  status: 'ready',
                },
              ],
            },
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
    });
  });
});
