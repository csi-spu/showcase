import {
  buildExportArchive,
  buildExportWorkbook,
  mergeExportFields,
  type CollectionExportSnapshot,
  type CollectionExportSources,
} from './collection-export-builder';
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
    studentId: '69000001',
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

/*
 * Both writers store entries uncompressed, so the XML cells and archive paths
 * can be read straight out of the bytes.
 */
async function collect(stream: AsyncGenerator<Buffer>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function cell(reference: string, value: string): string {
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${value}</t></is></c>`;
}

const SNAPSHOT: CollectionExportSnapshot = {
  entries: [entry(null), { ...entry(null), position: 1, studentId: null }],
  forms: [
    {
      fields: [CURRENT],
      formId: '40000000-0000-4000-8000-000000000001',
      position: 0,
      title: 'แบบฟอร์ม',
    },
  ],
};

const SOURCES: CollectionExportSources = {
  listDocuments: () => Promise.resolve([]),
  readAnswers: () => Promise.resolve(null),
  readDocument: async function* () {},
};

describe('buildExportWorkbook', () => {
  it('puts the Student ID beside the position on every sheet', async () => {
    const workbook = await collect(buildExportWorkbook(SNAPSHOT, SOURCES));

    expect(workbook.split(cell('B1', 'รหัสนักศึกษา'))).toHaveLength(3);
    expect(workbook.split(cell('B2', '69000001'))).toHaveLength(3);
    /* An unrecorded Student ID leaves the cell empty rather than inventing one. */
    expect(workbook).not.toContain('r="B3"');
    expect(workbook).toContain(cell('C3', 'นักศึกษา ทดสอบ'));
  });
});

describe('buildExportArchive', () => {
  it('names Student folders by Student ID, falling back to position', async () => {
    const archive = await collect(buildExportArchive(SNAPSHOT, SOURCES));

    expect(archive).toContain('69000001-นักศึกษา ทดสอบ/ไม่มีเอกสาร.txt');
    expect(archive).toContain('002-นักศึกษา ทดสอบ/ไม่มีเอกสาร.txt');
  });
});
