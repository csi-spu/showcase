import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /health', () => {
  it('reports the Instructor service as ok', async () => {
    const response = GET();
    await expect(response.json()).resolves.toEqual({ service: 'instructor', status: 'ok' });
  });
});
