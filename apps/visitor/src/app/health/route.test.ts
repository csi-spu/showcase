import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('GET /health', () => {
  it('returns the service health contract', async () => {
    const response = GET();

    await expect(response.json()).resolves.toEqual({
      service: 'visitor',
      status: 'ok',
    });
    expect(response.status).toBe(200);
  });
});
