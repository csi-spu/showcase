/*
 * A minimal streaming XLSX writer.
 *
 * An .xlsx file is a ZIP of XML parts, so this builds the parts and hands them
 * to the ZIP writer, which streams them out. Rows are pulled from an async
 * iterable, so a workbook covering a whole cohort is never assembled in memory.
 *
 * Hand-rolled for one reason above all: every user-supplied value is written as
 * an inline string, never as a formula. A spreadsheet library that helpfully
 * infers types is the usual way `=cmd|'...'` reaches a reviewer's machine.
 */

import { writeZipArchive, type ZipEntry } from './zip-writer';

/* One sheet per form plus the tracking sheet; bounded by the export contract. */
export const MAX_SHEET_NAME_LENGTH = 31;

export interface XlsxSheet {
  /** Header row, written as literal text like every other cell. */
  headers: string[];
  name: string;
  rows: () => AsyncIterable<string[]>;
}

/**
 * Streams an .xlsx workbook.
 *
 * Sheets are consumed in order and each sheet's rows exactly once, which is
 * what keeps a large workbook bounded: the writer holds one row at a time.
 */
export function writeXlsxWorkbook(sheets: XlsxSheet[]): AsyncGenerator<Buffer> {
  const names = sheets.map((sheet, index) => toSheetName(sheet.name, index, sheets));
  return writeZipArchive(workbookParts(sheets, names));
}

function* workbookParts(sheets: XlsxSheet[], names: string[]): Generator<ZipEntry> {
  yield staticPart(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      sheets
        .map(
          (_sheet, index) =>
            `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      `</Types>`,
  );

  yield staticPart(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  );

  yield staticPart(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>` +
      names
        .map(
          (name, index) =>
            `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
        )
        .join('') +
      `</sheets></workbook>`,
  );

  yield staticPart(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets
        .map(
          (_sheet, index) =>
            `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
        )
        .join('') +
      `</Relationships>`,
  );

  for (const [index, sheet] of sheets.entries()) {
    yield {
      path: `xl/worksheets/sheet${index + 1}.xml`,
      read: () => readSheet(sheet),
    };
  }
}

async function* readSheet(sheet: XlsxSheet): AsyncGenerator<Buffer> {
  yield Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`,
    'utf8',
  );
  let rowNumber = 1;
  yield Buffer.from(renderRow(sheet.headers, rowNumber), 'utf8');
  for await (const cells of sheet.rows()) {
    rowNumber += 1;
    yield Buffer.from(renderRow(cells, rowNumber), 'utf8');
  }
  yield Buffer.from(`</sheetData></worksheet>`, 'utf8');
}

function renderRow(cells: string[], rowNumber: number): string {
  const rendered = cells
    .map((value, index) => {
      if (value === '') return '';
      /*
       * `t="inlineStr"` is the whole point of this writer. The value is text,
       * so a leading `=`, `+`, `-` or `@` is content rather than a formula a
       * spreadsheet would evaluate when the Instructor opens the file.
       */
      return (
        `<c r="${toColumnName(index)}${rowNumber}" t="inlineStr">` +
        `<is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
      );
    })
    .join('');
  return `<row r="${rowNumber}">${rendered}</row>`;
}

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function toColumnName(index: number): string {
  let name = '';
  let remaining = index;
  while (remaining >= 0) {
    name = String.fromCharCode(65 + (remaining % 26)) + name;
    remaining = Math.floor(remaining / 26) - 1;
  }
  return name;
}

/*
 * Excel rejects a workbook whose sheet name is empty, too long, duplicated, or
 * contains one of its reserved characters, so a form title the Instructor chose
 * is corrected here rather than producing a file that will not open.
 */
function toSheetName(name: string, index: number, sheets: XlsxSheet[]): string {
  const cleaned = name.replace(/[\\/?*[\]:]/gu, ' ').trim();
  const base = cleaned === '' ? `Sheet${index + 1}` : cleaned.slice(0, MAX_SHEET_NAME_LENGTH);
  const earlier = sheets
    .slice(0, index)
    .some((sheet) => toSheetName(sheet.name, sheets.indexOf(sheet), sheets) === base);
  if (!earlier) return base;
  /* Suffixed rather than dropped, so two identically titled forms both appear. */
  const suffix = ` (${index + 1})`;
  return `${base.slice(0, MAX_SHEET_NAME_LENGTH - suffix.length)}${suffix}`;
}

function staticPart(path: string, xml: string): ZipEntry {
  const bytes = Buffer.from(xml, 'utf8');
  return {
    path,
    read: async function* () {
      yield bytes;
    },
  };
}

/*
 * Also strips the control characters XML 1.0 cannot represent at all. A stray
 * one in a pasted answer would otherwise make the whole workbook unreadable.
 */
function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}
