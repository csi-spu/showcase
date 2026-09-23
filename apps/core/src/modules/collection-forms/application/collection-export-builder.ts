/*
 * Turns a frozen export snapshot into streamed bytes.
 *
 * Nothing here reads live data. Everything the artifact contains comes from the
 * snapshot rows the creation transaction wrote, plus the submitted answers and
 * documents those rows name by id. That is what makes a retry reproduce the
 * same artifact and a later submission unable to change it.
 *
 * Memory is bounded by construction: the workbook pulls one row at a time and
 * the archive copies one document at a time, so neither grows with the size of
 * the group.
 */

import { toDocumentPath, toExportDateTime, toStudentFolderName } from './collection-exports';
import { writeXlsxWorkbook, type XlsxSheet } from './xlsx-writer';
import { writeZipArchive, type ZipEntry } from './zip-writer';
import type {
  CollectionAnswerValue,
  CollectionExportDocument,
  CollectionExportEntry,
  CollectionExportForm,
  CollectionField,
} from './collection-forms.ports';

/** What the builder needs from the snapshot, independent of how it was stored. */
export interface CollectionExportSnapshot {
  entries: CollectionExportEntry[];
  forms: CollectionExportForm[];
}

export interface CollectionExportSources {
  /** The frozen submission's answers, or null if it has since been unreadable. */
  readAnswers: (submissionId: string) => Promise<Record<string, CollectionAnswerValue> | null>;
  readDocument: (storageKey: string) => AsyncIterable<Buffer>;
  listDocuments: (submissionId: string) => Promise<CollectionExportDocument[]>;
}

/*
 * Column headings for the tracking sheet. Thai, like the rest of the Phase 1
 * UI; these are data in a generated file rather than interface strings, so they
 * are not translation keys.
 */
const TRACKING_HEADERS = ['ลำดับ', 'นักศึกษา', 'แบบฟอร์ม', 'สถานะ', 'ส่งเมื่อ', 'ส่งช้า'];

const STATUS_LABELS: Record<string, string> = {
  awaiting_checking: 'รอตรวจ',
  changes_required: 'ต้องแก้ไข',
  not_submitted: 'ยังไม่ส่ง',
  passed: 'ผ่าน',
  withdrawn: 'พ้นสภาพ',
};

/**
 * Streams the tracking-and-answers workbook.
 *
 * One tracking sheet showing every obligation, then one sheet per form with the
 * answers of its latest submitted versions. Students who submitted nothing
 * still appear on the tracking sheet, because the gaps are the point of it.
 */
export function buildExportWorkbook(
  snapshot: CollectionExportSnapshot,
  sources: CollectionExportSources,
): AsyncGenerator<Buffer> {
  const formsById = new Map(snapshot.forms.map((form) => [form.formId, form]));
  const sheets: XlsxSheet[] = [
    {
      headers: TRACKING_HEADERS,
      name: 'ติดตาม',
      rows: async function* () {
        for (const entry of orderedEntries(snapshot.entries)) {
          yield [
            String(entry.position + 1),
            entry.studentDisplayName,
            formsById.get(entry.formId)?.title ?? '',
            STATUS_LABELS[entry.obligationStatus] ?? entry.obligationStatus,
            entry.submittedAt === null ? '' : toExportDateTime(entry.submittedAt),
            entry.isLate ? 'ใช่' : '',
          ];
        }
      },
    },
  ];

  for (const form of snapshot.forms) {
    const fields = valueFields(form.fields);
    sheets.push({
      headers: ['ลำดับ', 'นักศึกษา', ...fields.map((field) => field.label)],
      name: form.title,
      rows: async function* () {
        for (const entry of orderedEntries(snapshot.entries)) {
          if (entry.formId !== form.formId) continue;
          /* Never a draft: an entry with no submission has no answers at all. */
          const answers =
            entry.submissionId === null ? null : await sources.readAnswers(entry.submissionId);
          yield [
            String(entry.position + 1),
            entry.studentDisplayName,
            ...fields.map((field) => renderAnswer(answers?.[field.id])),
          ];
        }
      },
    });
  }

  return writeXlsxWorkbook(sheets);
}

/**
 * Streams the documents archive, arranged per Student.
 *
 * A Student who submitted nothing still gets a folder, via a marker file: an
 * empty folder cannot be represented in a ZIP, and silently omitting them would
 * make the archive disagree with the tracking sheet.
 */
export function buildExportArchive(
  snapshot: CollectionExportSnapshot,
  sources: CollectionExportSources,
): AsyncGenerator<Buffer> {
  return writeZipArchive(archiveEntries(snapshot, sources));
}

async function* archiveEntries(
  snapshot: CollectionExportSnapshot,
  sources: CollectionExportSources,
): AsyncGenerator<ZipEntry> {
  const formsById = new Map(snapshot.forms.map((form) => [form.formId, form]));
  const studentsWithDocuments = new Set<number>();
  const students = new Map<number, string>();

  for (const entry of orderedEntries(snapshot.entries)) {
    students.set(entry.position, entry.studentDisplayName);
    if (entry.submissionId === null) continue;
    const form = formsById.get(entry.formId);
    if (form === undefined) continue;

    /* One submission's documents at a time, so the file list stays small. */
    const documents = await sources.listDocuments(entry.submissionId);
    for (const [index, document] of documents.entries()) {
      studentsWithDocuments.add(entry.position);
      yield {
        path: toDocumentPath({
          displayName: entry.studentDisplayName,
          fieldId: document.fieldId,
          filePosition: index,
          formPosition: form.position,
          formTitle: form.title,
          originalFilename: document.originalFilename,
          studentPosition: entry.position,
        }),
        /* Streamed through: the document's bytes are never assembled here. */
        read: () => sources.readDocument(document.storageKey),
      };
    }
  }

  for (const [position, displayName] of [...students.entries()].sort((a, b) => a[0] - b[0])) {
    if (studentsWithDocuments.has(position)) continue;
    const folder = toStudentFolderName({ displayName, position });
    yield {
      path: `${folder}/ไม่มีเอกสาร.txt`,
      read: async function* () {
        yield Buffer.from('ไม่มีเอกสารที่ส่งแล้วสำหรับนักศึกษารายนี้\n', 'utf8');
      },
    };
  }
}

/** Stable order: by Student, then by the form's position in the snapshot. */
function orderedEntries(entries: CollectionExportEntry[]): CollectionExportEntry[] {
  return [...entries].sort(
    (left, right) =>
      left.position - right.position ||
      (left.formId < right.formId ? -1 : left.formId > right.formId ? 1 : 0),
  );
}

/* File fields are represented by the archive, not by a cell in the workbook. */
function valueFields(fields: CollectionField[]): CollectionField[] {
  return fields.filter((field) => field.type !== 'file_upload');
}

/**
 * Renders one answer as text.
 *
 * Everything becomes a string here, and the workbook writer then writes it as
 * literal text. A number that looks like a formula, or a choice label starting
 * with `=`, is content in the exported file rather than something a spreadsheet
 * will evaluate.
 */
function renderAnswer(value: CollectionAnswerValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}
