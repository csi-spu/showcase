/*
 * Delivers due deadline reminders.
 *
 * Reminders are derived from the obligation rather than scheduled ahead, so
 * this process holds no queue of its own: it asks which obligations are due
 * now and records what it delivered. A missed run therefore delays reminders
 * rather than losing them, and a moved deadline or a closed round needs no
 * backfill -- the next query simply stops selecting the row.
 */

import '../../../instrument';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CollectionFormsService } from '../application/collection-forms.service';
import { CollectionReminderDispatcherModule } from './collection-reminder-dispatcher.module';
import { flushSentry, reportOperationalError } from '../../../observability/sentry';

/* Bounds one run so a large cohort drains over several runs rather than one long one. */
const MAX_BATCHES_PER_RUN = 10;
const POLL_INTERVAL_MILLISECONDS = 60_000;
const MAX_RETRY_DELAY_MILLISECONDS = 300_000;

type CollectionReminderService = Pick<CollectionFormsService, 'dispatchDueReminders'>;

export async function runCollectionReminderDispatcher({
  isContinuous = false,
}: { isContinuous?: boolean } = {}): Promise<void> {
  const logger = new Logger('CollectionReminderDispatcher');
  const app = await NestFactory.createApplicationContext(CollectionReminderDispatcherModule, {
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
      await runContinuousCollectionReminderDispatcher({
        forms,
        onBatch: (dispatched) => {
          if (dispatched === 0) return;
          logger.log({ dispatched, operation: 'collection_reminder_dispatch' });
        },
        onFailure: (error, retryDelayMilliseconds) => {
          logger.warn({
            ...describeDispatcherError(error),
            errorCode: 'COLLECTION_REMINDER_DISPATCHER_RETRYING',
            operation: 'collection_reminder_dispatch',
            retryDelayMilliseconds,
          });
        },
        signal: abortController.signal,
      });
    } else {
      const dispatched = await dispatchBatches(forms);
      logger.log({ dispatched, operation: 'collection_reminder_dispatch' });
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await app.close();
  }
}

async function dispatchBatches(forms: CollectionReminderService): Promise<number> {
  let dispatched = 0;
  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
    const recorded = await forms.dispatchDueReminders();
    dispatched += recorded;
    /*
     * A short batch means the due set is exhausted. A batch that recorded
     * nothing but was not short means every row it found was already delivered
     * or no longer eligible, which the next run will see the same way.
     */
    if (recorded === 0) break;
  }
  return dispatched;
}

export async function runContinuousCollectionReminderDispatcher(input: {
  forms: CollectionReminderService;
  onBatch: (dispatched: number) => void;
  onFailure: (error: unknown, retryDelayMilliseconds: number) => void;
  signal: AbortSignal;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}): Promise<void> {
  const wait = input.wait ?? waitForNextPoll;
  let consecutiveFailures = 0;
  while (!input.signal.aborted) {
    try {
      const dispatched = await dispatchBatches(input.forms);
      consecutiveFailures = 0;
      input.onBatch(dispatched);
    } catch (error: unknown) {
      /* Backs off so a database outage is not hammered. */
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

export async function reportCollectionReminderDispatcherFailure(error: unknown): Promise<void> {
  const logger = new Logger('CollectionReminderDispatcher');
  logger.error({
    ...describeDispatcherError(error),
    errorCode: 'COLLECTION_REMINDER_DISPATCHER_FAILED',
    operation: 'collection_reminder_dispatch',
  });
  reportOperationalError(error, {
    errorCode: 'COLLECTION_REMINDER_DISPATCHER_FAILED',
    operation: 'collection_reminder_dispatch',
    runtime: 'collection-reminder-dispatcher',
  });
  process.exitCode = 1;
  await flushSentry();
}

/* Never includes a form title or a Student identifier: these logs are operational. */
function describeDispatcherError(error: unknown): {
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
  void runCollectionReminderDispatcher().catch(reportCollectionReminderDispatcherFailure);
}
