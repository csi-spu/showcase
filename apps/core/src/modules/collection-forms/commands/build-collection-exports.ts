/*
 * Builds queued collection exports and cleans up expired artifacts.
 *
 * Exports are asynchronous by design: a group archive is far too large to build
 * inside an HTTP request, and the specification requires bounded workers rather
 * than buffering whole ZIPs in Core. Until this runs, requested exports stay
 * pending — which is the honest state, not a failure.
 *
 * Cleanup shares this process because both halves are bounded, periodic, and
 * touch the same storage. Neither ever deletes a source submission or document.
 */

import '../../../instrument';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CollectionFormsService } from '../application/collection-forms.service';
import { MAX_EXPORTS_PER_RUN } from '../application/collection-exports';
import { CollectionExportBuilderModule } from './collection-export-builder.module';
import { flushSentry, reportOperationalError } from '../../../observability/sentry';

/* Bounds one run so a large backlog drains over several polls rather than
 * holding one process on a single burst of work. */
const MAX_CLEANUPS_PER_RUN = 20;
const POLL_INTERVAL_MILLISECONDS = 10_000;
const MAX_RETRY_DELAY_MILLISECONDS = 300_000;

type CollectionExportBuilderService = Pick<
  CollectionFormsService,
  'buildNextExport' | 'cleanUpExpiredExport'
>;

export interface CollectionExportRunResult {
  built: number;
  cleaned: number;
}

export async function runCollectionExportBuilder({
  isContinuous = false,
}: { isContinuous?: boolean } = {}): Promise<void> {
  const logger = new Logger('CollectionExportBuilder');
  const app = await NestFactory.createApplicationContext(CollectionExportBuilderModule, {
    logger: ['error', 'warn', 'log'],
  });
  const abortController = new AbortController();
  const stop = () => abortController.abort();
  if (isContinuous) {
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }
  try {
    const forms = app.get(CollectionFormsService);
    if (isContinuous) {
      await runContinuousCollectionExportBuilder({
        forms,
        onBatch: (result) => {
          if (result.built === 0 && result.cleaned === 0) return;
          logger.log({ ...result, operation: 'collection_export_builder_run' });
        },
        onFailure: (error, retryDelayMilliseconds) => {
          logger.warn({
            ...describeBuilderError(error),
            errorCode: 'COLLECTION_EXPORT_BUILDER_RETRYING',
            operation: 'collection_export_builder_run',
            retryDelayMilliseconds,
          });
        },
        signal: abortController.signal,
      });
    } else {
      const result = await buildBatch(forms);
      logger.log({ ...result, operation: 'collection_export_builder_run' });
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await app.close();
  }
}

/**
 * One pass: build what is queued, then sweep what has expired.
 *
 * Building comes first because an Instructor is waiting on it, while an expired
 * artifact is already undownloadable whether or not its bytes are gone yet.
 */
export async function buildBatch(
  forms: CollectionExportBuilderService,
): Promise<CollectionExportRunResult> {
  let built = 0;
  while (built < MAX_EXPORTS_PER_RUN) {
    const didBuild = await forms.buildNextExport();
    if (!didBuild) break;
    built += 1;
  }
  let cleaned = 0;
  while (cleaned < MAX_CLEANUPS_PER_RUN) {
    const didClean = await forms.cleanUpExpiredExport();
    if (!didClean) break;
    cleaned += 1;
  }
  return { built, cleaned };
}

export async function runContinuousCollectionExportBuilder(input: {
  forms: CollectionExportBuilderService;
  onBatch: (result: CollectionExportRunResult) => void;
  onFailure: (error: unknown, retryDelayMilliseconds: number) => void;
  signal: AbortSignal;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}): Promise<void> {
  const wait = input.wait ?? waitForNextPoll;
  let consecutiveFailures = 0;
  while (!input.signal.aborted) {
    try {
      const result = await buildBatch(input.forms);
      consecutiveFailures = 0;
      input.onBatch(result);
    } catch (error: unknown) {
      /* Backs off so a database or storage outage is not hammered. */
      consecutiveFailures += 1;
      const retryDelayMilliseconds = Math.min(
        POLL_INTERVAL_MILLISECONDS * 2 ** (consecutiveFailures - 1),
        MAX_RETRY_DELAY_MILLISECONDS,
      );
      input.onFailure(error, retryDelayMilliseconds);
      if (input.signal.aborted) break;
      await wait(retryDelayMilliseconds, input.signal);
      continue;
    }
    if (input.signal.aborted) break;
    await wait(POLL_INTERVAL_MILLISECONDS, input.signal);
  }
}

function waitForNextPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function reportCollectionExportBuilderFailure(error: unknown): Promise<void> {
  const logger = new Logger('CollectionExportBuilder');
  logger.error({
    ...describeBuilderError(error),
    errorCode: 'COLLECTION_EXPORT_BUILDER_FAILED',
    operation: 'collection_export_builder_run',
  });
  reportOperationalError(error, {
    errorCode: 'COLLECTION_EXPORT_BUILDER_FAILED',
    operation: 'collection_export_builder_run',
    runtime: 'collection-export-builder',
  });
  process.exitCode = 1;
  await flushSentry();
}

/* Never includes a filename, an answer, or a Student identifier: these logs are
 * operational, and an export's content is exactly what must stay out of them. */
function describeBuilderError(error: unknown): {
  databaseErrorCode: string | undefined;
  errorName: string;
} {
  return {
    databaseErrorCode:
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : undefined,
    errorName: error instanceof Error ? error.name : 'UNKNOWN',
  };
}

if (require.main === module) {
  void runCollectionExportBuilder().catch(reportCollectionExportBuilderFailure);
}
