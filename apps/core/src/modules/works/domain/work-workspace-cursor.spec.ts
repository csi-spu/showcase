import { WorkWorkspaceCursorCodec, WorkWorkspaceCursorError } from './work-workspace-cursor';

const SECRET = 'workspace-cursor-secret-at-least-thirty-two-bytes';

describe('Work Management cursor', () => {
  const codec = new WorkWorkspaceCursorCodec(SECRET);
  const state = {
    accountId: '55000000-0000-4000-8000-000000000001',
    category: 'all' as const,
    pageSize: 12,
    query: '',
    sort: 'updated_desc' as const,
    status: 'all' as const,
    view: 'current' as const,
  };

  it('round-trips a signed bidirectional keyset position', () => {
    const cursor = codec.encode(state, {
      direction: 'next',
      publicId: '55000000-0000-4000-8000-000000000002',
      updatedAt: '2026-08-28T10:00:00.000Z',
    });

    expect(codec.decode(state, cursor)).toEqual({
      direction: 'next',
      publicId: '55000000-0000-4000-8000-000000000002',
      updatedAt: '2026-08-28T10:00:00.000Z',
    });
  });

  it.each([
    ['actor', { ...state, accountId: '55000000-0000-4000-8000-000000000099' }],
    ['category', { ...state, category: 'course_work' as const }],
    ['query', { ...state, query: 'ก' }],
    ['sort', { ...state, sort: 'updated_asc' as const }],
    ['status', { ...state, status: 'draft' as const }],
    ['view', { ...state, view: 'saved' as const }],
    ['page size', { ...state, pageSize: 20 }],
  ])('rejects a cursor replayed under a different %s', (_field, mismatchedState) => {
    const cursor = codec.encode(state, {
      direction: 'previous',
      publicId: '55000000-0000-4000-8000-000000000002',
      updatedAt: '2026-08-28T10:00:00.000Z',
    });

    expect(() => codec.decode(mismatchedState, cursor)).toThrow(
      new WorkWorkspaceCursorError('WORK_WORKSPACE_CURSOR_MISMATCH'),
    );
  });

  it('rejects payload or signature tampering', () => {
    const cursor = codec.encode(state, {
      direction: 'next',
      publicId: '55000000-0000-4000-8000-000000000002',
      updatedAt: '2026-08-28T10:00:00.000Z',
    });

    expect(() => codec.decode(state, `${cursor.slice(0, -1)}x`)).toThrow(
      new WorkWorkspaceCursorError('WORK_WORKSPACE_CURSOR_INVALID'),
    );
  });
});
