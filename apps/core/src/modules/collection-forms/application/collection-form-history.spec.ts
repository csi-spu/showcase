import type { CollectionField } from './collection-field';
import {
  decodeFormHistoryCursor,
  describeFormHistoryEvents,
  diffFormStructure,
  encodeFormHistoryCursor,
} from './collection-form-history';

const COMPANY: CollectionField = {
  description: '',
  id: 'company',
  label: 'บริษัท',
  required: true,
  type: 'short_text',
};
const ADVISOR: CollectionField = { ...COMPANY, id: 'advisor', label: 'อาจารย์ที่ปรึกษา' };
const TRACK: CollectionField = {
  ...COMPANY,
  id: 'track',
  label: 'สายการเรียน',
  options: ['ซอฟต์แวร์', 'เครือข่าย'],
  type: 'single_choice',
};
const REPORT: CollectionField = {
  ...COMPANY,
  file: { allowedFileTypes: ['pdf'], maxFiles: 1 },
  id: 'report',
  label: 'รายงาน',
  type: 'file_upload',
};

describe('diffFormStructure', () => {
  it('reports nothing for identical questions', () => {
    expect(diffFormStructure([COMPANY, TRACK], [COMPANY, TRACK])).toEqual([]);
  });

  it('reports added and removed questions by field id', () => {
    expect(diffFormStructure([COMPANY, ADVISOR], [COMPANY, TRACK])).toEqual([
      { kind: 'question_added', label: 'สายการเรียน' },
      { kind: 'question_removed', label: 'อาจารย์ที่ปรึกษา' },
    ]);
  });

  it('reports a renamed question with both labels', () => {
    expect(diffFormStructure([COMPANY], [{ ...COMPANY, label: 'ชื่อบริษัท' }])).toEqual([
      { kind: 'question_renamed', next: 'ชื่อบริษัท', previous: 'บริษัท' },
    ]);
  });

  it('reports the new required state under the current label', () => {
    expect(
      diffFormStructure([COMPANY, ADVISOR], [COMPANY, { ...ADVISOR, required: false }]),
    ).toEqual([
      { isRequired: false, kind: 'question_required_changed', label: 'อาจารย์ที่ปรึกษา' },
    ]);
  });

  it('reports description and option changes', () => {
    expect(
      diffFormStructure(
        [COMPANY, TRACK],
        [
          { ...COMPANY, description: 'ชื่อตามหนังสือตอบรับ' },
          { ...TRACK, options: ['ซอฟต์แวร์', 'เครือข่าย', 'ข้อมูล'] },
        ],
      ),
    ).toEqual([
      { kind: 'question_description_changed', label: 'บริษัท' },
      { kind: 'question_options_changed', label: 'สายการเรียน' },
    ]);
  });

  it('treats reordered options as an options change', () => {
    expect(diffFormStructure([TRACK], [{ ...TRACK, options: ['เครือข่าย', 'ซอฟต์แวร์'] }])).toEqual(
      [{ kind: 'question_options_changed', label: 'สายการเรียน' }],
    );
  });

  it('reports every change to one question, labelled with its new name', () => {
    expect(
      diffFormStructure(
        [COMPANY],
        [{ ...COMPANY, description: 'ใหม่', label: 'ชื่อบริษัท', required: false }],
      ),
    ).toEqual([
      { kind: 'question_renamed', next: 'ชื่อบริษัท', previous: 'บริษัท' },
      { isRequired: false, kind: 'question_required_changed', label: 'ชื่อบริษัท' },
      { kind: 'question_description_changed', label: 'ชื่อบริษัท' },
    ]);
  });

  it('reports other settings, so a file limit change is never silent', () => {
    expect(
      diffFormStructure(
        [REPORT, COMPANY],
        [
          { ...REPORT, file: { allowedFileTypes: ['pdf', 'docx'], maxFiles: 1 } },
          { ...COMPANY, mappingKey: 'company-name' },
        ],
      ),
    ).toEqual([
      { kind: 'question_settings_changed', label: 'รายงาน' },
      { kind: 'question_settings_changed', label: 'บริษัท' },
    ]);
  });

  it('reports a reorder when the questions both versions share change relative order', () => {
    expect(diffFormStructure([COMPANY, ADVISOR, TRACK], [TRACK, COMPANY, ADVISOR])).toEqual([
      { kind: 'questions_reordered' },
    ]);
  });

  it('does not mistake an insertion or removal for a reorder', () => {
    expect(diffFormStructure([COMPANY, ADVISOR], [TRACK, COMPANY, ADVISOR])).toEqual([
      { kind: 'question_added', label: 'สายการเรียน' },
    ]);
    expect(diffFormStructure([COMPANY, ADVISOR, TRACK], [COMPANY, TRACK])).toEqual([
      { kind: 'question_removed', label: 'อาจารย์ที่ปรึกษา' },
    ]);
  });

  it('shows a changed question type as a removal and an addition, because the id changes', () => {
    expect(
      diffFormStructure([COMPANY], [{ ...COMPANY, id: 'company-long', type: 'long_text' }]),
    ).toEqual([
      { kind: 'question_added', label: 'บริษัท' },
      { kind: 'question_removed', label: 'บริษัท' },
    ]);
  });
});

describe('describeFormHistoryEvents', () => {
  it('lists one save as details first, then its question changes', () => {
    expect(
      describeFormHistoryEvents([
        { kind: 'structure', nextFields: [ADVISOR, COMPANY], previousFields: [COMPANY, ADVISOR] },
        {
          kind: 'deadline',
          next: '2026-10-10T00:00:00.000Z',
          previous: '2026-10-01T00:00:00.000Z',
        },
        { kind: 'title', next: 'B', previous: 'A' },
        { kind: 'description' },
      ]),
    ).toEqual([
      { kind: 'title_changed', next: 'B', previous: 'A' },
      { kind: 'description_changed' },
      {
        kind: 'deadline_changed',
        next: '2026-10-10T00:00:00.000Z',
        previous: '2026-10-01T00:00:00.000Z',
      },
      { kind: 'questions_reordered' },
    ]);
  });

  it('describes lifecycle events with their reason and assigned count', () => {
    expect(describeFormHistoryEvents([{ assignedCount: 12, kind: 'opened' }])).toEqual([
      { assignedCount: 12, kind: 'opened' },
    ]);
    expect(describeFormHistoryEvents([{ kind: 'closed', reason: 'ครบกำหนด' }])).toEqual([
      { kind: 'closed', reason: 'ครบกำหนด' },
    ]);
    expect(
      describeFormHistoryEvents([{ assignedCount: 2, kind: 'reopened', reason: 'ขยายเวลา' }]),
    ).toEqual([{ assignedCount: 2, kind: 'reopened', reason: 'ขยายเวลา' }]);
  });

  it('describes a legacy questions save that changed nothing as an empty list', () => {
    expect(
      describeFormHistoryEvents([
        { kind: 'structure', nextFields: [COMPANY], previousFields: [COMPANY] },
      ]),
    ).toEqual([]);
  });
});

describe('form history cursor', () => {
  const position = {
    entryId: '58000000-0000-4000-8000-00000000000a',
    occurredAtMicros: '1790071200123456',
  };

  it('round-trips a position', () => {
    expect(decodeFormHistoryCursor(encodeFormHistoryCursor(position))).toEqual(position);
  });

  it('is opaque rather than a readable timestamp or id', () => {
    const cursor = encodeFormHistoryCursor(position);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(cursor).not.toContain(position.entryId);
    expect(cursor).not.toContain(position.occurredAtMicros);
  });

  it.each([
    ['empty text', ''],
    ['not base64url', '***'],
    ['a missing id', Buffer.from('1790071200123456').toString('base64url')],
    ['a non-numeric time', Buffer.from(`abc.${position.entryId}`).toString('base64url')],
    ['a malformed id', Buffer.from('1790071200123456.not-a-uuid').toString('base64url')],
    [
      'trailing content',
      Buffer.from(`1790071200123456.${position.entryId}.x`).toString('base64url'),
    ],
    ['an oversized cursor', 'A'.repeat(200)],
  ])('rejects %s', (_case, cursor) => {
    expect(decodeFormHistoryCursor(cursor)).toBeNull();
  });
});
