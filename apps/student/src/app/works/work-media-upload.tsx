'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { UploadIcon } from 'lucide-react';
import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription } from '@/components/ui/field';
import {
  type WorkMediaContentType,
  type WorkMediaExtension,
  readWorkMediaDimensions,
  validateWorkMediaDimensions,
  validateWorkMediaFile,
} from '@/lib/student-work-media';
import type { WorkDraft } from '@/lib/student-works-core';
import { WorkMediaCropper, type WorkMediaCropResult } from './work-media-cropper';
import {
  attachWorkMediaAction,
  finalizeWorkMediaAction,
  getWorkMediaStatusAction,
  uploadWorkMediaAction,
} from './work.actions';

const POLL_INTERVAL_MILLISECONDS = 2_000;
const MAX_POLL_ATTEMPTS = 60;
const MIN_CROPPABLE_DIMENSION = 320;
const POSTER_CROP_ASPECT_RATIO = 3 / 4;

type UploadStatus = 'error' | 'idle' | 'processing' | 'ready' | 'uploading';
type Preview = { assetId: string; height: number; url: string; width: number };
type ValidatedFile = {
  contentType: WorkMediaContentType;
  extension: WorkMediaExtension;
};
type UploadErrorKey =
  | 'decodeFailed'
  | 'dimensions'
  | 'invalid'
  | 'invalidMedia'
  | 'posterRatio'
  | 'processFailed'
  | 'uploadFailed';

export function WorkMediaUpload({
  expectedVersion,
  media,
  mediaKind,
  onVersion,
  publicId,
}: {
  expectedVersion: number;
  media: WorkDraft['media'];
  mediaKind: 'gallery' | 'poster';
  onVersion: (version: number) => void;
  publicId: string;
}) {
  const router = useRouter();
  const t = useTranslations('Work.media');
  const requirementT = useTranslations('Work.requirement');
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [cropCandidate, setCropCandidate] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [hasPosterWidthWarning, setHasPosterWidthWarning] = useState(false);
  const [errorKey, setErrorKey] = useState<UploadErrorKey | null>(null);
  const [selectedDimensions, setSelectedDimensions] = useState<{
    height: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    const readyMedia = media.filter((item) => item.status === 'ready');
    if (readyMedia.length === 0) return;
    let isCancelled = false;
    const loadPreviews = async () => {
      const results = await Promise.all(
        readyMedia.map((item) => getWorkMediaStatusAction({ assetId: item.assetId, publicId })),
      );
      if (isCancelled) return;
      const loaded = results.flatMap((result) =>
        'error' in result || result.preview === null
          ? []
          : [{ ...result.preview, assetId: result.assetId }],
      );
      setPreviews((current) => {
        const currentAssetIds = new Set(current.map((item) => item.assetId));
        const merged = [...loaded.filter((item) => !currentAssetIds.has(item.assetId)), ...current];
        return mediaKind === 'poster' ? merged.slice(-1) : merged.slice(0, 3);
      });
    };
    void loadPreviews();
    return () => {
      isCancelled = true;
    };
  }, [media, mediaKind, publicId]);

  async function upload(file: File, uploadVersion: number): Promise<number | null> {
    setSelectedFileName(file.name);
    const validation = validateWorkMediaFile(file);
    if (!validation.isValid) {
      setErrorKey('invalid');
      setStatus('error');
      return null;
    }
    let dimensions: { height: number; width: number };
    try {
      dimensions = await readWorkMediaDimensions(file);
    } catch {
      setErrorKey('decodeFailed');
      setStatus('error');
      return null;
    }
    setSelectedDimensions(dimensions);
    const dimensionValidation = validateWorkMediaDimensions({ ...dimensions, mediaKind });
    if (!dimensionValidation.isValid) {
      if (
        dimensions.width >= MIN_CROPPABLE_DIMENSION &&
        dimensions.height >= MIN_CROPPABLE_DIMENSION
      ) {
        setCropCandidate(file);
        setErrorKey(null);
        setStatus('idle');
        return null;
      }
      setErrorKey(dimensionValidation.reason);
      setStatus('error');
      return null;
    }
    return uploadPreparedFile(file, validation, dimensions, uploadVersion);
  }

  async function uploadCroppedMedia(result: WorkMediaCropResult): Promise<void> {
    const sourceName = cropCandidate?.name.replace(/\.[^.]+$/u, '') ?? 'poster';
    const file = new File([result.blob], `${sourceName}-cropped.jpg`, {
      lastModified: cropCandidate?.lastModified ?? 0,
      type: 'image/jpeg',
    });
    setCropCandidate(null);
    setSelectedFileName(file.name);
    setSelectedDimensions({ height: result.height, width: result.width });
    const validation = validateWorkMediaFile(file);
    const dimensionValidation = validateWorkMediaDimensions({
      height: result.height,
      mediaKind,
      width: result.width,
    });
    if (!validation.isValid) {
      setErrorKey('invalid');
      setStatus('error');
      return;
    }
    if (!dimensionValidation.isValid) {
      setErrorKey(dimensionValidation.reason);
      setStatus('error');
      return;
    }
    await uploadPreparedFile(
      file,
      validation,
      { height: result.height, width: result.width },
      expectedVersion,
    );
  }

  async function uploadPreparedFile(
    file: File,
    validation: ValidatedFile,
    dimensions: { height: number; width: number },
    uploadVersion: number,
  ): Promise<number | null> {
    setSelectedDimensions(dimensions);
    setErrorKey(null);
    if (mediaKind === 'poster') setPreviews([]);
    setHasPosterWidthWarning(false);
    setProgress(0);
    setStatus('uploading');
    const authorization = await uploadWorkMediaAction({
      byteSize: file.size,
      contentType: validation.contentType,
      fileExtension: validation.extension,
      idempotencyKey: crypto.randomUUID(),
      mediaKind,
      publicId,
    });
    if ('error' in authorization) {
      setErrorKey('uploadFailed');
      setStatus('error');
      return null;
    }
    const attached = await attachWorkMediaAction({
      assetId: authorization.assetId,
      expectedVersion: uploadVersion,
      idempotencyKey: crypto.randomUUID(),
      mediaKind,
      publicId,
    });
    if ('error' in attached) {
      setErrorKey('processFailed');
      setStatus('error');
      return null;
    }
    onVersion(attached.version);
    try {
      await putFileWithProgress(authorization.uploadUrl, authorization.headers, file, setProgress);
    } catch {
      setErrorKey('uploadFailed');
      setStatus('error');
      return null;
    }
    const finalized = await finalizeWorkMediaAction({ assetId: authorization.assetId, publicId });
    if ('error' in finalized) {
      setErrorKey('processFailed');
      setStatus('error');
      return null;
    }
    setStatus('processing');
    const processed = await pollProcessedMedia(authorization.assetId, publicId);
    if (processed === null) {
      setErrorKey('processFailed');
      setStatus('error');
      return null;
    }
    if (processed.status === 'rejected') {
      setErrorKey(processed.errorKey);
      setStatus('error');
      return null;
    }
    const nextPreview = { ...processed.preview, assetId: authorization.assetId };
    setPreviews((current) => {
      if (mediaKind === 'poster') return [nextPreview];
      if (current.some((item) => item.assetId === nextPreview.assetId)) return current;
      return [...current, nextPreview];
    });
    setHasPosterWidthWarning(processed.hasPosterWidthWarning);
    setStatus('ready');
    router.refresh();
    return attached.version;
  }

  const uploadSelectedFiles = async (files: File[]) => {
    let uploadVersion = expectedVersion;
    for (const file of files) {
      const nextVersion = await upload(file, uploadVersion);
      if (nextVersion === null) return;
      uploadVersion = nextVersion;
    }
  };

  const headingId = `work-${mediaKind}-upload-heading`;
  const isBusy = status === 'uploading' || status === 'processing';
  const attachedAssetIds = new Set([
    ...media.map((item) => item.assetId),
    ...previews.map((item) => item.assetId),
  ]);
  const attachedMediaCount = attachedAssetIds.size;
  const isGalleryFull = mediaKind === 'gallery' && attachedMediaCount >= 3;
  const isInputDisabled = isBusy || isGalleryFull;
  return (
    <>
      <Card aria-labelledby={headingId}>
        <CardHeader>
          <CardTitle>
            <h2 className="flex flex-wrap items-center gap-2 text-lg" id={headingId}>
              <span>{t(mediaKind === 'poster' ? 'posterHeading' : 'galleryHeading')}</span>
              <Badge variant={mediaKind === 'poster' ? 'destructive' : 'outline'}>
                {requirementT(mediaKind === 'poster' ? 'required' : 'optional')}
              </Badge>
            </h2>
          </CardTitle>
          <CardDescription>
            {t(mediaKind === 'poster' ? 'posterHelp' : 'galleryHelp')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field className="-m-1 rounded-control p-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background">
            <input
              accept=".jpeg,.jpg,.png,.webp,image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={isInputDisabled}
              id={`work-${mediaKind}-upload`}
              onChange={(event) => {
                const selectedFiles = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                const remainingSlots = mediaKind === 'gallery' ? 3 - attachedMediaCount : 1;
                void uploadSelectedFiles(selectedFiles.slice(0, remainingSlots));
              }}
              multiple={mediaKind === 'gallery'}
              type="file"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label
                aria-disabled={isInputDisabled}
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  isInputDisabled && 'pointer-events-none bg-disabled text-disabled-foreground',
                )}
                htmlFor={`work-${mediaKind}-upload`}
              >
                <UploadIcon aria-hidden="true" data-icon="inline-start" />
                {t(mediaKind === 'poster' ? 'choosePoster' : 'chooseGallery')}
              </label>
              <FieldDescription className="m-0 break-all">
                {selectedFileName ?? t('noFileSelected')}
              </FieldDescription>
            </div>
          </Field>
          {mediaKind === 'gallery' ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t('galleryProgress', { count: attachedMediaCount })}
            </p>
          ) : null}
          <div aria-live="polite">
            {status === 'uploading' ? (
              <div className="mt-3">
                <p className="text-sm">{t('uploading', { progress })}</p>
                <progress
                  aria-label={t('progressLabel')}
                  className="mt-2 h-2 w-full accent-primary"
                  max={100}
                  value={progress}
                />
              </div>
            ) : null}
            {status === 'processing' ? <p className="mt-3 text-sm">{t('processing')}</p> : null}
            {status === 'ready' ? <p className="mt-3 text-sm text-success">{t('ready')}</p> : null}
            {status === 'ready' && hasPosterWidthWarning ? (
              <p className="mt-3 text-sm text-warning">{t('posterWidthWarning')}</p>
            ) : null}
            {status === 'error' && errorKey !== null ? (
              <p className="mt-3 text-sm text-destructive">
                {t(errorKey, selectedDimensions ?? undefined)}
              </p>
            ) : null}
          </div>
          {previews.length === 0 ? null : (
            <div className={cn(mediaKind === 'gallery' && 'grid grid-cols-2 gap-3 sm:grid-cols-3')}>
              {previews.map((preview) => (
                <div
                  className={cn(
                    'mx-auto mt-4 flex w-full items-center justify-center overflow-hidden rounded-media border border-border bg-muted p-3',
                    mediaKind === 'poster' ? 'max-w-64' : 'max-w-md',
                  )}
                  key={preview.assetId}
                >
                  <Image
                    alt={t(mediaKind === 'poster' ? 'posterPreview' : 'galleryPreview')}
                    className={cn(
                      'h-auto w-auto max-w-full object-contain',
                      mediaKind === 'poster' ? 'max-h-80' : 'max-h-64',
                    )}
                    height={preview.height}
                    loader={({ src }) => src}
                    sizes={
                      mediaKind === 'poster' ? '256px' : '(max-width: 1024px) 50vw, 160px'
                    }
                    src={preview.url}
                    unoptimized
                    width={preview.width}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {cropCandidate === null ? null : (
        <WorkMediaCropper
          {...(mediaKind === 'poster' ? { aspectRatio: POSTER_CROP_ASPECT_RATIO } : {})}
          cancelLabel={t('cropCancel')}
          confirmLabel={t('cropConfirm')}
          description={t(
            mediaKind === 'poster' ? 'cropPosterDescription' : 'cropGalleryDescription',
          )}
          errorLabel={t('cropLoadFailed')}
          file={cropCandidate}
          loadingLabel={t('cropLoading')}
          onCancel={() => setCropCandidate(null)}
          onCrop={uploadCroppedMedia}
          title={t(mediaKind === 'poster' ? 'cropPosterTitle' : 'cropGalleryTitle')}
        />
      )}
    </>
  );
}

function putFileWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.timeout = 60_000;
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error('WORK_MEDIA_UPLOAD_FAILED'));
    });
    request.addEventListener('error', () => reject(new Error('WORK_MEDIA_UPLOAD_FAILED')));
    request.addEventListener('abort', () => reject(new Error('WORK_MEDIA_UPLOAD_ABORTED')));
    request.addEventListener('timeout', () => reject(new Error('WORK_MEDIA_UPLOAD_TIMEOUT')));
    request.send(file);
  });
}

async function pollProcessedMedia(
  assetId: string,
  publicId: string,
): Promise<
  | null
  | {
      errorKey: 'invalidMedia' | 'processFailed';
      status: 'rejected';
    }
  | {
      hasPosterWidthWarning: boolean;
      preview: { height: number; url: string; width: number };
      status: 'ready';
    }
> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const result = await getWorkMediaStatusAction({ assetId, publicId });
    if ('error' in result) return null;
    if (result.status === 'rejected') {
      return {
        errorKey: result.rejectionCode === 'invalid_media' ? 'invalidMedia' : 'processFailed',
        status: 'rejected',
      };
    }
    if (result.status === 'ready' && result.preview !== null) {
      return {
        hasPosterWidthWarning: result.warnings.includes('poster_width_below_recommended'),
        preview: result.preview,
        status: 'ready',
      };
    }
    await waitForNextPoll();
  }
  return null;
}

function waitForNextPoll(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MILLISECONDS));
}
