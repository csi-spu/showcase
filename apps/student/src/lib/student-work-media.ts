export const MAX_WORK_MEDIA_BYTES = 5 * 1_024 * 1_024;
export const WORK_MEDIA_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type WorkMediaContentType = (typeof WORK_MEDIA_CONTENT_TYPES)[number];
export type WorkMediaExtension = 'jpeg' | 'jpg' | 'png' | 'webp';

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

function isWorkMediaExtension(value: string): value is WorkMediaExtension {
  return value === 'jpeg' || value === 'jpg' || value === 'png' || value === 'webp';
}
