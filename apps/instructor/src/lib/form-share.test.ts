import { describe, expect, it } from 'vitest';
import { buildStudentFormLink, qrCodeFilename, renderQrCodeSvg } from './form-share';

const FORM_ID = '8d7f4c1e-2b6a-4f3d-9e5c-1a2b3c4d5e6f';

describe('buildStudentFormLink', () => {
  it('points at the form on the Student Collection origin and carries nothing else', () => {
    expect(buildStudentFormLink('https://collect.example.test', FORM_ID)).toBe(
      `https://collect.example.test/forms/${FORM_ID}`,
    );
  });
});

describe('qrCodeFilename', () => {
  it('keeps a Thai title readable', () => {
    expect(qrCodeFilename('เอกสารฝึกงาน ครั้งที่ 1', FORM_ID)).toBe(
      'qr-เอกสารฝึกงาน ครั้งที่ 1.png',
    );
  });

  it('strips characters that are invalid in file names', () => {
    expect(qrCodeFilename('แบบ/ฟอร์ม: "ส่ง" <งาน>?*|\\\u0007', FORM_ID)).toBe(
      'qr-แบบฟอร์ม ส่ง งาน.png',
    );
  });

  it('falls back to the form ID when nothing usable is left', () => {
    expect(qrCodeFilename(' /:*?"<>| . ', FORM_ID)).toBe(`qr-${FORM_ID}.png`);
  });
});

describe('renderQrCodeSvg', () => {
  it('renders an SVG document', async () => {
    await expect(renderQrCodeSvg(`https://collect.example.test/forms/${FORM_ID}`)).resolves.toMatch(
      /^<svg[\s\S]*<\/svg>\s*$/u,
    );
  });
});
