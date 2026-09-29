'use client';

import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { DownloadIcon, FileIcon, ImageOffIcon } from 'lucide-react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { InstructorCollectionFile } from '@/lib/instructor-collection-forms-contract';
import { fileTypeLabel } from './answer-format';

const BYTES_PER_KILOBYTE = 1_024;
const BYTES_PER_MEGABYTE = 1_024 * 1_024;

const LINK_CLASS =
  'inline-flex items-center gap-1 rounded-control text-sm font-medium text-accent-foreground underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none';

/**
 * A Student's submitted files.
 *
 * A ready JPEG or PNG shows a thumbnail that opens a larger view; every file
 * states its type, size and inspection status, and only a file that passed
 * inspection offers a download. A preview that fails to load falls back to
 * the download link rather than a broken image.
 */
export function SubmittedFiles({ files }: { files: InstructorCollectionFile[] }) {
  const t = useTranslations('Forms');

  if (files.length === 0) return <>{t('review.noAnswer')}</>;

  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {files.map((file) => (
        <li key={file.id}>
          <SubmittedFile file={file} />
        </li>
      ))}
    </ul>
  );
}

function SubmittedFile({ file }: { file: InstructorCollectionFile }) {
  const t = useTranslations('Forms');
  const format = useFormatter();
  const [hasPreviewFailed, setHasPreviewFailed] = useState(false);
  const canPreview = file.status === 'ready' && file.isPreviewable === true && !hasPreviewFailed;
  const size =
    file.byteSize < BYTES_PER_MEGABYTE
      ? t('responses.files.kilobytes', {
          size: format.number(file.byteSize / BYTES_PER_KILOBYTE, { maximumFractionDigits: 1 }),
        })
      : t('responses.files.megabytes', {
          size: format.number(file.byteSize / BYTES_PER_MEGABYTE, { maximumFractionDigits: 1 }),
        });
  const details = [
    fileTypeLabel(file.originalFilename),
    size,
    t(`responses.files.status.${file.status}`),
  ].filter((part) => part !== null);

  return (
    <div className="flex items-center gap-3 rounded-surface border border-input bg-card p-2">
      {canPreview ? (
        <ImagePreview file={file} onError={() => setHasPreviewFailed(true)} />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-16 shrink-0 items-center justify-center rounded-control bg-muted text-muted-foreground"
        >
          {hasPreviewFailed ? <ImageOffIcon className="size-5" /> : <FileIcon className="size-5" />}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">
          {file.originalFilename}
        </span>
        <span className="text-xs text-muted-foreground">{details.join(' · ')}</span>
        {hasPreviewFailed ? (
          <span className="text-xs text-muted-foreground" role="status">
            {t('responses.files.previewFailed')}
          </span>
        ) : null}
        {file.status === 'ready' ? (
          <DownloadLink file={file} />
        ) : (
          <span className="text-xs text-muted-foreground">{t('review.fileNotReady')}</span>
        )}
      </div>
    </div>
  );
}

/*
 * The image is served by this app's own preview route, which checks the
 * session and forwards the bytes. It is `unoptimized` because the image
 * optimizer would fetch it without the Instructor's cookie.
 */
function ImagePreview({ file, onError }: { file: InstructorCollectionFile; onError: () => void }) {
  const t = useTranslations('Forms');
  const src = `/files/${file.id}/preview`;

  return (
    <Dialog>
      <DialogTrigger
        aria-label={t('responses.files.openPreview', { filename: file.originalFilename })}
        className="group/thumb relative size-16 shrink-0 cursor-zoom-in overflow-hidden rounded-control bg-muted outline-none transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:transition-none"
      >
        <Image
          alt=""
          className="object-cover transition-transform duration-300 group-hover/thumb:scale-110 motion-reduce:transition-none"
          fill
          onError={onError}
          sizes="64px"
          src={src}
          unoptimized
        />
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogTitle className="truncate">{file.originalFilename}</DialogTitle>
        <div className="relative h-[70vh] w-full overflow-hidden rounded-control bg-muted">
          <Image
            alt={file.originalFilename}
            className="object-contain"
            fill
            onError={onError}
            sizes="(min-width: 48rem) 48rem, 100vw"
            src={src}
            unoptimized
          />
        </div>
        <DialogFooter>
          <DownloadLink file={file} />
          <DialogClose render={<Button variant="outline">{t('responses.files.close')}</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DownloadLink({ file }: { file: InstructorCollectionFile }) {
  const t = useTranslations('Forms');
  return (
    <a
      className={cn(LINK_CLASS, 'self-start')}
      download={file.originalFilename}
      href={`/files/${file.id}/download`}
    >
      <DownloadIcon aria-hidden="true" className="size-3.5" />
      <span aria-hidden="true">{t('review.download')}</span>
      <span className="sr-only">
        {t('review.downloadLabel', { filename: file.originalFilename })}
      </span>
    </a>
  );
}
