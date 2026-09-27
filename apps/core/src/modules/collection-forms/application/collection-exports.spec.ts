import {
  EXPORT_LIFETIME_MILLISECONDS,
  MAX_EXPORT_ATTEMPTS,
  canRetryExport,
  isExportDownloadable,
  toDocumentPath,
  toExportExpiry,
  toExportStorageKey,
  toSafePathSegment,
  toStudentFolderName,
} from './collection-exports';

describe('collection export policy', () => {
  describe('storage keys and expiry', () => {
    it('names an artifact by kind so the two outputs of one request never collide', () => {
      const exportId = '11111111-1111-4111-8111-111111111111';
      expect(toExportStorageKey(exportId, 'excel')).toBe(`collection-exports/${exportId}.xlsx`);
      expect(toExportStorageKey(exportId, 'zip')).toBe(`collection-exports/${exportId}.zip`);
    });

    it('expires an artifact twenty-four hours after it becomes ready', () => {
      const readyAt = new Date('2026-09-23T10:00:00.000Z');
      expect(toExportExpiry(readyAt).toISOString()).toBe('2026-09-24T10:00:00.000Z');
      expect(EXPORT_LIFETIME_MILLISECONDS).toBe(86_400_000);
    });

    it('denies a download at the expiry instant even though cleanup may lag', () => {
      const expiresAt = new Date('2026-09-24T10:00:00.000Z');
      expect(
        isExportDownloadable({
          expiresAt,
          now: new Date('2026-09-24T09:59:59.999Z'),
          status: 'ready',
        }),
      ).toBe(true);
      expect(isExportDownloadable({ expiresAt, now: expiresAt, status: 'ready' })).toBe(false);
    });

    it('denies a download for every status other than ready', () => {
      const expiresAt = new Date('2026-09-24T10:00:00.000Z');
      const now = new Date('2026-09-23T10:00:00.000Z');
      for (const status of ['pending', 'building', 'failed', 'expired'] as const) {
        expect(isExportDownloadable({ expiresAt, now, status })).toBe(false);
      }
    });
  });

  describe('archive paths', () => {
    it('strips separators and traversal so no entry can escape the archive root', () => {
      /* What matters is the property, not the exact substitution: whatever
       * comes back is one segment that is neither a separator nor traversal. */
      for (const hostile of ['../../etc/passwd', '..', '.', 'a/b\\c', '....//..']) {
        const segment = toSafePathSegment(hostile, 'x');
        expect(segment).not.toContain('/');
        expect(segment).not.toContain('\\');
        expect(segment).not.toBe('..');
        expect(segment).not.toBe('.');
        expect(segment.length).toBeGreaterThan(0);
      }
      expect(toSafePathSegment('a/b\\c', 'x')).toBe('a_b_c');
      expect(toSafePathSegment('', 'fallback')).toBe('fallback');
    });

    it('keeps Thai names intact, because the archive is read by Thai staff', () => {
      expect(toSafePathSegment('สมชาย ใจดี', 'x')).toBe('สมชาย ใจดี');
    });

    it('removes control characters and Windows-hostile punctuation', () => {
      expect(toSafePathSegment('a\u0000b\u001fc', 'x')).toBe('a_b_c');
      expect(toSafePathSegment('re:port*?"<>|', 'x')).toBe('re_port______');
      expect(toSafePathSegment('trailing.', 'x')).toBe('trailing');
      expect(toSafePathSegment('.hidden', 'x')).toBe('hidden');
    });

    it('prefixes a Student folder with the Student ID Instructors recognise', () => {
      const first = toStudentFolderName({
        displayName: 'สมชาย ใจดี',
        position: 0,
        studentId: '66012345',
      });
      const second = toStudentFolderName({
        displayName: 'สมชาย ใจดี',
        position: 1,
        studentId: '66012346',
      });
      expect(first).toBe('66012345-สมชาย ใจดี');
      expect(second).toBe('66012346-สมชาย ใจดี');
    });

    it('falls back to snapshot position when no Student ID was recorded', () => {
      const first = toStudentFolderName({
        displayName: 'สมชาย ใจดี',
        position: 0,
        studentId: null,
      });
      const second = toStudentFolderName({
        displayName: 'สมชาย ใจดี',
        position: 1,
        studentId: null,
      });
      expect(first).toBe('001-สมชาย ใจดี');
      expect(second).toBe('002-สมชาย ใจดี');
    });

    it('builds a document path under the Student folder', () => {
      const path = toDocumentPath({
        displayName: 'สมชาย ใจดี',
        fieldId: 'transcript',
        filePosition: 0,
        formPosition: 2,
        formTitle: 'ใบสมัคร',
        originalFilename: 'เอกสาร.pdf',
        studentId: '66012345',
        studentPosition: 4,
      });
      expect(path).toBe('66012345-สมชาย ใจดี/03-ใบสมัคร/transcript-01-เอกสาร.pdf');
    });

    it('keeps two files of one field distinct by position', () => {
      const shared = {
        displayName: 'A',
        fieldId: 'docs',
        formPosition: 0,
        formTitle: 'F',
        originalFilename: 'same.pdf',
        studentId: null,
        studentPosition: 0,
      };
      expect(toDocumentPath({ ...shared, filePosition: 0 })).not.toBe(
        toDocumentPath({ ...shared, filePosition: 1 }),
      );
    });
  });

  describe('retries', () => {
    it('stops retrying past the attempt limit so failure surfaces instead of looping', () => {
      expect(canRetryExport(0)).toBe(true);
      expect(canRetryExport(MAX_EXPORT_ATTEMPTS - 1)).toBe(true);
      expect(canRetryExport(MAX_EXPORT_ATTEMPTS)).toBe(false);
    });
  });
});
