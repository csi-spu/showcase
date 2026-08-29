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
  readWorkMediaDimensions,
  validateWorkMediaDimensions,
  validateWorkMediaFile,
} from '@/lib/student-work-media';
import {
  attachWorkMediaAction,
  finalizeWorkMediaAction,
  getWorkMediaStatusAction,
  uploadWorkMediaAction,
} from './work.actions';

const POLL_INTERVAL_MILLISECONDS = 2_000;
const MAX_POLL_ATTEMPTS = 60;

type UploadStatus = 'error' | 'idle' | 'processing' | 'ready' | 'uploading';
type Preview = { height: number; url: string; width: number };
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
  mediaKind,
  onVersion,
  publicId,
}: {
  expectedVersion: number;
  mediaKind: 'gallery' | 'poster';
  onVersion: (version: number) => void;
  publicId: string;
}) {
  const router = useRouter();
  const t = useTranslations('Work.media');
  const requirementT = useTranslations('Work.requirement');
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [assetId, setAssetId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [hasPosterWidthWarning, setHasPosterWidthWarning] = useState(false);
  const [errorKey, setErrorKey] = useState<UploadErrorKey | null>(null);
  const [selectedDimensions, setSelectedDimensions] = useState<{
    height: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    if (assetId === null || status !== 'processing') return;
    let isCancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    const poll = async (): Promise<void> => {
      attempts += 1;
      const result = await getWorkMediaStatusAction({ assetId, publicId });
      if (isCancelled) return;
      if ('error' in result || attempts >= MAX_POLL_ATTEMPTS) {
        setErrorKey('processFailed');
        setStatus('error');
        return;
      }
      if (result.status === 'rejected') {
        setErrorKey(result.rejectionCode === 'invalid_media' ? 'invalidMedia' : 'processFailed');
        setStatus('error');
        return;
      }
      if (result.status !== 'ready' || result.preview === null) {
        timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MILLISECONDS);
        return;
      }
      setPreview(result.preview);
      setHasPosterWidthWarning(result.warnings.includes('poster_width_below_recommended'));
      setStatus('ready');
      router.refresh();
    };

    void poll();
    return () => {
      isCancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [assetId, publicId, router, status]);

  async function upload(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    setSelectedFileName(file.name);
    const validation = validateWorkMediaFile(file);
    if (!validation.isValid) {
      setErrorKey('invalid');
      setStatus('error');
      return;
    }
    let dimensions: { height: number; width: number };
    try {
      dimensions = await readWorkMediaDimensions(file);
    } catch {
      setErrorKey('decodeFailed');
      setStatus('error');
      return;
    }
    setSelectedDimensions(dimensions);
    const dimensionValidation = validateWorkMediaDimensions({ ...dimensions, mediaKind });
    if (!dimensionValidation.isValid) {
      setErrorKey(dimensionValidation.reason);
      setStatus('error');
      return;
    }
    setErrorKey(null);
    setPreview(null);
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
      return;
    }
    const attached = await attachWorkMediaAction({
      assetId: authorization.assetId,
      expectedVersion,
      idempotencyKey: crypto.randomUUID(),
      mediaKind,
      publicId,
    });
    if ('error' in attached) {
      setErrorKey('processFailed');
      setStatus('error');
      return;
    }
    onVersion(attached.version);
    try {
      await putFileWithProgress(authorization.uploadUrl, authorization.headers, file, setProgress);
    } catch {
      setErrorKey('uploadFailed');
      setStatus('error');
      return;
    }
    const finalized = await finalizeWorkMediaAction({ assetId: authorization.assetId, publicId });
    if ('error' in finalized) {
      setErrorKey('processFailed');
      setStatus('error');
      return;
    }
    setAssetId(authorization.assetId);
    setStatus('processing');
  }

  const headingId = `work-${mediaKind}-upload-heading`;
  const isBusy = status === 'uploading' || status === 'processing';
  return (
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
            disabled={isBusy}
            id={`work-${mediaKind}-upload`}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              void upload(file);
            }}
            type="file"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label
              aria-disabled={isBusy}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                isBusy && 'pointer-events-none bg-disabled text-disabled-foreground',
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
        {preview === null ? null : (
          <div className="mt-4 overflow-hidden rounded-media border border-border bg-muted">
            <Image
              alt={t(mediaKind === 'poster' ? 'posterPreview' : 'galleryPreview')}
              className="h-auto w-full object-contain"
              height={preview.height}
              loader={({ src }) => src}
              sizes="(max-width: 768px) calc(100vw - 64px), 656px"
              src={preview.url}
              unoptimized
              width={preview.width}
            />
          </div>
        )}
      </CardContent>
    </Card>
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
