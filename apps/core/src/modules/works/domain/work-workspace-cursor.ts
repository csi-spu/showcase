import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface WorkWorkspaceCursorState {
  accountId: string;
  category: 'academic_article' | 'all' | 'competition_entry' | 'course_work';
  pageSize: number;
  query: string;
  sort: 'updated_asc' | 'updated_desc';
  status: 'all' | 'changes_requested' | 'draft' | 'pending_review' | 'published';
  view: 'current' | 'saved';
}

export interface WorkWorkspaceCursorPosition {
  direction: 'next' | 'previous';
  publicId: string;
  updatedAt: string;
}

interface WorkWorkspaceCursorEnvelope {
  position: WorkWorkspaceCursorPosition;
  stateHash: string;
  version: 1;
}

export type WorkWorkspaceCursorErrorCode =
  'WORK_WORKSPACE_CURSOR_INVALID' | 'WORK_WORKSPACE_CURSOR_MISMATCH';

export class WorkWorkspaceCursorError extends Error {
  constructor(readonly code: WorkWorkspaceCursorErrorCode) {
    super(code);
    this.name = 'WorkWorkspaceCursorError';
  }
}

export class WorkWorkspaceCursorCodec {
  constructor(private readonly secret: string) {}

  encode(state: WorkWorkspaceCursorState, position: WorkWorkspaceCursorPosition): string {
    const payload = Buffer.from(
      JSON.stringify({
        position,
        stateHash: this.stateHash(state),
        version: 1,
      } satisfies WorkWorkspaceCursorEnvelope),
    ).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  decode(state: WorkWorkspaceCursorState, cursor: string): WorkWorkspaceCursorPosition {
    const parts = cursor.split('.');
    if (parts.length !== 2) this.invalid();
    const [payload, signature] = parts as [string, string];
    const expected = Buffer.from(this.sign(payload), 'base64url');
    const received = Buffer.from(signature, 'base64url');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) this.invalid();

    let value: unknown;
    try {
      value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
    } catch {
      this.invalid();
    }
    if (!isEnvelope(value)) this.invalid();
    if (value.stateHash !== this.stateHash(state)) {
      throw new WorkWorkspaceCursorError('WORK_WORKSPACE_CURSOR_MISMATCH');
    }
    return value.position;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  private stateHash(state: WorkWorkspaceCursorState): string {
    return createHash('sha256')
      .update(
        JSON.stringify([
          state.accountId,
          state.view,
          state.query,
          state.category,
          state.status,
          state.sort,
          state.pageSize,
        ]),
      )
      .digest('base64url');
  }

  private invalid(): never {
    throw new WorkWorkspaceCursorError('WORK_WORKSPACE_CURSOR_INVALID');
  }
}

function isEnvelope(value: unknown): value is WorkWorkspaceCursorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as Partial<WorkWorkspaceCursorEnvelope>;
  return (
    envelope.version === 1 &&
    typeof envelope.stateHash === 'string' &&
    isPosition(envelope.position)
  );
}

function isPosition(value: unknown): value is WorkWorkspaceCursorPosition {
  if (typeof value !== 'object' || value === null) return false;
  const position = value as Partial<WorkWorkspaceCursorPosition>;
  const timestamp = typeof position.updatedAt === 'string' ? Date.parse(position.updatedAt) : NaN;
  return (
    (position.direction === 'next' || position.direction === 'previous') &&
    typeof position.publicId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      position.publicId,
    ) &&
    typeof position.updatedAt === 'string' &&
    !Number.isNaN(timestamp) &&
    new Date(timestamp).toISOString() === position.updatedAt
  );
}
