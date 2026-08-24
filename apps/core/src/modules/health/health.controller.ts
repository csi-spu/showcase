import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { DatabaseReadinessIndicator } from './database-readiness.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly database: DatabaseReadinessIndicator,
  ) {}

  @Get('live')
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.memory.checkHeap('memoryHeap', 512 * 1024 * 1024)]);
  }

  @Get('ready')
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.memory.checkHeap('memoryHeap', 512 * 1024 * 1024),
      () => this.database.check(),
    ]);
  }
}
