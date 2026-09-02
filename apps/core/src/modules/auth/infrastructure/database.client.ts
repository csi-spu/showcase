import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../../../../generated/prisma-client';
import { createPrismaSqlClient, PrismaSql } from './prisma-sql';

@Injectable()
export class DatabaseClient implements OnApplicationShutdown {
  readonly prisma: PrismaClient;
  readonly sql: PrismaSql;

  constructor(config: ConfigService) {
    this.prisma = new PrismaClient({
      datasources: { db: { url: config.getOrThrow<string>('DATABASE_URL') } },
      log: ['error'],
    });
    this.sql = createPrismaSqlClient(this.prisma);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
