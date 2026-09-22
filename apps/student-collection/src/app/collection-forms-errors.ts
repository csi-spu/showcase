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
    case 'FORM_NOT_OPEN':
      return 'formNotOpen';
    case 'FIELD_NOT_FOUND':
    case 'FILE_NOT_ACCESSIBLE':
    case 'FORM_NOT_FOUND':
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
