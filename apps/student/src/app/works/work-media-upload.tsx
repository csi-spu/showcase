'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { validateWorkMediaFile } from '@/lib/student-work-media';
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

export function WorkMediaUpload({
  expectedVersion,
  mediaKind,
  publicId,
}: {
  expectedVersion: number;
  mediaKind: 'gallery' | 'poster';
  publicId: string;
}) {
  const router = useRouter();
  const t = useTranslations('Work.media');
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [assetId, setAssetId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [hasPosterWidthWarning, setHasPosterWidthWarning] = useState(false);
  const [errorKey, setErrorKey] = useState<'invalid' | 'processFailed' | 'uploadFailed' | null>(
    null,
  );

  useEffect(() => {
    if (assetId === null || status !== 'processing') return;
    let isCancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    const poll = async (): Promise<void> => {
      attempts += 1;
      const result = await getWorkMediaStatusAction({ assetId, publicId });
      if (isCancelled) return;
      if ('error' in result || result.status === 'rejected' || attempts >= MAX_POLL_ATTEMPTS) {
        setErrorKey('processFailed');
        setStatus('error');
        return;
      }
      if (result.status !== 'ready' || result.preview === null) {
        timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MILLISECONDS);
        return;
      }
      setPreview(result.preview);
      setHasPosterWidthWarning(result.warnings.includes('poster_width_below_recommended'));
      const attached = await attachWorkMediaAction({
        assetId,
        expectedVersion,
        mediaKind,
        publicId,
      });
      if (isCancelled) return;
      if ('error' in attached) {
        setErrorKey('processFailed');
        setStatus('error');
        return;
      }
      setStatus('ready');
      router.refresh();
    };

    void poll();
    return () => {
      isCancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [assetId, expectedVersion, mediaKind, publicId, router, status]);

  async function upload(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    const validation = validateWorkMediaFile(file);
    if (!validation.isValid) {
      setErrorKey('invalid');
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
    <section
      aria-labelledby={headingId}
      className="rounded-surface border border-border bg-card p-6 sm:p-8"
    >
      <h2 className="text-lg font-semibold" id={headingId}>
        {t(mediaKind === 'poster' ? 'posterHeading' : 'galleryHeading')}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(mediaKind === 'poster' ? 'posterHelp' : 'galleryHelp')}
      </p>
      <label className="mt-4 block" htmlFor={`work-${mediaKind}-upload`}>
        <span className="sr-only">
          {t(mediaKind === 'poster' ? 'choosePoster' : 'chooseGallery')}
        </span>
        <input
          accept=".jpeg,.jpg,.png,.webp,image/jpeg,image/png,image/webp"
          className="block min-h-11 w-full text-sm file:mr-4 file:min-h-11 file:rounded-control file:border file:border-input file:bg-background file:px-4 file:font-medium"
          disabled={isBusy}
          id={`work-${mediaKind}-upload`}
          onChange={(event) => void upload(event.currentTarget.files?.[0])}
          type="file"
        />
      </label>
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
          <p className="mt-3 text-sm text-destructive">{t(errorKey)}</p>
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
    </section>
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
