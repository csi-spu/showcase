import type { MemberSelectionReads } from '@/lib/member-selection-contract';
import {
  listSelectableStudentsAction,
  listStudentEntryYearsAction,
  resolveStudentIdsAction,
  selectAllStudentsAction,
} from '../collection-groups.actions';

/* The picker's server functions, passed from pages to the client picker as one prop. */
export const MEMBER_SELECTION_READS: MemberSelectionReads = {
  listEntryYears: listStudentEntryYearsAction,
  listStudents: listSelectableStudentsAction,
  resolveStudentIds: resolveStudentIdsAction,
  selectAll: selectAllStudentsAction,
};
