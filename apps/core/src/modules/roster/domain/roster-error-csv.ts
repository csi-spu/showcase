export type RosterRowErrorCode =
  | 'DUPLICATE_STUDENT_ID'
  | 'INVALID_FIRST_NAME'
  | 'INVALID_LAST_NAME'
  | 'INVALID_STUDENT_ID'
  | 'ROSTER_AUTH_PROVIDER_UNAVAILABLE'
  | 'ROSTER_CONFLICT'
  | 'ROSTER_PROCESSING_FAILED';

export interface RosterErrorRow {
  errorCode: RosterRowErrorCode;
  rowNumber: number;
  studentId: string;
}

export type RosterRowRetryState = 'exhausted' | 'not_retryable' | 'retry_scheduled';

export interface RosterRowErrorDetail extends RosterErrorRow {
  attemptCount: number;
  errorMessageTh: string;
  retryState: RosterRowRetryState;
}

const ERROR_MESSAGES_TH: Record<RosterRowErrorCode, string> = {
  DUPLICATE_STUDENT_ID: 'รหัสนักศึกษาซ้ำภายในไฟล์',
  INVALID_FIRST_NAME: 'กรุณาระบุชื่อภาษาไทย',
  INVALID_LAST_NAME: 'กรุณาระบุนามสกุลภาษาไทย',
  INVALID_STUDENT_ID: 'รหัสนักศึกษาต้องเป็นตัวเลขอารบิก 8 หลัก',
  ROSTER_AUTH_PROVIDER_UNAVAILABLE: 'ไม่สามารถสร้างบัญชียืนยันตัวตนได้หลังลองครบจำนวน',
  ROSTER_CONFLICT: 'ชื่อและนามสกุลไม่ตรงกับข้อมูลเดิม',
  ROSTER_PROCESSING_FAILED: 'ระบบประมวลผลแถวนี้ไม่สำเร็จหลังลองครบจำนวน',
};

export function createRosterErrorCsv(rows: RosterErrorRow[]): string {
  const header = ['row_number', 'student_id', 'error_code', 'error_message_th'];
  const records = rows.map((row) => [
    String(row.rowNumber),
    makeSpreadsheetSafe(row.studentId),
    row.errorCode,
    ERROR_MESSAGES_TH[row.errorCode],
  ]);
  return `\uFEFF${[header, ...records].map((record) => record.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}

export function rosterErrorMessageTh(errorCode: RosterRowErrorCode): string {
  return ERROR_MESSAGES_TH[errorCode];
}

export function rosterRowRetryState(
  errorCode: RosterRowErrorCode,
  status: 'failed' | 'pending' | 'processing',
): RosterRowRetryState {
  const isRetryable = ['ROSTER_AUTH_PROVIDER_UNAVAILABLE', 'ROSTER_PROCESSING_FAILED'].includes(
    errorCode,
  );
  if (!isRetryable) return 'not_retryable';
  return status === 'failed' ? 'exhausted' : 'retry_scheduled';
}

function makeSpreadsheetSafe(value: string): string {
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
