import { describe, expect, it } from 'vitest';
import { MAX_SELECTED_MEMBERS, type SelectableStudent } from '@/lib/member-selection-contract';
import {
  csvProblems,
  csvProgress,
  INITIAL_MEMBER_SELECTION_STATE,
  memberSelectionReducer,
  type MemberSelectionEvent,
  type MemberSelectionState,
} from './member-selection-state';

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
    studentId: String(69000000 + index),
  };
}

function reduce(events: MemberSelectionEvent[], state = INITIAL_MEMBER_SELECTION_STATE) {
  return events.reduce(memberSelectionReducer, state);
}

function withSelected(count: number): MemberSelectionState {
  return reduce([
    {
      students: Array.from({ length: count }, (_, index) => student(1_000 + index)),
      type: 'selectedMany',
    },
  ]);
}

const PARSED: MemberSelectionEvent = {
  entries: [
    { line: 2, studentId: '65000001' },
    { line: 3, studentId: '65000002' },
  ],
  fileName: 'members.csv',
  lineProblems: [{ kind: 'invalid_format', line: 4, value: 'x' }],
  type: 'csvParsed',
};

describe('memberSelectionReducer', () => {
  it('toggles only selectable Students', () => {
    const state = reduce([
      { student: student(1), type: 'toggled' },
      { student: student(2, 'no_access'), type: 'toggled' },
    ]);
    expect([...state.selection.keys()]).toEqual([student(1).accountId]);
    expect(reduce([{ student: student(1), type: 'toggled' }], state).selection.size).toBe(0);
  });

  it(`never selects more than ${MAX_SELECTED_MEMBERS} Students`, () => {
    const full = withSelected(MAX_SELECTED_MEMBERS);
    expect(reduce([{ student: student(1), type: 'toggled' }], full).selection.size).toBe(
      MAX_SELECTED_MEMBERS,
    );
  });

  it('adds resolved CSV matches and reports those beyond the limit by line', () => {
    const almostFull = withSelected(MAX_SELECTED_MEMBERS - 1);
    const state = reduce(
      [
        PARSED,
        {
          chunkIndex: 0,
          importId: 1,
          problems: [],
          selectable: [
            { line: 2, student: student(1) },
            { line: 3, student: student(2) },
          ],
          type: 'chunkResolved',
        },
      ],
      almostFull,
    );

    expect(state.selection.size).toBe(MAX_SELECTED_MEMBERS);
    expect(state.selection.has(student(1).accountId)).toBe(true);
    expect(state.csv && csvProblems(state.csv)).toEqual([
      { kind: 'over_limit', line: 3, student: student(2) },
      { kind: 'invalid_format', line: 4, value: 'x' },
    ]);
    expect(state.csv && csvProgress(state.csv)).toBe('resolved');
  });

  it('marks a failed chunk for retry and ignores results for a replaced file', () => {
    const failed = reduce([PARSED, { chunkIndex: 0, importId: 1, type: 'chunkFailed' }]);
    expect(failed.csv && csvProgress(failed.csv)).toBe('failed');
    const retried = reduce([{ chunkIndex: 0, importId: 1, type: 'chunkRetried' }], failed);
    expect(retried.csv && csvProgress(retried.csv)).toBe('pending');

    const replaced = reduce(
      [
        PARSED,
        {
          chunkIndex: 0,
          importId: 1,
          problems: [],
          selectable: [{ line: 2, student: student(1) }],
          type: 'chunkResolved',
        },
      ],
      retried,
    );
    expect(replaced.csv?.importId).toBe(2);
    expect(replaced.selection.size).toBe(0);
  });

  it('moves Students Core rechecked as ineligible out of the selection', () => {
    const state = reduce([
      { students: [student(1), student(2)], type: 'selectedMany' },
      { accountIds: [student(2).accountId], type: 'ineligibleRejected' },
    ]);
    expect([...state.selection.keys()]).toEqual([student(1).accountId]);
    expect(state.ineligible).toEqual([student(2)]);
  });

  it('starts over after a successful submission', () => {
    const state = reduce([PARSED, { student: student(1), type: 'toggled' }, { type: 'submitted' }]);
    expect(state.selection.size).toBe(0);
    expect(state.csv).toBeNull();
    expect(state.nextImportId).toBe(2);
  });
});
