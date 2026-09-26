import {
  RESOLVE_CHUNK_SIZE,
  type SelectableStudent,
  type StudentIdResolution,
} from './member-selection-contract';
import type { CsvStudentIdEntry } from './student-id-csv';

export interface ResolvedCsvStudent {
  line: number;
  student: SelectableStudent;
}

/*
 * Core reports an unmatched Student ID by position only, so a not-found
 * problem carries the value from the browser's own parsed file.
 */
export type CsvResolutionProblem =
  | { kind: 'not_found'; line: number; studentId: string }
  | {
      kind: 'current_member' | 'no_access' | 'withdrawn_member';
      line: number;
      student: SelectableStudent;
    };

export function chunkStudentIdEntries(entries: CsvStudentIdEntry[]): CsvStudentIdEntry[][] {
  const chunks: CsvStudentIdEntry[][] = [];
  for (let start = 0; start < entries.length; start += RESOLVE_CHUNK_SIZE) {
    chunks.push(entries.slice(start, start + RESOLVE_CHUNK_SIZE));
  }
  return chunks;
}

export function mapResolvedChunk(
  chunk: CsvStudentIdEntry[],
  results: StudentIdResolution[],
): { problems: CsvResolutionProblem[]; selectable: ResolvedCsvStudent[] } {
  const byPosition = new Map(results.map((result) => [result.position, result]));
  if (results.length !== chunk.length) {
    throw new Error('The resolution does not answer every position of the chunk.');
  }
  const problems: CsvResolutionProblem[] = [];
  const selectable: ResolvedCsvStudent[] = [];
  chunk.forEach(({ line, studentId }, position) => {
    const result = byPosition.get(position);
    if (result === undefined) {
      throw new Error('The resolution does not answer every position of the chunk.');
    }
    if (result.outcome === 'not_found') {
      problems.push({ kind: 'not_found', line, studentId });
    } else if (result.student.status === 'selectable') {
      selectable.push({ line, student: result.student });
    } else {
      problems.push({ kind: result.student.status, line, student: result.student });
    }
  });
  return { problems, selectable };
}

/* Returns a new selection; students already selected never count against the limit twice. */
export function mergeWithinLimit(
  selection: ReadonlyMap<string, SelectableStudent>,
  students: SelectableStudent[],
  limit: number,
): { overflow: SelectableStudent[]; selection: Map<string, SelectableStudent> } {
  const next = new Map(selection);
  const overflow: SelectableStudent[] = [];
  for (const student of students) {
    if (next.has(student.accountId)) continue;
    if (next.size >= limit) {
      overflow.push(student);
      continue;
    }
    next.set(student.accountId, student);
  }
  return { overflow, selection: next };
}
