import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeCsvBytes, MAX_CSV_ROWS, parseStudentIdCsv } from './student-id-csv';

describe('parseStudentIdCsv', () => {
  it('reads the student_id column by header, ignoring other columns and their order', () => {
    expect(parseStudentIdCsv('name,Student_ID\nสมชาย,65000001\nสมหญิง,65000002\n')).toEqual({
      entries: [
        { line: 2, studentId: '65000001' },
        { line: 3, studentId: '65000002' },
      ],
      ok: true,
      problems: [],
    });
  });

  it('accepts a UTF-8 BOM, CRLF line endings, surrounding spaces, and quoted fields', () => {
    expect(
      parseStudentIdCsv('﻿student_id,note\r\n" 65000001 ","a, b"\r\n65000002,"say ""hi"""\r\n'),
    ).toMatchObject({
      entries: [
        { line: 2, studentId: '65000001' },
        { line: 3, studentId: '65000002' },
      ],
      problems: [],
    });
  });

  it('reports malformed values by their line number, counting skipped blank lines', () => {
    expect(parseStudentIdCsv('student_id\n6500001\n\n65-00001\n๖๕๐๐๐๐๐๑\n,x\n65000003')).toEqual({
      entries: [{ line: 7, studentId: '65000003' }],
      ok: true,
      problems: [
        { kind: 'invalid_format', line: 2, value: '6500001' },
        { kind: 'invalid_format', line: 4, value: '65-00001' },
        { kind: 'invalid_format', line: 5, value: '๖๕๐๐๐๐๐๑' },
        { kind: 'invalid_format', line: 6, value: '' },
      ],
    });
  });

  it('merges a repeated Student ID into its first line and reports the repeat', () => {
    expect(parseStudentIdCsv('student_id\n65000001\n65000002\n65000001')).toEqual({
      entries: [
        { line: 2, studentId: '65000001' },
        { line: 3, studentId: '65000002' },
      ],
      ok: true,
      problems: [{ firstLine: 2, kind: 'duplicate', line: 4, studentId: '65000001' }],
    });
  });

  it('numbers lines by where a record starts when a quoted field spans lines', () => {
    expect(parseStudentIdCsv('note,student_id\n"two\nlines",65000001\nx,65000002')).toMatchObject({
      entries: [
        { line: 2, studentId: '65000001' },
        { line: 4, studentId: '65000002' },
      ],
    });
  });

  it('rejects a file without a student_id header or without any line', () => {
    expect(parseStudentIdCsv('65000001\n65000002')).toEqual({
      error: 'missing_header',
      ok: false,
    });
    expect(parseStudentIdCsv('﻿\n  \n')).toEqual({ error: 'empty', ok: false });
  });

  it(`accepts ${MAX_CSV_ROWS} data rows and rejects one more`, () => {
    const rows = (count: number) =>
      Array.from({ length: count }, (_, index) => String(65_000_000 + index));
    const atLimit = parseStudentIdCsv(['student_id', ...rows(MAX_CSV_ROWS)].join('\n'));
    expect(atLimit.ok && atLimit.entries).toHaveLength(MAX_CSV_ROWS);
    expect(parseStudentIdCsv(['student_id', ...rows(MAX_CSV_ROWS + 1)].join('\n'))).toEqual({
      error: 'too_many_rows',
      ok: false,
    });
  });
});

describe('decodeCsvBytes', () => {
  it('decodes UTF-8 and refuses bytes that are not UTF-8', () => {
    expect(decodeCsvBytes(new TextEncoder().encode('student_id\nสมชาย').buffer)).toBe(
      'student_id\nสมชาย',
    );
    expect(decodeCsvBytes(new Uint8Array([0x73, 0xff, 0xfe, 0x74]).buffer)).toBeNull();
  });
});

describe('sample CSV', () => {
  it('passes validation unchanged', () => {
    const bytes = readFileSync(join(process.cwd(), 'public/samples/member-selection-sample.csv'));
    const text = decodeCsvBytes(new Uint8Array(bytes).buffer);
    expect(text).not.toBeNull();
    const parsed = parseStudentIdCsv(text ?? '');
    expect(parsed.ok && parsed.problems).toEqual([]);
    expect(parsed.ok && parsed.entries.length).toBeGreaterThan(0);
  });
});
