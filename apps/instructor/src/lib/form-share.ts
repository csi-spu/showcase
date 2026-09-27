import 'server-only';
import QRCode from 'qrcode';

/*
 * The Student link only locates a form in the Student Collection frontend.
 * Access is decided there by the Student's session and Core's obligation
 * check, so the link carries nothing but the form ID: no token, no group, and
 * never a Student ID.
 */

const QR_CODE_ERROR_CORRECTION = 'M';
const QR_CODE_PNG_WIDTH = 1024;
/* Reserved on common file systems, plus control characters. */
const INVALID_FILENAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/gu;

export function buildStudentFormLink(studentCollectionUrl: string, formId: string): string {
  return new URL(`/forms/${encodeURIComponent(formId)}`, studentCollectionUrl).toString();
}

/**
 * Names the downloaded QR code after the form so a folder of them stays
 * readable, falling back to the form ID when the title leaves nothing usable.
 */
export function qrCodeFilename(formTitle: string, formId: string): string {
  const name = formTitle
    .replace(INVALID_FILENAME_CHARACTERS, '')
    .replace(/\s+/gu, ' ')
    .replace(/^[\s.]+|[\s.]+$/gu, '');
  return `qr-${name.length > 0 ? name : formId}.png`;
}

/* Generated here so the QR library never reaches the client bundle. */
export function renderQrCodeSvg(link: string): Promise<string> {
  return QRCode.toString(link, { errorCorrectionLevel: QR_CODE_ERROR_CORRECTION, type: 'svg' });
}

export function renderQrCodePng(link: string): Promise<Buffer> {
  return QRCode.toBuffer(link, {
    errorCorrectionLevel: QR_CODE_ERROR_CORRECTION,
    type: 'png',
    width: QR_CODE_PNG_WIDTH,
  });
}
