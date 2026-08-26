import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { NotificationsService } from '../application/notifications.service';

const IDLE_POLL_MILLISECONDS = 1_000;
const MAINTENANCE_INTERVAL_MILLISECONDS = 60_000;
let isStopping = false;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    isStopping = true;
  });
}

async function main(): Promise<void> {
  const logger = new Logger('NotificationWorker');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  let nextMaintenanceAt = Date.now();
  try {
    const notifications = app.get(NotificationsService);
    while (!isStopping) {
      if (Date.now() >= nextMaintenanceAt) {
        await notifications.maintain();
        nextMaintenanceAt = Date.now() + MAINTENANCE_INTERVAL_MILLISECONDS;
      }
      const hasProcessed = await notifications.processNext();
      if (!hasProcessed) await delay(IDLE_POLL_MILLISECONDS);
    }
    logger.log({ operation: 'notification_worker_stopped' });
  } finally {
    await app.close();
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

void main().catch((error: unknown) => {
  const logger = new Logger('NotificationWorker');
  logger.error({
    databaseErrorCode:
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : undefined,
    errorCode: 'NOTIFICATION_WORKER_FAILED',
    errorName: error instanceof Error ? error.name : 'UNKNOWN',
    operation: 'notification_worker_run',
  });
  process.exitCode = 1;
});
