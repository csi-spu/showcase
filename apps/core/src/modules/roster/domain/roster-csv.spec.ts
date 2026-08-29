import { RosterCsvError, parseRosterCsv, prepareRosterStudent } from './roster-csv';

describe('prepareRosterStudent', () => {
  it('normalizes names and derives the Buddhist Entry Year from Student ID', () => {
    const decomposedName = '\u0E01\u0E33';

    expect(
      prepareRosterStudent({
        firstNameTh: ` ${decomposedName} `,
        lastNameTh: ' ใจดี ',
        studentId: '69000001',
      }),
    ).toEqual({
      entryYear: 2569,
      firstNameTh: decomposedName.normalize('NFC'),
      lastNameTh: 'ใจดี',
      rowNumber: 2,
      studentId: '69000001',
    });
  });
});

describe('parseRosterCsv', () => {
  it('accepts the exact header and normalizes trimmed Thai names to NFC', () => {
    const decomposedName = '\u0E01\u0E33';
    const csv = Buffer.from(
      `student_id,first_name_th,last_name_th\r\n69000001, ${decomposedName} , ใจดี \r\n`,
      'utf8',
    );

    expect(parseRosterCsv(csv)).toEqual([
      {
        entryYear: 2569,
        firstNameTh: decomposedName.normalize('NFC'),
        lastNameTh: 'ใจดี',
        rowNumber: 2,
        studentId: '69000001',
      },
    ]);
  });

  it.each([
    ['student_id,first_name_th\n69000001,สมชาย\n', 'INVALID_ROSTER_HEADER'],
    [
      'student_id,first_name_th,last_name_th,unknown\n69000001,สมชาย,ใจดี,value\n',
      'INVALID_ROSTER_HEADER',
    ],
  ] as const)('rejects a non-conforming file with a stable code', (csv, code) => {
    expect(() => parseRosterCsv(Buffer.from(csv, 'utf8'))).toThrow(new RosterCsvError(code));
  });

  it('derives a Buddhist Entry Year per row and accepts multiple cohorts in one Batch', () => {
    const csv = Buffer.from(
      [
        'student_id,first_name_th,last_name_th',
        '66000001,สมชาย,ใจดี',
        '70000001,สมหญิง,มั่นคง',
      ].join('\n'),
      'utf8',
    );

    expect(parseRosterCsv(csv)).toEqual([
      expect.objectContaining({ entryYear: 2566, studentId: '66000001' }),
      expect.objectContaining({ entryYear: 2570, studentId: '70000001' }),
    ]);
  });

  it('returns a stable row error while preserving independently valid rows', () => {
    const csv = Buffer.from(
      [
        'student_id,first_name_th,last_name_th',
        '69000001,สมชาย,ใจดี',
        'not-an-id,สมหญิง,มั่นคง',
        '70000001,สมปอง,กล้าหาญ',
      ].join('\n'),
      'utf8',
    );

    expect(parseRosterCsv(csv)).toEqual([
      {
        entryYear: 2569,
        firstNameTh: 'สมชาย',
        lastNameTh: 'ใจดี',
        rowNumber: 2,
        studentId: '69000001',
      },
      {
        errorCode: 'INVALID_STUDENT_ID',
        rowNumber: 3,
        studentId: 'not-an-id',
      },
      {
        entryYear: 2570,
        firstNameTh: 'สมปอง',
        lastNameTh: 'กล้าหาญ',
        rowNumber: 4,
        studentId: '70000001',
      },
    ]);
  });

  it('returns an error for every duplicated Student ID without depending on row order', () => {
    const csv = Buffer.from(
      [
        'student_id,first_name_th,last_name_th',
        '69000001,สมชาย,ใจดี',
        '69000002,สมหญิง,มั่นคง',
        '69000001,สมชาย,ใจดี',
      ].join('\n'),
      'utf8',
    );

    expect(parseRosterCsv(csv)).toEqual([
      { errorCode: 'DUPLICATE_STUDENT_ID', rowNumber: 2, studentId: '69000001' },
      expect.objectContaining({ rowNumber: 3, studentId: '69000002' }),
      { errorCode: 'DUPLICATE_STUDENT_ID', rowNumber: 4, studentId: '69000001' },
    ]);
  });

  it('rejects a header-only file so a Batch cannot remain pending forever', () => {
    expect(() =>
      parseRosterCsv(Buffer.from('student_id,first_name_th,last_name_th\n', 'utf8')),
    ).toThrow(new RosterCsvError('INVALID_ROSTER_CSV'));
  });

  it('enforces the 10,000 data-row bound', () => {
    const rows = Array.from(
      { length: 10_001 },
      (_, index) => `69${String(index).padStart(6, '0')},ชื่อ${index},นามสกุล${index}`,
    );
    const csv = Buffer.from(['student_id,first_name_th,last_name_th', ...rows].join('\n'), 'utf8');

    expect(() => parseRosterCsv(csv)).toThrow(new RosterCsvError('ROSTER_ROW_LIMIT_EXCEEDED'));
  });
});
