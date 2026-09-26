import { describe, expect, it } from 'vitest';
import type { SelectableStudent } from './member-selection-contract';
import type { CsvStudentIdEntry } from './student-id-csv';
import { chunkStudentIdEntries, mapResolvedChunk, mergeWithinLimit } from './student-id-resolution';

function student(
  index: number,
  status: SelectableStudent['status'] = 'selectable',
): SelectableStudent {
  return {
    accountId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    entryYear: 2569,
    firstNameTh: `ชื่อ${index}`,
    lastNameTh: `สกุล${index}`,
    status,
  };
}

function entries(count: number): CsvStudentIdEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    line: index + 2,
    studentId: String(65_000_000 + index),
  }));
}

describe('chunkStudentIdEntries', () => {
  it('splits entries into chunks of at most 500, preserving order', () => {
    const chunks = chunkStudentIdEntries(entries(1_201));
    expect(chunks.map((chunk) => chunk.length)).toEqual([500, 500, 201]);
    expect(chunks[1]?.[0]).toEqual({ line: 502, studentId: '65000500' });
    expect(chunkStudentIdEntries([])).toEqual([]);
  });
});

describe('mapResolvedChunk', () => {
  it('maps unmatched positions back to the Student IDs the browser parsed', () => {
    const chunk = entries(6);
    const result = mapResolvedChunk(chunk, [
      { outcome: 'matched', position: 0, student: student(1) },
      { outcome: 'not_found', position: 1 },
      { outcome: 'no_access', position: 2, student: student(3, 'no_access') },
      { outcome: 'matched', position: 3, student: student(4, 'current_member') },
      { outcome: 'matched', position: 4, student: student(5, 'withdrawn_member') },
      { outcome: 'not_found', position: 5 },
    ]);

    expect(result.selectable).toEqual([{ line: 2, student: student(1) }]);
    expect(result.problems).toEqual([
      { kind: 'not_found', line: 3, studentId: '65000001' },
      { kind: 'no_access', line: 4, student: student(3, 'no_access') },
      { kind: 'current_member', line: 5, student: student(4, 'current_member') },
      { kind: 'withdrawn_member', line: 6, student: student(5, 'withdrawn_member') },
      { kind: 'not_found', line: 7, studentId: '65000005' },
    ]);
  });

  it('refuses a response that does not answer every position of the chunk', () => {
    expect(() => mapResolvedChunk(entries(2), [{ outcome: 'not_found', position: 0 }])).toThrow();
    expect(() =>
      mapResolvedChunk(entries(1), [
        { outcome: 'not_found', position: 0 },
        { outcome: 'not_found', position: 1 },
      ]),
    ).toThrow();
  });
});

describe('mergeWithinLimit', () => {
  it('adds students until the limit and returns those that did not fit', () => {
    const selection = new Map([[student(1).accountId, student(1)]]);
    const { overflow, selection: next } = mergeWithinLimit(
      selection,
      [student(1), student(2), student(3)],
      2,
    );

    expect([...next.keys()]).toEqual([student(1).accountId, student(2).accountId]);
    expect(overflow).toEqual([student(3)]);
    expect(selection.size).toBe(1);
  });
});
