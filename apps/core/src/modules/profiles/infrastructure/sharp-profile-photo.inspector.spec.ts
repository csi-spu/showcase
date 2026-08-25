import sharp from 'sharp';
import { ProfilePhotoError } from '../application/profile-photo.service';
import { SharpProfilePhotoInspector } from './sharp-profile-photo.inspector';

describe('SharpProfilePhotoInspector', () => {
  const inspector = new SharpProfilePhotoInspector();

  it('decodes a square image, strips metadata, converts to sRGB WebP, and reports trusted values', async () => {
    const source = await sharp({
      create: {
        background: { alpha: 1, b: 120, g: 80, r: 40 },
        channels: 4,
        height: 512,
        width: 512,
      },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'private metadata' } } })
      .toBuffer();

    const result = await inspector.inspectAndSanitize({
      bytes: source,
      declaredByteSize: source.byteLength,
      declaredContentType: 'image/jpeg',
    });
    const metadata = await sharp(result.bytes).metadata();

    expect(result).toMatchObject({
      byteSize: result.bytes.byteLength,
      contentType: 'image/webp',
      height: 512,
      width: 512,
    });
    expect(metadata).toMatchObject({ format: 'webp', height: 512, space: 'srgb', width: 512 });
    expect(metadata.exif).toBeUndefined();
    expect(result.bytes.toString()).not.toContain('private metadata');
  });

  it.each([
    ['content-type mismatch', { contentType: 'image/png' as const, height: 512, width: 512 }],
    ['non-square dimensions', { contentType: 'image/jpeg' as const, height: 513, width: 512 }],
    ['dimensions below 512', { contentType: 'image/jpeg' as const, height: 511, width: 511 }],
  ])('rejects %s', async (_scenario, input) => {
    const source = await sharp({
      create: {
        background: { b: 120, g: 80, r: 40 },
        channels: 3,
        height: input.height,
        width: input.width,
      },
    })
      .jpeg()
      .toBuffer();

    await expect(
      inspector.inspectAndSanitize({
        bytes: source,
        declaredByteSize: source.byteLength,
        declaredContentType: input.contentType,
      }),
    ).rejects.toEqual(new ProfilePhotoError('INVALID_PROFILE_PHOTO', 422));
  });

  it('rejects bytes whose authoritative size differs from the presigned declaration', async () => {
    const source = await sharp({
      create: {
        background: { b: 120, g: 80, r: 40 },
        channels: 3,
        height: 512,
        width: 512,
      },
    })
      .png()
      .toBuffer();

    await expect(
      inspector.inspectAndSanitize({
        bytes: source,
        declaredByteSize: source.byteLength + 1,
        declaredContentType: 'image/png',
      }),
    ).rejects.toEqual(new ProfilePhotoError('INVALID_PROFILE_PHOTO', 422));
  });

  it('bounds the sanitized display asset while accepting a larger valid source', async () => {
    const source = await sharp({
      create: {
        background: { b: 120, g: 80, r: 40 },
        channels: 3,
        height: 1_200,
        width: 1_200,
      },
    })
      .jpeg()
      .toBuffer();

    const result = await inspector.inspectAndSanitize({
      bytes: source,
      declaredByteSize: source.byteLength,
      declaredContentType: 'image/jpeg',
    });

    expect(result).toMatchObject({ height: 1_024, width: 1_024 });
    await expect(sharp(result.bytes).metadata()).resolves.toMatchObject({
      height: 1_024,
      width: 1_024,
    });
  });
});
