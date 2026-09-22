import {
  StructuralCollectionFileInspector,
  detectType,
} from './structural-collection-file.inspector';

const PDF = Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

/** A minimal stand-in for an OOXML package: ZIP signature plus the parts that identify it. */
function ooxml(marker: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from(`[Content_Types].xml${marker}document.xml`, 'latin1'),
  ]);
}

const DOCX = ooxml('word/');
const XLSX = ooxml('xl/');

const CONTENT_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

describe('detectType', () => {
  it('identifies each allowed document type from its own bytes', () => {
    expect(detectType(PDF)).toBe('pdf');
    expect(detectType(JPEG)).toBe('jpeg');
    expect(detectType(PNG)).toBe('png');
    expect(detectType(DOCX)).toBe('docx');
    expect(detectType(XLSX)).toBe('xlsx');
  });

  it('refuses a file type the platform does not accept', () => {
    /* An ELF executable, which must never pass as a document. */
    expect(detectType(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02]))).toBeNull();
  });

  it('refuses an empty or truncated file', () => {
    expect(detectType(Buffer.alloc(0))).toBeNull();
    expect(detectType(Buffer.from([0x25, 0x50]))).toBeNull();
  });

  it('refuses a plain ZIP that is not an OOXML package', () => {
    const zip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('word/payload.exe', 'latin1'),
    ]);

    expect(detectType(zip)).toBeNull();
  });

  it('refuses an OOXML package that claims to be both formats', () => {
    expect(detectType(ooxml('word/xl/'))).toBeNull();
  });

  it('does not scan beyond the bounded window, so a huge upload cannot stall inspection', () => {
    const padded = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.alloc(200 * 1024, 0x41),
      Buffer.from('[Content_Types].xmlword/', 'latin1'),
    ]);

    expect(detectType(padded)).toBeNull();
  });
});

describe('StructuralCollectionFileInspector', () => {
  const inspector = new StructuralCollectionFileInspector();

  it('accepts a file whose bytes match what was declared', async () => {
    const result = await inspector.inspect({
      bytes: PDF,
      declaredContentType: CONTENT_TYPES.pdf,
      filename: 'report.pdf',
    });

    expect(result).toEqual({
      detectedContentType: CONTENT_TYPES.pdf,
      errorCode: null,
      isAccepted: true,
    });
  });

  it('rejects an executable renamed to look like a document', async () => {
    const result = await inspector.inspect({
      bytes: Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
      declaredContentType: CONTENT_TYPES.pdf,
      filename: 'report.pdf',
    });

    expect(result.isAccepted).toBe(false);
    expect(result.detectedContentType).toBeNull();
    expect(result.errorCode).toBe('FILE_CONTENT_UNRECOGNIZED');
  });

  it('rejects real bytes that disagree with the declared type', async () => {
    /*
     * The field's allow-list was checked against the declared type, so a file
     * that is really something else must not be quietly reclassified.
     */
    const result = await inspector.inspect({
      bytes: PNG,
      declaredContentType: CONTENT_TYPES.pdf,
      filename: 'report.pdf',
    });

    expect(result.isAccepted).toBe(false);
    expect(result.detectedContentType).toBe(CONTENT_TYPES.png);
    expect(result.errorCode).toBe('FILE_CONTENT_MISMATCH');
  });

  it('keeps DOCX and XLSX apart even though both are ZIP containers', async () => {
    const asDocx = await inspector.inspect({
      bytes: XLSX,
      declaredContentType: CONTENT_TYPES.docx,
      filename: 'sheet.docx',
    });

    expect(asDocx.isAccepted).toBe(false);
    expect(asDocx.detectedContentType).toBe(CONTENT_TYPES.xlsx);
  });

  it('never accepts a file it could not identify', async () => {
    const result = await inspector.inspect({
      bytes: Buffer.alloc(0),
      declaredContentType: CONTENT_TYPES.pdf,
      filename: 'empty.pdf',
    });

    expect(result.isAccepted).toBe(false);
  });
});
