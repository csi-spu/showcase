import { toColumnName, writeXlsxWorkbook, type XlsxSheet } from './xlsx-writer';

/*
 * An .xlsx is a ZIP of XML parts. These tests read the parts back out of the
 * archive rather than asserting on the bytes the writer happened to emit, so
 * they fail if the workbook stops being something a reader can open.
 */
async function readParts(sheets: XlsxSheet[]): Promise<Map<string, string>> {
  const chunks: Buffer[] = [];
  for await (const chunk of writeXlsxWorkbook(sheets)) chunks.push(chunk);
  const archive = Buffer.concat(chunks);
  const parts = new Map<string, string>();
  let offset = 0;
  while (offset < archive.byteLength - 4) {
    if (archive.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const path = archive.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const dataStart = nameStart + nameLength + extraLength;
    /* Entries are stored, so the bytes run to the next descriptor signature. */
    let end = dataStart;
    while (end < archive.byteLength - 4 && archive.readUInt32LE(end) !== 0x08074b50) end += 1;
    parts.set(path, archive.subarray(dataStart, end).toString('utf8'));
    offset = end + 24;
  }
  return parts;
}

function sheet(name: string, headers: string[], rows: string[][]): XlsxSheet {
  return {
    headers,
    name,
    // eslint-disable-next-line @typescript-eslint/require-await -- satisfies the AsyncIterable contract; a sync generator does not
    rows: async function* () {
      for (const row of rows) yield row;
    },
  };
}

describe('xlsx writer', () => {
  it('writes the package parts a reader needs to open the workbook', async () => {
    const parts = await readParts([sheet('Tracking', ['A'], [['1']])]);
    expect([...parts.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
    ]);
  });

  it('writes every user value as inline text, never as a formula', async () => {
    const parts = await readParts([
      sheet('S', ['h'], [["=cmd|'/c calc'!A1"], ['+1+1'], ['-1'], ['@SUM(A1)']]),
    ]);
    const xml = parts.get('xl/worksheets/sheet1.xml') ?? '';
    expect(xml).not.toContain('<f>');
    expect(xml).toContain('t="inlineStr"');
    /* The payload survives as content, which is the point: it is data, not code. */
    expect(xml).toContain('=cmd|&apos;/c calc&apos;!A1');
    expect(xml).toContain('@SUM(A1)');
  });

  it('escapes the characters that would otherwise break the XML', async () => {
    const parts = await readParts([sheet('S', ['h'], [['a & b < c > d "q"']])]);
    const xml = parts.get('xl/worksheets/sheet1.xml') ?? '';
    expect(xml).toContain('a &amp; b &lt; c &gt; d &quot;q&quot;');
  });

  it('drops control characters XML cannot represent, rather than emitting them', async () => {
    const parts = await readParts([sheet('S', ['h'], [['a\u0000b\u0008c']])]);
    expect(parts.get('xl/worksheets/sheet1.xml') ?? '').toContain('>abc<');
  });

  it('keeps Thai headers and values intact', async () => {
    const parts = await readParts([sheet('ติดตาม', ['นักศึกษา'], [['สมชาย ใจดี']])]);
    expect(parts.get('xl/workbook.xml') ?? '').toContain('ติดตาม');
    expect(parts.get('xl/worksheets/sheet1.xml') ?? '').toContain('สมชาย ใจดี');
  });

  it('writes the header row first and numbers rows from one', async () => {
    const parts = await readParts([sheet('S', ['h1', 'h2'], [['a', 'b']])]);
    const xml = parts.get('xl/worksheets/sheet1.xml') ?? '';
    expect(xml).toContain('<row r="1">');
    expect(xml).toContain('r="A1"');
    expect(xml).toContain('r="B2"');
  });

  it('omits an empty cell rather than writing a blank one', async () => {
    const parts = await readParts([sheet('S', ['h1', 'h2'], [['', 'b']])]);
    const xml = parts.get('xl/worksheets/sheet1.xml') ?? '';
    expect(xml).not.toContain('r="A2"');
    expect(xml).toContain('r="B2"');
  });

  it('corrects a sheet name Excel would refuse, so the file still opens', async () => {
    const parts = await readParts([sheet('a/b?c*[d]:e', ['h'], [])]);
    const workbook = parts.get('xl/workbook.xml') ?? '';
    expect(workbook).toContain('name="a b c  d  e"');
  });

  it('truncates and disambiguates duplicate sheet names', async () => {
    const parts = await readParts([
      sheet('Same', ['h'], []),
      sheet('Same', ['h'], []),
      sheet('x'.repeat(40), ['h'], []),
    ]);
    const names = [...(parts.get('xl/workbook.xml') ?? '').matchAll(/<sheet name="([^"]*)"/gu)].map(
      (match) => match[1] ?? '',
    );
    expect(names[0]).toBe('Same');
    expect(names[1]).toBe('Same (2)');
    expect(names[2]).toHaveLength(31);
    expect(new Set(names).size).toBe(3);
  });

  it('pulls rows lazily, so a cohort-sized sheet is never held in memory', async () => {
    let live = 0;
    let peak = 0;
    const chunks: Buffer[] = [];
    const generator = writeXlsxWorkbook([
      {
        headers: ['h'],
        name: 'S',
        // eslint-disable-next-line @typescript-eslint/require-await -- satisfies the AsyncIterable contract; a sync generator does not
        rows: async function* () {
          for (let index = 0; index < 50; index += 1) {
            live += 1;
            peak = Math.max(peak, live);
            yield [String(index)];
            live -= 1;
          }
        },
      },
    ]);
    for await (const chunk of generator) chunks.push(chunk);
    expect(peak).toBe(1);
    expect(chunks.length).toBeGreaterThan(50);
  });

  describe('column names', () => {
    it('follows the spreadsheet alphabet past Z', () => {
      expect(toColumnName(0)).toBe('A');
      expect(toColumnName(25)).toBe('Z');
      expect(toColumnName(26)).toBe('AA');
      expect(toColumnName(51)).toBe('AZ');
      expect(toColumnName(52)).toBe('BA');
      expect(toColumnName(701)).toBe('ZZ');
      expect(toColumnName(702)).toBe('AAA');
    });
  });
});
