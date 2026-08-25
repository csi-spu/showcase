import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type {
  ProcessedWorkMedia,
  WorkMediaContentType,
  WorkMediaExtension,
  WorkMediaInspector,
  WorkMediaKind,
  WorkMediaVariant,
} from '../application/work-media.ports';
import { WorkMediaError } from '../application/work-media.service';
import { evaluateWorkMedia } from '../domain/work-media-policy';

const MAX_MEDIA_BYTES = 5 * 1_024 * 1_024;
const MAX_PIXELS = 40_000_000;
const MAX_MASTER_LONG_EDGE = 2_560;
const PROCESSING_TIMEOUT_SECONDS = 15;
const CONTENT_TYPE_BY_FORMAT: Partial<Record<string, WorkMediaContentType>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

@Injectable()
export class SharpWorkMediaInspector implements WorkMediaInspector {
  async inspectAndProcess(input: {
    bytes: Buffer;
    declaredByteSize: number;
    declaredContentType: WorkMediaContentType;
    declaredExtension: WorkMediaExtension;
    mediaKind: WorkMediaKind;
  }): Promise<ProcessedWorkMedia> {
    if (
      input.bytes.byteLength !== input.declaredByteSize ||
      input.bytes.byteLength <= 0 ||
      input.bytes.byteLength > MAX_MEDIA_BYTES
    ) {
      throw this.invalid();
    }
    try {
      const original = sharp(input.bytes, {
        failOn: 'warning',
        limitInputPixels: MAX_PIXELS,
        sequentialRead: true,
      }).timeout({ seconds: PROCESSING_TIMEOUT_SECONDS });
      const metadata = await original.metadata();
      const format =
        metadata.format === undefined ? undefined : CONTENT_TYPE_BY_FORMAT[metadata.format];
      if (
        format === undefined ||
        metadata.width === undefined ||
        metadata.height === undefined ||
        (metadata.pages ?? 1) < 1
      ) {
        throw this.invalid();
      }
      const oriented = await original.autoOrient().toBuffer();
      const orientedMetadata = await sharp(oriented, {
        failOn: 'warning',
        limitInputPixels: MAX_PIXELS,
      })
        .timeout({ seconds: PROCESSING_TIMEOUT_SECONDS })
        .metadata();
      const width = orientedMetadata.width;
      const height = orientedMetadata.height;
      if (width === undefined || height === undefined) {
        throw this.invalid();
      }
      const evaluation = evaluateWorkMedia({
        declaredContentType: input.declaredContentType,
        declaredExtension: input.declaredExtension,
        decodedContentType: format,
        height,
        mediaKind: input.mediaKind,
        pages: metadata.pages ?? 1,
        width,
      });
      if (!evaluation.isValid) throw this.invalid();
      const hasAlpha = orientedMetadata.hasAlpha === true;
      const master = await this.toWebp(oriented, MAX_MASTER_LONG_EDGE, hasAlpha);
      const masterMetadata = await sharp(master)
        .timeout({ seconds: PROCESSING_TIMEOUT_SECONDS })
        .metadata();
      if (masterMetadata.width === undefined || masterMetadata.height === undefined)
        throw this.invalid();
      const variants = await this.createVariants(
        oriented,
        masterMetadata.width,
        hasAlpha,
        evaluation.variantWidths,
      );
      return {
        byteSize: master.byteLength,
        bytes: master,
        contentHash: hash(master),
        contentType: 'image/webp',
        dominantColor: await dominantColor(master),
        height: masterMetadata.height,
        variants,
        warnings: evaluation.warnings,
        width: masterMetadata.width,
      };
    } catch (error: unknown) {
      if (error instanceof WorkMediaError) throw error;
      throw this.invalid();
    }
  }

  private async createVariants(
    bytes: Buffer,
    masterWidth: number,
    hasAlpha: boolean,
    variantWidths: number[],
  ): Promise<WorkMediaVariant[]> {
    const variants: WorkMediaVariant[] = [];
    for (const width of variantWidths) {
      if (width > masterWidth) continue;
      const variant = await this.toWebp(bytes, width, hasAlpha);
      const metadata = await sharp(variant)
        .timeout({ seconds: PROCESSING_TIMEOUT_SECONDS })
        .metadata();
      if (metadata.width === undefined || metadata.height === undefined) throw this.invalid();
      variants.push({
        byteSize: variant.byteLength,
        bytes: variant,
        contentHash: hash(variant),
        height: metadata.height,
        width: metadata.width,
      });
    }
    return variants;
  }

  private toWebp(bytes: Buffer, width: number, hasAlpha: boolean): Promise<Buffer> {
    return sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_PIXELS, sequentialRead: true })
      .autoOrient()
      .resize({
        fit: 'inside',
        height: width === MAX_MASTER_LONG_EDGE ? width : undefined,
        width,
        withoutEnlargement: true,
      })
      .toColourspace('srgb')
      .webp(hasAlpha ? { effort: 4, lossless: true } : { effort: 4, quality: 85 })
      .timeout({ seconds: PROCESSING_TIMEOUT_SECONDS })
      .toBuffer();
  }

  private invalid(): WorkMediaError {
    return new WorkMediaError('INVALID_WORK_MEDIA', 422);
  }
}

function hash(bytes: Buffer): Buffer {
  return createHash('sha256').update(bytes).digest();
}

async function dominantColor(bytes: Buffer): Promise<string> {
  const raw = await sharp(bytes)
    .resize(1, 1, { fit: 'fill' })
    .raw()
    .timeout({ seconds: PROCESSING_TIMEOUT_SECONDS })
    .toBuffer();
  return `#${raw[0]!.toString(16).padStart(2, '0')}${raw[1]!.toString(16).padStart(2, '0')}${raw[2]!.toString(16).padStart(2, '0')}`.toUpperCase();
}
