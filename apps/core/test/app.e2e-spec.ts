import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApplication } from './../src/configure-application';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  it('/v1/health/live (GET)', () => {
    return request(app.getHttpServer())
      .get('/v1/health/live')
      .expect(200)
      .expect(({ body }: { body: { status: string } }) => {
        expect(body.status).toBe('ok');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
