/*
 * Structural inspection of uploaded collection files.
 *
 * This identifies what the bytes actually are, independently of what the browser
 * claimed. A file passes only when its real structure matches one of the allowed
 * document types and agrees with the declared type.
 *
 * What this is NOT: this is not malware scanning. It establishes file type, not
 * safety. A structurally valid document can still carry a malicious macro or a
 * crafted exploit. The product must therefore never tell a Student, an
 * Instructor, or an Admin that an inspected file is "safe" -- only that it is a
 * readable document of the expected type. Adding an antivirus scanner later
 * means implementing CollectionFileInspector again and chaining it after this
 * one; no other layer has to change.
 */

import type {
  CollectionFileInspection,
  CollectionFileInspector,
} from '../application/collection-forms.ports';

/* Office formats are ZIP containers; these are the parts that identify them. */
const OOXML_MARKERS = {
  docx: 'word/',
  xlsx: 'xl/',
} as const;

const CONTENT_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

type DetectedType = keyof typeof CONTENT_TYPES;

export class StructuralCollectionFileInspector implements CollectionFileInspector {
  inspect(input: {
    bytes: Buffer;
    declaredContentType: string;
    filename: string;
  }): Promise<CollectionFileInspection> {
    const detected = detectType(input.bytes);

    if (detected === null) {
      return Promise.resolve({
        detectedContentType: null,
        errorCode: 'FILE_CONTENT_UNRECOGNIZED',
        isAccepted: false,
      });
    }

    const detectedContentType = CONTENT_TYPES[detected];

    /*
     * The bytes must be what the upload said they were. A mismatch means the
     * request was wrong about its own content, so it is rejected rather than
     * silently reclassified -- the field's allow-list was checked against the
     * declared type.
     */
    if (detectedContentType !== input.declaredContentType) {
      return Promise.resolve({
        detectedContentType,
        errorCode: 'FILE_CONTENT_MISMATCH',
        isAccepted: false,
      });
    }

    return Promise.resolve({ detectedContentType, errorCode: null, isAccepted: true });
  }
}

/** Identifies a file from its own bytes. Returns null when nothing matches. */
export function detectType(bytes: Buffer): DetectedType | null {
  if (hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // "%PDF-"
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04])) return detectOoxml(bytes); // ZIP
  return null;
}

function hasPrefix(bytes: Buffer, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

/*
 * DOCX and XLSX are both ZIP archives, so the signature alone cannot tell them
 * apart. Rather than parse the whole archive, this looks for the directory
 * prefix each format must contain. The search is bounded to a window at the
 * start of the file so an enormous upload cannot turn inspection into a scan of
 * the entire payload.
 */
const OOXML_SCAN_BYTES = 64 * 1024;

function detectOoxml(bytes: Buffer): DetectedType | null {
  const window = bytes.subarray(0, OOXML_SCAN_BYTES).toString('latin1');

  /*
   * `[Content_Types].xml` is mandatory in every OOXML package. Requiring it
   * keeps a plain ZIP that merely contains a folder called `word/` from being
   * accepted as a document.
   */
  if (!window.includes('[Content_Types].xml')) return null;

  const hasWord = window.includes(OOXML_MARKERS.docx);
  const hasExcel = window.includes(OOXML_MARKERS.xlsx);

  /* Ambiguous or unidentifiable packages fail rather than guess. */
  if (hasWord === hasExcel) return null;
  return hasWord ? 'docx' : 'xlsx';
}
