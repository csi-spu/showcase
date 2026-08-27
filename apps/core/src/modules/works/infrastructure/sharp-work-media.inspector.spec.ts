import sharp from 'sharp';
import { WorkMediaError } from '../application/work-media.service';
import { SharpWorkMediaInspector } from './sharp-work-media.inspector';

describe('SharpWorkMediaInspector', () => {
  const inspector = new SharpWorkMediaInspector();

  it('creates sanitized WebP master and exact eligible Poster variants without enlarging', async () => {
    const source = await sharp({
      create: {
        background: { alpha: 1, b: 120, g: 80, r: 40 },
        channels: 4,
        height: 1600,
        width: 1200,
      },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'private metadata' } } })
      .toBuffer();

    const result = await inspector.inspectAndProcess({
      bytes: source,
      declaredByteSize: source.byteLength,
      declaredContentType: 'image/jpeg',
      declaredExtension: 'jpg',
      mediaKind: 'poster',
    });

    expect(result).toMatchObject({ contentType: 'image/webp', height: 1600, width: 1200 });
    expect(result.variants.map((variant) => variant.width)).toEqual([480, 768, 1200]);
    await expect(sharp(result.bytes).metadata()).resolves.toMatchObject({
      format: 'webp',
      space: 'srgb',
    });
    expect(result.bytes.toString()).not.toContain('private metadata');
  }, 30_000);

  it('limits the sanitized master by its longest edge and warns for a narrow Poster', async () => {
    const source = await sharp({
      create: {
        background: { b: 120, g: 80, r: 40 },
        channels: 3,
        height: 2561,
        width: 400,
      },
    })
      .jpeg()
      .toBuffer();

    const result = await inspector.inspectAndProcess({
      bytes: source,
      declaredByteSize: source.byteLength,
      declaredContentType: 'image/jpeg',
      declaredExtension: 'jpeg',
      mediaKind: 'gallery',
    });

    expect(result).toMatchObject({ height: 2560, warnings: [], width: 400 });

    const narrowPoster = await sharp({
      create: {
        background: { b: 120, g: 80, r: 40 },
        channels: 3,
        height: 1200,
        width: 900,
      },
    })
      .jpeg()
      .toBuffer();
    await expect(
      inspector.inspectAndProcess({
        bytes: narrowPoster,
        declaredByteSize: narrowPoster.byteLength,
        declaredContentType: 'image/jpeg',
        declaredExtension: 'jpg',
        mediaKind: 'poster',
      }),
    ).resolves.toMatchObject({ warnings: ['poster_width_below_recommended'] });
  }, 30_000);

  it('rejects animated WebP input', async () => {
    const first = await sharp({
      create: { background: 'red', channels: 4, height: 400, width: 400 },
    })
      .png()
      .toBuffer();
    const second = await sharp({
      create: { background: 'blue', channels: 4, height: 400, width: 400 },
    })
      .png()
      .toBuffer();
    const animated = await sharp([first, second], { join: { animated: true } })
      .webp({ delay: [100, 100], loop: 0 })
      .toBuffer();

    await expect(
      inspector.inspectAndProcess({
        bytes: animated,
        declaredByteSize: animated.byteLength,
        declaredContentType: 'image/webp',
        declaredExtension: 'webp',
        mediaKind: 'gallery',
      }),
    ).rejects.toEqual(new WorkMediaError('INVALID_WORK_MEDIA', 422));
  });

  it.each([
    ['declared MIME spoof', 'image/png' as const, 'png' as const, 1200, 1600, 'poster' as const],
    [
      'declared extension spoof',
      'image/jpeg' as const,
      'png' as const,
      1200,
      1600,
      'poster' as const,
    ],
    ['poster landscape', 'image/jpeg' as const, 'jpg' as const, 1600, 1200, 'poster' as const],
    [
      'dimension below the trusted minimum',
      'image/jpeg' as const,
      'jpeg' as const,
      319,
      600,
      'gallery' as const,
    ],
  ])(
    'rejects %s',
    async (_scenario, declaredContentType, declaredExtension, width, height, mediaKind) => {
      const source = await sharp({
        create: { background: { b: 120, g: 80, r: 40 }, channels: 3, height, width },
      })
        .jpeg()
        .toBuffer();

      await expect(
        inspector.inspectAndProcess({
          bytes: source,
          declaredByteSize: source.byteLength,
          declaredContentType,
          declaredExtension,
          mediaKind,
        }),
      ).rejects.toEqual(new WorkMediaError('INVALID_WORK_MEDIA', 422));
    },
  );
});
