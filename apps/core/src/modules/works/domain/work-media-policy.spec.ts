import { evaluateWorkMedia } from './work-media-policy';

describe('Work media policy', () => {
  it.each([
    [800, 1200],
    [800, 1000],
  ])('accepts Poster ratio boundary %d:%d', (width, height) => {
    expect(evaluateWorkMedia(validInput({ height, width }))).toMatchObject({ isValid: true });
  });

  it('computes a no-upscale master, exact eligible variants, and the Poster width warning', () => {
    expect(evaluateWorkMedia(validInput({ height: 1200, width: 900 }))).toEqual({
      isValid: true,
      master: { height: 1200, width: 900 },
      variantWidths: [480, 768],
      warnings: ['poster_width_below_recommended'],
    });
    expect(
      evaluateWorkMedia(validInput({ height: 2000, mediaKind: 'gallery', width: 4000 })),
    ).toEqual({
      isValid: true,
      master: { height: 1280, width: 2560 },
      variantWidths: [640, 1280, 1920],
      warnings: [],
    });
  });

  it.each([
    ['MIME spoof', { decodedContentType: 'image/png' as const }],
    ['extension spoof', { declaredExtension: 'png' as const }],
    ['animated media', { pages: 2 }],
    ['too narrow', { width: 319 }],
    ['too tall', { height: 8193 }],
    ['decompression limit', { height: 7000, width: 7000 }],
    ['Poster landscape', { height: 1000, width: 1200 }],
    ['Poster ratio below 2:3', { height: 1200, width: 799 }],
    ['Poster ratio above 4:5', { height: 1000, width: 801 }],
  ])('rejects %s', (_scenario, override) => {
    expect(evaluateWorkMedia(validInput(override))).toEqual({ isValid: false });
  });
});

function validInput(
  override: Partial<Parameters<typeof evaluateWorkMedia>[0]> = {},
): Parameters<typeof evaluateWorkMedia>[0] {
  return {
    declaredContentType: 'image/jpeg',
    declaredExtension: 'jpg',
    decodedContentType: 'image/jpeg',
    height: 1600,
    mediaKind: 'poster',
    pages: 1,
    width: 1200,
    ...override,
  };
}
