/*
 * Maps Core error codes onto the sentences the Student reads.
 *
 * This lives outside the actions file because a 'use server' module may only
 * export async functions.
 */

export type StudentFormsErrorMessage =
  | 'answerInvalid'
  | 'deadlinePassed'
  | 'draftStale'
  | 'fileCountExceeded'
  | 'fileNotReady'
  | 'fileRequired'
  | 'fileTooLarge'
  | 'fileTypeNotAllowed'
  | 'formNotFound'
  | 'formNotOpen'
  | 'notFound'
  | 'sessionExpired'
  | 'submissionTooLarge'
  | 'unavailable';

export function toErrorMessage(code: string): StudentFormsErrorMessage {
  switch (code) {
    case 'ANSWER_FIELD_UNKNOWN':
    case 'ANSWER_INVALID':
      return 'answerInvalid';
    case 'DEADLINE_PASSED':
      return 'deadlinePassed';
    case 'DRAFT_STALE':
    case 'SUBMISSION_STALE':
      return 'draftStale';
    case 'FILE_COUNT_EXCEEDED':
      return 'fileCountExceeded';
    case 'FILE_NOT_READY':
      return 'fileNotReady';
    case 'FILE_REQUIRED':
      return 'fileRequired';
    case 'FILE_SIZE_INVALID':
    case 'FILE_TOO_LARGE':
      return 'fileTooLarge';
    case 'FILE_NAME_INVALID':
    case 'FILE_TYPE_NOT_ALLOWED':
      return 'fileTypeNotAllowed';
    /*
     * A closed form, and a closed round, both refuse the write for the same
     * reason from the Student's side: this form no longer takes answers. Left
     * unmapped they read as an outage, which sends the Student to support over
     * a decision an Instructor made deliberately.
     */
    case 'FORM_NOT_EDITABLE':
    case 'FORM_NOT_OPEN':
    case 'FORM_NOT_SUBMITTABLE':
    case 'ROUND_CLOSED':
      return 'formNotOpen';
    /*
     * The form was deleted, or never reached this Student. Unlike a missing
     * field or file, nothing on this page can be written again, so it has its
     * own sentence and the page stops offering retries.
     */
    case 'FORM_NOT_FOUND':
      return 'formNotFound';
    case 'FIELD_NOT_FOUND':
    case 'FILE_NOT_ACCESSIBLE':
      return 'notFound';
    case 'SUBMISSION_TOO_LARGE':
      return 'submissionTooLarge';
    case 'SESSION_EXPIRED':
    case 'UNAUTHENTICATED':
      return 'sessionExpired';
    default:
      return 'unavailable';
  }
}
