'use client';

import {
  AlertTriangleIcon,
  DownloadIcon,
  FileIcon,
  RotateCcwIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import {
  attachCollectionFileAction,
  createCollectionUploadAction,
  detachCollectionFileAction,
  finalizeCollectionUploadAction,
  retryCollectionUploadAction,
} from './collection-forms.actions';
import type { StudentFormsErrorMessage } from './collection-forms-errors';
import {
  COLLECTION_FILE_TYPES,
  MAX_FILE_BYTES,
  type StudentCollectionField,
  type StudentCollectionFile,
  type StudentCollectionFileStatus,
} from '@/lib/student-collection-forms-contract';
import { uploadFileBytes } from '@/lib/upload-file';

const CONTENT_TYPES: Record<(typeof COLLECTION_FILE_TYPES)[number], string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/*
 * How each stage of a file's life is described.
 *
 * Pending and inspection states are never shown as success. A file counts as an
 * accepted document only once an inspection has recorded `ready`, so the wording
 * and the tone both say "not yet", not "done".
 *
 * Sending the bytes successfully is not acceptance either. A sent file sits at
 * `quarantined` until Core has inspected it, and submitting it before then is
 * refused with FILE_NOT_READY. Nothing here may describe a file as received or
 * safe on the strength of the transfer alone.
 */
const STATUS_TONES: Record<StudentCollectionFileStatus, StatusTone> = {
  failed: 'destructive',
  inspecting: 'warning',
  pending_upload: 'warning',
  quarantined: 'warning',
  ready: 'success',
};

type LocalError = 'emptyFile' | 'tooLarge' | 'tooMany' | 'wrongType';

/** A file on its way to storage. It is not in `files` until the bytes arrive. */
interface UploadTicket {
  file: StudentCollectionFile;
  uploadUrl: string;
}

type Transfer =
  | { file: File; progress: number; state: 'sending'; ticket?: UploadTicket }
  | { file: File; progress: 0; state: 'failed'; ticket: UploadTicket };

/** A change Core accepted that the refreshed `files` has not shown yet. */
interface Settling {
  fileId: string;
  kind: 'attach' | 'detach';
}

export function FormFileField({
  field,
  files,
  formId,
  isReadOnly,
  onBusyChange,
  onChanged,
}: {
  field: StudentCollectionField;
  files: StudentCollectionFile[];
  formId: string;
  isReadOnly: boolean;
  /** Told whether this field's files are still changing, so a submit never reads them mid-change. */
  onBusyChange: (fieldId: string, isBusy: boolean) => void;
  onChanged: () => void;
}) {
  const t = useTranslations('Forms');
  const errorT = useTranslations('Forms.errors');
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<StudentFormsErrorMessage | null>(null);
  const [localError, setLocalError] = useState<LocalError | null>(null);
  /* The file being sent right now, kept so a failed send can be retried. */
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [settling, setSettling] = useState<Settling | null>(null);

  const allowedTypes = field.file?.allowedFileTypes ?? [];
  const maxFiles = field.file?.maxFiles ?? 1;
  const accept = allowedTypes.map((type) => CONTENT_TYPES[type]).join(',');
  const isFull = files.length >= maxFiles;
  /*
   * Core has the change, but `files` still comes from the page before it. The
   * field stays busy until the refreshed list shows the change, so nothing
   * reads a count that is about to move.
   */
  const isSettling =
    settling !== null &&
    files.some((file) => file.id === settling.fileId) === (settling.kind === 'detach');
  const isBusy = isPending || transfer?.state === 'sending' || isSettling;

  /* A transfer must not outlive the field that started it. */
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    onBusyChange(field.id, isBusy);
  }, [field.id, isBusy, onBusyChange]);

  function findLocalError(selected: File): LocalError | null {
    /* Checked here for a fast answer; Core checks all of it again before accepting. */
    if (files.length >= maxFiles) return 'tooMany';
    if (selected.size === 0) return 'emptyFile';
    if (selected.size > MAX_FILE_BYTES) return 'tooLarge';
    if (!allowedTypes.some((type) => CONTENT_TYPES[type] === selected.type)) return 'wrongType';
    return null;
  }

  function handleSelect(selected: File | undefined) {
    if (selected === undefined) return;
    setError(null);
    setLocalError(null);

    const invalid = findLocalError(selected);
    if (invalid !== null) {
      setLocalError(invalid);
      return;
    }
    void send(selected);
  }

  /**
   * Registers the file, sends the bytes, then attaches it to the draft.
   *
   * The file is attached only after the bytes are actually sent. A failed
   * transfer leaves nothing attached, so the Student never sees a document
   * listed that storage never received.
   */
  async function send(selected: File, retryTicket?: UploadTicket) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTransfer(
      retryTicket === undefined
        ? { file: selected, progress: 0, state: 'sending' }
        : { file: selected, progress: 0, state: 'sending', ticket: retryTicket },
    );

    let ticket = retryTicket;
    if (retryTicket !== undefined) {
      const refreshed = await retryCollectionUploadAction(formId, retryTicket.file.id);
      if (refreshed.error !== null || refreshed.uploadUrl === null) {
        setTransfer({ file: selected, progress: 0, state: 'failed', ticket: retryTicket });
        setError(refreshed.error ?? 'unavailable');
        return;
      }
      ticket = { ...retryTicket, uploadUrl: refreshed.uploadUrl };
    }
    if (ticket === undefined) {
      const created = await createCollectionUploadAction(formId, {
        byteSize: selected.size,
        declaredContentType: selected.type,
        fieldId: field.id,
        filename: selected.name,
      });
      const { file: registered, uploadUrl } = created;
      if (created.error !== null || registered === null || uploadUrl === null) {
        setTransfer(null);
        setError(created.error ?? 'unavailable');
        return;
      }
      ticket = { file: registered, uploadUrl };
    }

    const outcome = await uploadFileBytes({
      file: selected,
      onProgress: (fraction) =>
        setTransfer((current) =>
          current?.state === 'sending' ? { ...current, progress: fraction } : current,
        ),
      signal: controller.signal,
      url: ticket.uploadUrl,
    });
    if (outcome === 'aborted') return;
    if (outcome === 'failed') {
      /* The bytes did not arrive. Say so and keep the file for a retry. */
      setTransfer({ file: selected, progress: 0, state: 'failed', ticket });
      return;
    }

    const finalized = await finalizeCollectionUploadAction(formId, ticket.file.id);
    if (finalized.error !== null) {
      setTransfer({ file: selected, progress: 0, state: 'failed', ticket });
      setError(finalized.error);
      return;
    }

    startTransition(async () => {
      const attached = await attachCollectionFileAction(formId, field.id, ticket.file.id);
      setTransfer(null);
      if (attached.error !== null) {
        setError(attached.error);
        return;
      }
      setSettling({ fileId: ticket.file.id, kind: 'attach' });
      onChanged();
    });
  }

  function handleRemove(fileId: string) {
    setError(null);
    startTransition(async () => {
      const result = await detachCollectionFileAction(formId, fileId);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setSettling({ fileId, kind: 'detach' });
      onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex list-none flex-col gap-2 p-0">
        {files.map((file) => (
          <li
            className="flex flex-wrap items-center gap-2 rounded-control border border-input bg-card px-3 py-2"
            key={file.id}
          >
            <FileIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">{file.originalFilename}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('file.size', { megabytes: (file.byteSize / 1_000_000).toFixed(1) })}
            </span>
            <StatusBadge tone={STATUS_TONES[file.status]}>
              {t(`file.status.${file.status}`)}
            </StatusBadge>
            {/*
              Only a file that passed inspection can be opened. Anything else has
              no link at all rather than one that would fail.
            */}
            {file.status === 'ready' ? (
              <a
                className="inline-flex items-center gap-1 rounded-control text-xs font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                download={file.originalFilename}
                href={`/files/${file.id}/download`}
              >
                <DownloadIcon aria-hidden="true" className="size-3.5" />
                <span aria-hidden="true">{t('file.download')}</span>
                <span className="sr-only">
                  {t('file.downloadLabel', { name: file.originalFilename })}
                </span>
              </a>
            ) : null}
            {isReadOnly ? null : (
              <Button
                aria-label={t('file.remove', { name: file.originalFilename })}
                disabled={isBusy}
                onClick={() => handleRemove(file.id)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2Icon />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {/*
        The file currently being sent. It is shown separately from the attached
        list because it is not attached yet: if the transfer fails, nothing was
        stored, and the Student is told so rather than shown a document.
      */}
      {transfer === null ? null : (
        <div
          className={cn(
            'flex flex-col gap-2 rounded-control border px-3 py-2.5',
            transfer.state === 'failed'
              ? 'border-destructive/30 bg-destructive-background'
              : 'border-input bg-card',
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <FileIcon
              aria-hidden="true"
              className={cn(
                'size-4 shrink-0',
                transfer.state === 'failed' ? 'text-destructive' : 'text-muted-foreground',
              )}
            />
            <span className="min-w-0 flex-1 truncate text-sm">{transfer.file.name}</span>
            {transfer.state === 'sending' ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {t('file.uploading', { percent: Math.round(transfer.progress * 100) })}
              </span>
            ) : (
              <Button
                onClick={() => void send(transfer.file, transfer.ticket)}
                size="sm"
                type="button"
                variant="outline"
              >
                <RotateCcwIcon aria-hidden="true" />
                {t('file.retryUpload')}
              </Button>
            )}
          </div>
          {transfer.state === 'sending' ? (
            /*
              A native progress element carries the value to assistive
              technology, so the percentage is never conveyed by width alone.
            */
            <progress
              aria-label={t('file.uploadProgressLabel', { name: transfer.file.name })}
              className="h-1.5 w-full"
              max={1}
              value={transfer.progress}
            />
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertTriangleIcon aria-hidden="true" className="size-4 shrink-0" />
              {t('file.uploadFailed')}
            </p>
          )}
        </div>
      )}

      {/*
        A file that has not passed inspection is called out in words, not only by
        colour, so nobody mistakes an uploaded file for an accepted one.
      */}
      {files.some((file) => file.status !== 'ready') ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('file.pendingInspection')}
        </p>
      ) : null}

      {isReadOnly ? null : (
        <div className="flex flex-col gap-2">
          <input
            accept={accept}
            className="sr-only"
            id={`${field.id}-file`}
            onChange={(event) => {
              handleSelect(event.target.files?.[0]);
              /* Reset so choosing the same file again still fires a change. */
              event.target.value = '';
            }}
            ref={inputRef}
            type="file"
          />
          <div>
            <Button
              disabled={isBusy || isFull}
              onClick={() => inputRef.current?.click()}
              type="button"
              variant="outline"
            >
              {isBusy ? <Spinner aria-hidden="true" /> : <UploadIcon aria-hidden="true" />}
              {isBusy ? t('file.registering') : t('file.choose')}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('file.limits', {
              count: maxFiles,
              megabytes: MAX_FILE_BYTES / 1_000_000,
              types: allowedTypes.map((type) => t(`fileType.${type}`)).join(', '),
            })}
          </p>
        </div>
      )}

      {localError !== null ? (
        <p className="text-sm font-medium text-destructive">{t(`file.localError.${localError}`)}</p>
      ) : null}
      {error !== null ? (
        <p className="text-sm font-medium text-destructive">{errorT(error)}</p>
      ) : null}
    </div>
  );
}
