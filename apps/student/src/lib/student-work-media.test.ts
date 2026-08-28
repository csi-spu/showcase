import { describe, expect, it } from 'vitest';
import { validateWorkMediaDimensions, validateWorkMediaFile } from './student-work-media';

describe('validateWorkMediaFile', () => {
  it.each([
    ['poster.JPG', 'image/jpeg', 'jpg'],
    ['poster.jpeg', 'image/jpeg', 'jpeg'],
    ['gallery.png', 'image/png', 'png'],
    ['gallery.webp', 'image/webp', 'webp'],
  ])('accepts %s when MIME and extension agree', (name, type, extension) => {
    expect(validateWorkMediaFile({ name, size: 5_242_880, type })).toEqual({
      contentType: type,
      extension,
      isValid: true,
    });
  });

  it.each([
    ['poster.gif', 'image/gif', 1024],
    ['poster.png', 'image/jpeg', 1024],
    ['poster', 'image/jpeg', 1024],
    ['poster.jpg', 'image/jpeg', 0],
    ['poster.jpg', 'image/jpeg', 5_242_881],
  ])('rejects unsafe file %s', (name, type, size) => {
    expect(validateWorkMediaFile({ name, size, type })).toEqual({ isValid: false });
  });
});

describe('validateWorkMediaDimensions', () => {
  it.each([
    ['poster at 2:3', 800, 1200, 'poster'],
    ['poster at 4:5', 800, 1000, 'poster'],
    ['landscape gallery image', 1600, 900, 'gallery'],
  ] as const)('accepts %s', (_scenario, width, height, mediaKind) => {
    expect(validateWorkMediaDimensions({ height, mediaKind, width })).toEqual({ isValid: true });
  });

  it.each([
    ['side shorter than 320 pixels', 319, 1000, 'gallery', 'dimensions'],
    ['side longer than 8,192 pixels', 1000, 8193, 'gallery', 'dimensions'],
    ['more than 40 megapixels', 7000, 7000, 'gallery', 'dimensions'],
    ['poster narrower than 2:3', 799, 1200, 'poster', 'posterRatio'],
    ['poster wider than 4:5', 801, 1000, 'poster', 'posterRatio'],
  ] as const)(
    'rejects %s with a specific reason',
    (_scenario, width, height, mediaKind, reason) => {
      expect(validateWorkMediaDimensions({ height, mediaKind, width })).toEqual({
        isValid: false,
        reason,
      });
    },
  );
});
