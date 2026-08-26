import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

describe('public Web Vitals endpoint', () => {
  afterEach(() => vi.restoreAllMocks());

  it('records only a bounded privacy-safe Core Web Vital dimension set', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const response = await POST(
      request({
        device: 'mobile',
        name: 'LCP',
        page: 'home',
        rating: 'good',
        value: 2_100,
      }),
    );
    expect(response.status).toBe(204);
    const recorded = log.mock.calls[0]?.[0];
    if (typeof recorded !== 'string') throw new Error('EXPECTED_WEB_VITAL_LOG');
    expect(JSON.parse(recorded)).toEqual({
      device: 'mobile',
      name: 'LCP',
      operation: 'public_web_vital_recorded',
      page: 'home',
      rating: 'good',
      value: 2_100,
    });
  });

  it('rejects extra identifiers and impossible values', async () => {
    const response = await POST(
      request({
        device: 'desktop',
        name: 'CLS',
        page: 'works',
        publicId: 'private',
        rating: 'poor',
        value: 20,
      }),
    );
    expect(response.status).toBe(400);
  });
});

function request(body: object): Request {
  return new Request('http://localhost/api/metrics/web-vitals', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}
