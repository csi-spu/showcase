import { describe, expect, it } from 'vitest';
import { validateWorkMediaFile } from './student-work-media';

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
