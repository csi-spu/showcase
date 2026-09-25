import { mergeExportFields } from './collection-export-builder';
import type { CollectionExportEntry, CollectionField } from './collection-forms.ports';

const CURRENT: CollectionField = {
  description: '',
  id: 'current',
  label: 'คำถามปัจจุบัน',
  required: false,
  type: 'short_text',
};

function entry(fields: CollectionField[] | null): CollectionExportEntry {
  return {
    fields,
    formId: '40000000-0000-4000-8000-000000000001',
    isLate: false,
    obligationStatus: 'passed',
    position: 0,
    studentAccountId: '20000000-0000-4000-8000-000000000001',
    studentDisplayName: 'นักศึกษา ทดสอบ',
    submissionId: fields === null ? null : '50000000-0000-4000-8000-000000000001',
    submittedAt: fields === null ? null : new Date('2026-09-25T00:00:00.000Z'),
  };
}

describe('mergeExportFields', () => {
  it('appends removed submitted questions so their answers remain exportable', () => {
    const removed = { ...CURRENT, id: 'removed', label: 'คำถามเดิม' };

    expect(mergeExportFields([CURRENT], [entry([removed])])).toEqual([CURRENT, removed]);
  });

  it('uses the current definition for stable field ids and never duplicates a column', () => {
    const previous = { ...CURRENT, label: 'ชื่อเดิม' };

    expect(mergeExportFields([CURRENT], [entry([previous]), entry(null)])).toEqual([CURRENT]);
  });
});
