import type {
  WorkMediaContentType,
  WorkMediaExtension,
  WorkMediaKind,
  WorkMediaWarning,
} from '../application/work-media.ports';

const MIN_DIMENSION = 320;
const MAX_DIMENSION = 8_192;
const MAX_PIXELS = 40_000_000;
const MAX_MASTER_LONG_EDGE = 2_560;
const VARIANT_WIDTHS: Record<WorkMediaKind, number[]> = {
  gallery: [640, 1_280, 1_920],
  poster: [480, 768, 1_200],
};
const CONTENT_TYPE_BY_EXTENSION: Record<WorkMediaExtension, WorkMediaContentType> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export type WorkMediaPolicyEvaluation =
  | { isValid: false }
  | {
      isValid: true;
      master: { height: number; width: number };
      variantWidths: number[];
      warnings: WorkMediaWarning[];
    };

export function evaluateWorkMedia(input: {
  declaredContentType: WorkMediaContentType;
  declaredExtension: WorkMediaExtension;
  decodedContentType: WorkMediaContentType;
  height: number;
  mediaKind: WorkMediaKind;
  pages: number;
  width: number;
}): WorkMediaPolicyEvaluation {
  const ratio = input.width / input.height;
  if (
    CONTENT_TYPE_BY_EXTENSION[input.declaredExtension] !== input.declaredContentType ||
    input.decodedContentType !== input.declaredContentType ||
    input.pages !== 1 ||
    input.width < MIN_DIMENSION ||
    input.width > MAX_DIMENSION ||
    input.height < MIN_DIMENSION ||
    input.height > MAX_DIMENSION ||
    input.width * input.height > MAX_PIXELS ||
    (input.mediaKind === 'poster' && (ratio < 2 / 3 || ratio > 4 / 5))
  ) {
    return { isValid: false };
  }

  const scale = Math.min(1, MAX_MASTER_LONG_EDGE / Math.max(input.width, input.height));
  const master = {
    height: Math.round(input.height * scale),
    width: Math.round(input.width * scale),
  };
  return {
    isValid: true,
    master,
    variantWidths: VARIANT_WIDTHS[input.mediaKind].filter((width) => width <= master.width),
    warnings:
      input.mediaKind === 'poster' && input.width < 1_200 ? ['poster_width_below_recommended'] : [],
  };
}
