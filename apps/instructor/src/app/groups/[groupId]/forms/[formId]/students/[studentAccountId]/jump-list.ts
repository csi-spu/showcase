import type {
  InstructorReviewPosition,
  InstructorReviewStudent,
} from '@/lib/instructor-collection-forms-contract';

/**
 * The Students the jump list offers: those on the table page holding this one.
 *
 * A Student a decision moved out of the filter is still offered, where they
 * sort: after their previous neighbour, or first when that neighbour is on an
 * earlier page.
 */
export function jumpListStudents(place: InstructorReviewPosition): InstructorReviewStudent[] {
  const { entry, pageStudents, previous } = place;
  if (place.position !== null) return pageStudents;
  const insertAt =
    previous === null
      ? 0
      : pageStudents.findIndex(
          (student) => student.studentAccountId === previous.studentAccountId,
        ) + 1;
  return [...pageStudents.slice(0, insertAt), entry, ...pageStudents.slice(insertAt)];
}
