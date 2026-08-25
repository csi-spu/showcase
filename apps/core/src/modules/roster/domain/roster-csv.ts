import { parse } from 'csv-parse/sync';

export const MAX_ROSTER_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROSTER_ROWS = 10_000;

const ROSTER_HEADER = ['student_id', 'first_name_th', 'last_name_th'] as const;

export type RosterCsvErrorCode =
  | 'DUPLICATE_STUDENT_ID'
  | 'INVALID_FIRST_NAME'
  | 'INVALID_LAST_NAME'
  | 'INVALID_ROSTER_CSV'
  | 'INVALID_ROSTER_HEADER'
  | 'INVALID_STUDENT_ID'
  | 'INVALID_UTF8'
  | 'ROSTER_ROW_LIMIT_EXCEEDED';

export class RosterCsvError extends Error {
  constructor(readonly code: RosterCsvErrorCode) {
    super(code);
    this.name = 'RosterCsvError';
  }
}

export interface RosterRow {
  entryYear: number;
  firstNameTh: string;
  lastNameTh: string;
  rowNumber: number;
  studentId: string;
}

export interface InvalidRosterRow {
  errorCode:
    'DUPLICATE_STUDENT_ID' | 'INVALID_FIRST_NAME' | 'INVALID_LAST_NAME' | 'INVALID_STUDENT_ID';
  rowNumber: number;
  studentId: string;
}

export type RosterRowResult = InvalidRosterRow | RosterRow;

export function parseRosterCsv(content: Uint8Array): RosterRowResult[] {
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    throw new RosterCsvError('INVALID_UTF8');
  }

  let records: string[][];
  try {
    records = parse(source, {
      bom: true,
      relax_column_count: false,
      skip_empty_lines: true,
    });
  } catch {
    throw new RosterCsvError('INVALID_ROSTER_CSV');
  }

  const header = records[0];
  if (
    header === undefined ||
    header.length !== ROSTER_HEADER.length ||
    !ROSTER_HEADER.every((column, index) => header[index] === column)
  ) {
    throw new RosterCsvError('INVALID_ROSTER_HEADER');
  }

  const dataRows = records.slice(1);
  if (dataRows.length === 0) {
    throw new RosterCsvError('INVALID_ROSTER_CSV');
  }
  if (dataRows.length > MAX_ROSTER_ROWS) {
    throw new RosterCsvError('ROSTER_ROW_LIMIT_EXCEEDED');
  }

  const rows = dataRows.map((record, index) => parseRow(record, index + 2));
  const studentIdCounts = new Map<string, number>();
  for (const row of rows) {
    if (/^\d{8}$/.test(row.studentId)) {
      studentIdCounts.set(row.studentId, (studentIdCounts.get(row.studentId) ?? 0) + 1);
    }
  }
  return rows.map((row) =>
    (studentIdCounts.get(row.studentId) ?? 0) > 1
      ? {
          errorCode: 'DUPLICATE_STUDENT_ID',
          rowNumber: row.rowNumber,
          studentId: row.studentId,
        }
      : row,
  );
}

function parseRow(record: string[], rowNumber: number): RosterRowResult {
  if (record.length !== ROSTER_HEADER.length) {
    throw new RosterCsvError('INVALID_ROSTER_CSV');
  }
  const [studentId = '', rawFirstName = '', rawLastName = ''] = record;
  if (!/^\d{8}$/.test(studentId)) {
    return { errorCode: 'INVALID_STUDENT_ID', rowNumber, studentId };
  }
  const entryYear = 2500 + Number(studentId.slice(0, 2));

  const firstNameTh = normalizeName(rawFirstName);
  if (firstNameTh.length === 0) {
    return { errorCode: 'INVALID_FIRST_NAME', rowNumber, studentId };
  }
  const lastNameTh = normalizeName(rawLastName);
  if (lastNameTh.length === 0) {
    return { errorCode: 'INVALID_LAST_NAME', rowNumber, studentId };
  }
  return { entryYear, firstNameTh, lastNameTh, rowNumber, studentId };
}

function normalizeName(value: string): string {
  return value.trim().normalize('NFC');
}
