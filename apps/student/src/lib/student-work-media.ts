export const MAX_WORK_MEDIA_BYTES = 5 * 1_024 * 1_024;
export const WORK_MEDIA_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type WorkMediaContentType = (typeof WORK_MEDIA_CONTENT_TYPES)[number];
export type WorkMediaExtension = 'jpeg' | 'jpg' | 'png' | 'webp';
export type WorkMediaKind = 'gallery' | 'poster';

const MIN_WORK_MEDIA_DIMENSION = 320;
const MAX_WORK_MEDIA_DIMENSION = 8_192;
const MAX_WORK_MEDIA_PIXELS = 40_000_000;

const CONTENT_TYPE_BY_EXTENSION: Record<WorkMediaExtension, WorkMediaContentType> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function validateWorkMediaFile(input: {
  name: string;
  size: number;
  type: string;
}):
  | { contentType: WorkMediaContentType; extension: WorkMediaExtension; isValid: true }
  | { isValid: false } {
  const extension = input.name.split('.').at(-1)?.toLowerCase();
  if (
    extension === undefined ||
    !isWorkMediaExtension(extension) ||
    CONTENT_TYPE_BY_EXTENSION[extension] !== input.type ||
    !Number.isInteger(input.size) ||
    input.size <= 0 ||
    input.size > MAX_WORK_MEDIA_BYTES
  ) {
    return { isValid: false };
  }
  return { contentType: CONTENT_TYPE_BY_EXTENSION[extension], extension, isValid: true };
}

export function validateWorkMediaDimensions(input: {
  height: number;
  mediaKind: WorkMediaKind;
  width: number;
}): { isValid: true } | { isValid: false; reason: 'dimensions' | 'posterRatio' } {
  if (
    !Number.isInteger(input.width) ||
    !Number.isInteger(input.height) ||
    input.width < MIN_WORK_MEDIA_DIMENSION ||
    input.width > MAX_WORK_MEDIA_DIMENSION ||
    input.height < MIN_WORK_MEDIA_DIMENSION ||
    input.height > MAX_WORK_MEDIA_DIMENSION ||
    input.width * input.height > MAX_WORK_MEDIA_PIXELS
  ) {
    return { isValid: false, reason: 'dimensions' };
  }
  const ratio = input.width / input.height;
  if (input.mediaKind === 'poster' && (ratio < 2 / 3 || ratio > 4 / 5)) {
    return { isValid: false, reason: 'posterRatio' };
  }
  return { isValid: true };
}

export async function readWorkMediaDimensions(file: Blob): Promise<{
  height: number;
  width: number;
}> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      return { height: bitmap.height, width: bitmap.width };
    } finally {
      bitmap.close();
    }
  }
  return readWorkMediaDimensionsFromImage(file);
}

function readWorkMediaDimensionsFromImage(file: Blob): Promise<{ height: number; width: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const release = () => URL.revokeObjectURL(objectUrl);
    image.addEventListener(
      'load',
      () => {
        release();
        resolve({ height: image.naturalHeight, width: image.naturalWidth });
      },
      { once: true },
    );
    image.addEventListener(
      'error',
      () => {
        release();
        reject(new Error('WORK_MEDIA_DECODE_FAILED'));
      },
      { once: true },
    );
    image.src = objectUrl;
  });
}

function isWorkMediaExtension(value: string): value is WorkMediaExtension {
  return value === 'jpeg' || value === 'jpg' || value === 'png' || value === 'webp';
}
