import { afterEach, describe, expect, it, vi } from 'vitest';
import { revalidatePath, revalidateTag } from 'next/cache';
import { POST } from './route';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

describe('Visitor cache revalidation endpoint', () => {
  afterEach(() => vi.clearAllMocks());

  it('expires authenticated cache tags and their entity paths', async () => {
    const response = await POST(
      new Request('http://localhost/api/internal/cache/revalidate', {
        body: JSON.stringify({
          tags: ['showcase-catalog-works', `showcase-work-${id(1)}`],
        }),
        headers: {
          authorization: 'Bearer local-development-only-visitor-cache-secret',
          'content-type': 'application/json',
        },
        method: 'POST',
      }),
    );
    expect(response.status).toBe(204);
    expect(revalidateTag).toHaveBeenCalledWith('showcase-catalog-works', { expire: 0 });
    expect(revalidatePath).toHaveBeenCalledWith('/works');
    expect(revalidatePath).toHaveBeenCalledWith(`/works/${id(1)}`);
  });

  it('rejects missing credentials without exposing configuration', async () => {
    const response = await POST(
      new Request('http://localhost/api/internal/cache/revalidate', {
        body: JSON.stringify({ tags: ['showcase-catalog'] }),
        method: 'POST',
      }),
    );
    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

function id(index: number): string {
  return `9e000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}
