import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { WorkMediaService } from '../application/work-media.service';
import { WorkMediaProcessorModule } from './work-media-processor.module';

const MAX_JOBS_PER_RUN = 20;
const POLL_INTERVAL_MILLISECONDS = 2_000;
const MAX_RETRY_DELAY_MILLISECONDS = 30_000;

type WorkMediaProcessor = Pick<WorkMediaService, 'cleanupNext' | 'processNext'>;

export async function runWorkMediaProcessor({
  isContinuous = false,
}: { isContinuous?: boolean } = {}): Promise<void> {
  const logger = new Logger('WorkMediaProcessor');
  sharp.cache({ files: 0, items: 32, memory: 64 });
  sharp.concurrency(1);
  const app = await NestFactory.createApplicationContext(WorkMediaProcessorModule, {
    logger: ['error', 'warn', 'log'],
  });
  const abortController = new AbortController();
  const stop = () => abortController.abort();
  if (isContinuous) {
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }
  try {
    const media = app.get(WorkMediaService);
    if (isContinuous) {
      await runContinuousWorkMediaProcessor({
        media,
        onBatch: ({ cleaned, processed }) => {
          if (cleaned === 0 && processed === 0) return;
          logger.log({ cleaned, operation: 'work_media_processor_run', processed });
        },
        onFailure: (error, retryDelayMilliseconds) => {
          logger.warn({
            ...describeProcessorError(error),
            errorCode: 'WORK_MEDIA_PROCESSOR_RETRYING',
            operation: 'work_media_processor_run',
            retryDelayMilliseconds,
          });
        },
        signal: abortController.signal,
      });
    } else {
      const { cleaned, processed } = await processBatch(media);
      logger.log({ cleaned, operation: 'work_media_processor_run', processed });
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await app.close();
  }
}

async function processBatch(
  media: WorkMediaProcessor,
): Promise<{ cleaned: number; processed: number }> {
  let processed = 0;
  while (processed < MAX_JOBS_PER_RUN) {
    const result = await media.processNext();
    if (result === null) break;
    processed += 1;
  }
  let cleaned = 0;
  while (processed + cleaned < MAX_JOBS_PER_RUN) {
    const result = await media.cleanupNext();
    if (result === null) break;
    cleaned += 1;
  }
  return { cleaned, processed };
}

export async function runContinuousWorkMediaProcessor(input: {
  media: WorkMediaProcessor;
  onBatch: (result: { cleaned: number; processed: number }) => void;
  onFailure: (error: unknown, retryDelayMilliseconds: number) => void;
  signal: AbortSignal;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}): Promise<void> {
  const wait = input.wait ?? waitForNextPoll;
  let consecutiveFailures = 0;
  while (!input.signal.aborted) {
    try {
      const result = await processBatch(input.media);
      consecutiveFailures = 0;
      input.onBatch(result);
    } catch (error: unknown) {
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

export function reportWorkMediaProcessorFailure(error: unknown): void {
  const logger = new Logger('WorkMediaProcessor');
  logger.error({
    ...describeProcessorError(error),
    errorCode: 'WORK_MEDIA_PROCESSOR_FAILED',
    operation: 'work_media_processor_run',
  });
  process.exitCode = 1;
}

function describeProcessorError(error: unknown): {
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
  void runWorkMediaProcessor().catch(reportWorkMediaProcessorFailure);
}
