import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type {
  ProfilePhotoContentType,
  ProfilePhotoInspector,
  SanitizedProfilePhoto,
} from '../application/profile-photo.ports';
import { ProfilePhotoError } from '../application/profile-photo.service';

const MAX_PROFILE_PHOTO_BYTES = 2 * 1_024 * 1_024;
const MIN_DIMENSION = 512;
const MAX_DIMENSION = 4_096;
const MAX_SANITIZED_DIMENSION = 1_024;
const MAX_PIXELS = MAX_DIMENSION * MAX_DIMENSION;
const CONTENT_TYPE_BY_FORMAT: Partial<Record<string, ProfilePhotoContentType>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

@Injectable()
export class SharpProfilePhotoInspector implements ProfilePhotoInspector {
  async inspectAndSanitize(input: {
    bytes: Buffer;
    declaredByteSize: number;
    declaredContentType: ProfilePhotoContentType;
  }): Promise<SanitizedProfilePhoto> {
    if (
      input.bytes.byteLength !== input.declaredByteSize ||
      input.bytes.byteLength <= 0 ||
      input.bytes.byteLength > MAX_PROFILE_PHOTO_BYTES
    ) {
      throw this.invalid();
    }

    try {
      const metadata = await sharp(input.bytes, {
        failOn: 'warning',
        limitInputPixels: MAX_PIXELS,
        sequentialRead: true,
      }).metadata();
      const contentType = metadata.format ? CONTENT_TYPE_BY_FORMAT[metadata.format] : undefined;
      const width = metadata.width;
      const height = metadata.height;
      if (
        contentType === undefined ||
        contentType !== input.declaredContentType ||
        width === undefined ||
        height === undefined ||
        width !== height ||
        width < MIN_DIMENSION ||
        width > MAX_DIMENSION ||
        height < MIN_DIMENSION ||
        height > MAX_DIMENSION ||
        (metadata.pages ?? 1) !== 1
      ) {
        throw this.invalid();
      }

      const bytes = await sharp(input.bytes, {
        failOn: 'warning',
        limitInputPixels: MAX_PIXELS,
        sequentialRead: true,
      })
        .autoOrient()
        .resize({
          fit: 'inside',
          height: MAX_SANITIZED_DIMENSION,
          width: MAX_SANITIZED_DIMENSION,
          withoutEnlargement: true,
        })
        .toColourspace('srgb')
        .webp({ effort: 4, quality: 85 })
        .toBuffer();
      const sanitizedDimension = Math.min(width, MAX_SANITIZED_DIMENSION);
      return {
        byteSize: bytes.byteLength,
        bytes,
        contentType: 'image/webp',
        height: sanitizedDimension,
        width: sanitizedDimension,
      };
    } catch (error: unknown) {
      if (error instanceof ProfilePhotoError) {
        throw error;
      }
      throw this.invalid();
    }
  }

  private invalid(): ProfilePhotoError {
    return new ProfilePhotoError('INVALID_PROFILE_PHOTO', 422);
  }
}
