/*
 * Drains the collection file inspection queue.
 *
 * Until this runs, uploaded files stay quarantined and cannot be submitted.
 * That is the safe default, not a bug: a file is never treated as an accepted
 * document before its bytes have been examined.
 */

import '../../../instrument';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CollectionFormsService } from '../application/collection-forms.service';
import { CollectionFileInspectorModule } from './collection-file-inspector.module';
import { flushSentry, reportOperationalError } from '../../../observability/sentry';

/* Bounds one run so a large backlog cannot hold the process open indefinitely. */
const MAX_FILES_PER_RUN = 50;
const POLL_INTERVAL_MILLISECONDS = 2_000;
const MAX_RETRY_DELAY_MILLISECONDS = 30_000;

type CollectionFileInspectorService = Pick<CollectionFormsService, 'inspectNextFile'>;

export async function runCollectionFileInspector({
  isContinuous = false,
}: { isContinuous?: boolean } = {}): Promise<void> {
  const logger = new Logger('CollectionFileInspector');
  const app = await NestFactory.createApplicationContext(CollectionFileInspectorModule, {
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
      await runContinuousCollectionFileInspector({
        forms,
        onBatch: (inspected) => {
          if (inspected === 0) return;
          logger.log({ inspected, operation: 'collection_file_inspector_run' });
        },
        onFailure: (error, retryDelayMilliseconds) => {
          logger.warn({
            ...describeInspectorError(error),
            errorCode: 'COLLECTION_FILE_INSPECTOR_RETRYING',
            operation: 'collection_file_inspector_run',
            retryDelayMilliseconds,
          });
        },
        signal: abortController.signal,
      });
    } else {
      const inspected = await inspectBatch(forms);
      logger.log({ inspected, operation: 'collection_file_inspector_run' });
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await app.close();
  }
}

async function inspectBatch(forms: CollectionFileInspectorService): Promise<number> {
  let inspected = 0;
  while (inspected < MAX_FILES_PER_RUN) {
    const didInspect = await forms.inspectNextFile();
    if (!didInspect) break;
    inspected += 1;
  }
  return inspected;
}

export async function runContinuousCollectionFileInspector(input: {
  forms: CollectionFileInspectorService;
  onBatch: (inspected: number) => void;
  onFailure: (error: unknown, retryDelayMilliseconds: number) => void;
  signal: AbortSignal;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}): Promise<void> {
  const wait = input.wait ?? waitForNextPoll;
  let consecutiveFailures = 0;
  while (!input.signal.aborted) {
    try {
      const inspected = await inspectBatch(input.forms);
      consecutiveFailures = 0;
      input.onBatch(inspected);
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

export async function reportCollectionFileInspectorFailure(error: unknown): Promise<void> {
  const logger = new Logger('CollectionFileInspector');
  logger.error({
    ...describeInspectorError(error),
    errorCode: 'COLLECTION_FILE_INSPECTOR_FAILED',
    operation: 'collection_file_inspector_run',
  });
  reportOperationalError(error, {
    errorCode: 'COLLECTION_FILE_INSPECTOR_FAILED',
    operation: 'collection_file_inspector_run',
    runtime: 'collection-file-inspector',
  });
  process.exitCode = 1;
  await flushSentry();
}

/* Never includes a filename or a Student identifier: these logs are operational. */
function describeInspectorError(error: unknown): {
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
  void runCollectionFileInspector().catch(reportCollectionFileInspectorFailure);
}
