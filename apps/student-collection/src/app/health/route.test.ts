import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /health', () => {
  it('reports the Student-collection service as ok', async () => {
    const response = GET();
    await expect(response.json()).resolves.toEqual({
      service: 'student-collection',
      status: 'ok',
    });
  });
});
