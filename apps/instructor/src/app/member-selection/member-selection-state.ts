import { MAX_SELECTED_MEMBERS, type SelectableStudent } from '@/lib/member-selection-contract';
import type { CsvFileError, CsvLineProblem, CsvStudentIdEntry } from '@/lib/student-id-csv';
import {
  chunkStudentIdEntries,
  mergeWithinLimit,
  type CsvResolutionProblem,
} from '@/lib/student-id-resolution';

/*
 * The picker's selection and CSV import. The parsed Student IDs live only in
 * this in-memory state: never in storage, analytics, or error reports.
 */

export type CsvImportProblem =
  | CsvLineProblem
  | CsvResolutionProblem
  | { kind: 'over_limit'; line: number; student: SelectableStudent };

export interface CsvChunk {
  entries: CsvStudentIdEntry[];
  problems: CsvImportProblem[];
  status: 'failed' | 'pending' | 'resolved';
}

export interface CsvImport {
  chunks: CsvChunk[];
  fileName: string;
  /** Guards against results of a replaced file landing on the new one. */
  importId: number;
  lineProblems: CsvLineProblem[];
}

export interface MemberSelectionState {
  csv: CsvImport | null;
  csvError: CsvFileError | null;
  /** Students Core rechecked as no longer selectable at confirmation. */
  ineligible: SelectableStudent[];
  nextImportId: number;
  selection: Map<string, SelectableStudent>;
}

export type MemberSelectionEvent =
  | { type: 'toggled'; student: SelectableStudent }
  | { type: 'selectedMany'; students: SelectableStudent[] }
  | { type: 'cleared' }
  | { type: 'csvRejected'; error: CsvFileError }
  | {
      entries: CsvStudentIdEntry[];
      fileName: string;
      lineProblems: CsvLineProblem[];
      type: 'csvParsed';
    }
  | { type: 'csvRemoved' }
  | { chunkIndex: number; importId: number; type: 'chunkRetried' }
  | { chunkIndex: number; importId: number; type: 'chunkFailed' }
  | {
      chunkIndex: number;
      importId: number;
      problems: CsvResolutionProblem[];
      selectable: { line: number; student: SelectableStudent }[];
      type: 'chunkResolved';
    }
  | { accountIds: string[]; type: 'ineligibleRejected' }
  | { type: 'submitted' };

export const INITIAL_MEMBER_SELECTION_STATE: MemberSelectionState = {
  csv: null,
  csvError: null,
  ineligible: [],
  nextImportId: 1,
  selection: new Map(),
};

export function memberSelectionReducer(
  state: MemberSelectionState,
  event: MemberSelectionEvent,
): MemberSelectionState {
  switch (event.type) {
    case 'toggled': {
      const selection = new Map(state.selection);
      if (selection.has(event.student.accountId)) {
        selection.delete(event.student.accountId);
      } else if (event.student.status === 'selectable' && selection.size < MAX_SELECTED_MEMBERS) {
        selection.set(event.student.accountId, event.student);
      }
      return { ...state, selection };
    }
    case 'selectedMany':
      return {
        ...state,
        selection: mergeWithinLimit(
          state.selection,
          event.students.filter((student) => student.status === 'selectable'),
          MAX_SELECTED_MEMBERS,
        ).selection,
      };
    case 'cleared':
      return { ...state, ineligible: [], selection: new Map() };
    case 'csvRejected':
      return { ...state, csv: null, csvError: event.error };
    case 'csvParsed':
      return {
        ...state,
        csv: {
          chunks: chunkStudentIdEntries(event.entries).map((entries) => ({
            entries,
            problems: [],
            status: 'pending',
          })),
          fileName: event.fileName,
          importId: state.nextImportId,
          lineProblems: event.lineProblems,
        },
        csvError: null,
        nextImportId: state.nextImportId + 1,
      };
    case 'csvRemoved':
      return { ...state, csv: null, csvError: null };
    case 'chunkRetried':
      return updateChunk(state, event, (chunk) => ({ ...chunk, status: 'pending' }));
    case 'chunkFailed':
      return updateChunk(state, event, (chunk) => ({ ...chunk, status: 'failed' }));
    case 'chunkResolved': {
      if (state.csv?.importId !== event.importId) return state;
      const { overflow, selection } = mergeWithinLimit(
        state.selection,
        event.selectable.map(({ student }) => student),
        MAX_SELECTED_MEMBERS,
      );
      const overflowIds = new Set(overflow.map((student) => student.accountId));
      const overLimit: CsvImportProblem[] = event.selectable
        .filter(({ student }) => overflowIds.has(student.accountId))
        .map(({ line, student }) => ({ kind: 'over_limit', line, student }));
      return updateChunk({ ...state, selection }, event, (chunk) => ({
        ...chunk,
        problems: [...event.problems, ...overLimit].sort((left, right) => left.line - right.line),
        status: 'resolved',
      }));
    }
    case 'ineligibleRejected': {
      const selection = new Map(state.selection);
      const ineligible: SelectableStudent[] = [];
      for (const accountId of event.accountIds) {
        const student = selection.get(accountId);
        if (student === undefined) continue;
        ineligible.push(student);
        selection.delete(accountId);
      }
      return { ...state, ineligible, selection };
    }
    case 'submitted':
      return { ...INITIAL_MEMBER_SELECTION_STATE, nextImportId: state.nextImportId };
  }
}

function updateChunk(
  state: MemberSelectionState,
  event: { chunkIndex: number; importId: number },
  update: (chunk: CsvChunk) => CsvChunk,
): MemberSelectionState {
  if (state.csv?.importId !== event.importId) return state;
  return {
    ...state,
    csv: {
      ...state.csv,
      chunks: state.csv.chunks.map((chunk, index) =>
        index === event.chunkIndex ? update(chunk) : chunk,
      ),
    },
  };
}

/** Every CSV problem, ordered by line, for the import summary and the confirmation. */
export function csvProblems(csv: CsvImport): CsvImportProblem[] {
  return [...csv.lineProblems, ...csv.chunks.flatMap((chunk) => chunk.problems)].sort(
    (left, right) => left.line - right.line,
  );
}

export function csvProgress(csv: CsvImport): 'failed' | 'pending' | 'resolved' {
  if (csv.chunks.some((chunk) => chunk.status === 'pending')) return 'pending';
  if (csv.chunks.some((chunk) => chunk.status === 'failed')) return 'failed';
  return 'resolved';
}
