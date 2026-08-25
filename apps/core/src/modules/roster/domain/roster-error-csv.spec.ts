import { createRosterErrorCsv, rosterRowRetryState } from './roster-error-csv';

describe('createRosterErrorCsv', () => {
  it('exports exact Thai error columns and neutralizes spreadsheet formulas', () => {
    const csv = createRosterErrorCsv([
      {
        errorCode: 'INVALID_STUDENT_ID',
        rowNumber: 2,
        studentId: '=2+3',
      },
      {
        errorCode: 'ROSTER_CONFLICT',
        rowNumber: 4,
        studentId: '69000001',
      },
    ]);

    expect(csv).toBe(
      '\uFEFFrow_number,student_id,error_code,error_message_th\r\n' +
        "2,'=2+3,INVALID_STUDENT_ID,รหัสนักศึกษาต้องเป็นตัวเลขอารบิก 8 หลัก\r\n" +
        '4,69000001,ROSTER_CONFLICT,ชื่อและนามสกุลไม่ตรงกับข้อมูลเดิม\r\n',
    );
  });

  it('reports retryable provider outcomes as scheduled until terminal exhaustion', () => {
    expect(rosterRowRetryState('ROSTER_AUTH_PROVIDER_UNAVAILABLE', 'pending')).toBe(
      'retry_scheduled',
    );
    expect(rosterRowRetryState('ROSTER_AUTH_PROVIDER_UNAVAILABLE', 'failed')).toBe('exhausted');
    expect(rosterRowRetryState('ROSTER_CONFLICT', 'failed')).toBe('not_retryable');
  });
});
