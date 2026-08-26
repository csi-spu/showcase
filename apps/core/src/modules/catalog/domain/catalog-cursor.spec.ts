import { CatalogCursorCodec, CatalogCursorError } from './catalog-cursor';
import { normalizeWorkCatalogQuery } from './catalog-query-policy';

const SECRET = 'catalog-cursor-secret-that-is-at-least-thirty-two-bytes';

describe('Public Catalog cursor', () => {
  it('round-trips a non-expiring position bound to the normalized request', () => {
    const codec = new CatalogCursorCodec(SECRET);
    const query = normalizeWorkCatalogQuery({ category: ['course_work'], sort: 'recent' });
    const cursor = codec.encode('works', query, {
      publishedAt: '2026-08-26T10:00:00.000Z',
      publicId: '94000000-0000-4000-8000-000000000001',
    });

    expect(codec.decode('works', query, cursor)).toEqual({
      publishedAt: '2026-08-26T10:00:00.000Z',
      publicId: '94000000-0000-4000-8000-000000000001',
    });
  });

  it('rejects tampering with a stable error', () => {
    const codec = new CatalogCursorCodec(SECRET);
    const query = normalizeWorkCatalogQuery({});
    const cursor = codec.encode('works', query, { publicId: 'safe' });
    const tampered = `${cursor.slice(0, -1)}${cursor.endsWith('A') ? 'B' : 'A'}`;

    expectCursorError(() => codec.decode('works', query, tampered), 'CATALOG_CURSOR_INVALID');
  });

  it('rejects reuse across a different normalized query or collection', () => {
    const codec = new CatalogCursorCodec(SECRET);
    const query = normalizeWorkCatalogQuery({ category: ['course_work'] });
    const cursor = codec.encode('works', query, { publicId: 'safe' });

    expectCursorError(
      () =>
        codec.decode(
          'works',
          normalizeWorkCatalogQuery({ category: ['academic_article'] }),
          cursor,
        ),
      'CATALOG_CURSOR_MISMATCH',
    );
    expectCursorError(() => codec.decode('people', query, cursor), 'CATALOG_CURSOR_MISMATCH');
  });
});

function expectCursorError(operation: () => unknown, code: CatalogCursorError['code']): void {
  try {
    operation();
    throw new Error('EXPECTED_CURSOR_ERROR');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(CatalogCursorError);
    expect(error).toMatchObject({ code });
  }
}
