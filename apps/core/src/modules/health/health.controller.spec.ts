import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const result = { details: {}, error: {}, info: {}, status: 'ok' as const };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: { check: jest.fn().mockResolvedValue(result) },
        },
        {
          provide: MemoryHealthIndicator,
          useValue: { checkHeap: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('reports liveness', async () => {
    await expect(controller.liveness()).resolves.toEqual(result);
  });

  it('reports readiness', async () => {
    await expect(controller.readiness()).resolves.toEqual(result);
  });
});
