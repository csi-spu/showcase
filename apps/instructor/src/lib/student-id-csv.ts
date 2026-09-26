/*
 * Student ID CSV import, parsed entirely in the browser. The parsed Student IDs
 * stay in memory: they are sent only to resolve them, in request bodies, and
 * are never stored, logged, or reported.
 */

export const MAX_CSV_ROWS = 2_000;
/** Generous for 2,000 rows with extra columns; bounds the work before parsing. */
export const MAX_CSV_BYTES = 1_000_000;
const STUDENT_ID_HEADER = 'student_id';
const STUDENT_ID_PATTERN = /^[0-9]{8}$/;

export type CsvFileError = 'empty' | 'missing_header' | 'not_utf8' | 'too_large' | 'too_many_rows';

export interface CsvStudentIdEntry {
  line: number;
  studentId: string;
}

export type CsvLineProblem =
  | { kind: 'duplicate'; firstLine: number; line: number; studentId: string }
  | { kind: 'invalid_format'; line: number; value: string };

export type ParsedStudentIdCsv =
  | { entries: CsvStudentIdEntry[]; ok: true; problems: CsvLineProblem[] }
  | { error: CsvFileError; ok: false };

/** Returns null when the bytes are not valid UTF-8. */
export function decodeCsvBytes(bytes: ArrayBuffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function parseStudentIdCsv(text: string): ParsedStudentIdCsv {
  const records = readRecords(text.startsWith('﻿') ? text.slice(1) : text).filter((record) =>
    record.fields.some((field) => field.trim().length > 0),
  );
  const [header, ...rows] = records;
  if (header === undefined) return { error: 'empty', ok: false };
  const column = header.fields.findIndex(
    (field) => field.trim().toLowerCase() === STUDENT_ID_HEADER,
  );
  if (column === -1) return { error: 'missing_header', ok: false };
  if (rows.length > MAX_CSV_ROWS) return { error: 'too_many_rows', ok: false };

  const entries: CsvStudentIdEntry[] = [];
  const problems: CsvLineProblem[] = [];
  const firstLineById = new Map<string, number>();
  for (const row of rows) {
    const value = (row.fields[column] ?? '').trim();
    if (!STUDENT_ID_PATTERN.test(value)) {
      problems.push({ kind: 'invalid_format', line: row.line, value });
      continue;
    }
    const firstLine = firstLineById.get(value);
    if (firstLine !== undefined) {
      problems.push({ firstLine, kind: 'duplicate', line: row.line, studentId: value });
      continue;
    }
    firstLineById.set(value, row.line);
    entries.push({ line: row.line, studentId: value });
  }
  return { entries, ok: true, problems };
}

interface CsvRecord {
  fields: string[];
  /** The 1-based physical line where the record starts. */
  line: number;
}

/* RFC 4180 records: quoted fields may hold commas, doubled quotes, and line breaks. */
function readRecords(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let isQuoted = false;
  let line = 1;
  let recordLine = 1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (isQuoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        isQuoted = false;
      } else {
        if (character === '\n' || (character === '\r' && text[index + 1] !== '\n')) line += 1;
        field += character;
      }
      continue;
    }
    if (character === '"') {
      isQuoted = true;
    } else if (character === ',') {
      fields.push(field);
      field = '';
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      fields.push(field);
      records.push({ fields, line: recordLine });
      fields = [];
      field = '';
      line += 1;
      recordLine = line;
    } else {
      field += character;
    }
  }
  fields.push(field);
  records.push({ fields, line: recordLine });
  return records;
}
