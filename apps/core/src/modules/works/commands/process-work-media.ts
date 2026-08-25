import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from '../../../app.module';
import { WorkMediaService } from '../application/work-media.service';

const MAX_JOBS_PER_RUN = 20;

async function main(): Promise<void> {
  const logger = new Logger('WorkMediaProcessor');
  sharp.cache({ files: 0, items: 32, memory: 64 });
  sharp.concurrency(1);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const media = app.get(WorkMediaService);
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
    logger.log({ cleaned, operation: 'work_media_processor_run', processed });
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  const logger = new Logger('WorkMediaProcessor');
  logger.error({
    databaseErrorCode:
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : undefined,
    errorCode: 'WORK_MEDIA_PROCESSOR_FAILED',
    errorName: error instanceof Error ? error.name : 'UNKNOWN',
    operation: 'work_media_processor_run',
  });
  process.exitCode = 1;
});
