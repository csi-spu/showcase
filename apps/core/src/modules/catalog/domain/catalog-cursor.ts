import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

type CatalogCollection = 'people' | 'tags' | 'works';
type CursorPosition = Record<string, boolean | number | string | null>;

interface CursorEnvelope {
  collection: CatalogCollection;
  position: CursorPosition;
  requestHash: string;
  version: 1;
}

export type CatalogCursorErrorCode = 'CATALOG_CURSOR_INVALID' | 'CATALOG_CURSOR_MISMATCH';

export class CatalogCursorError extends Error {
  constructor(readonly code: CatalogCursorErrorCode) {
    super(code);
    this.name = 'CatalogCursorError';
  }
}

export class CatalogCursorCodec {
  constructor(private readonly secret: string) {}

  encode(collection: CatalogCollection, query: object, position: CursorPosition): string {
    const payload = Buffer.from(
      JSON.stringify({
        collection,
        position,
        requestHash: this.requestHash(query),
        version: 1,
      } satisfies CursorEnvelope),
    ).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  decode(collection: CatalogCollection, query: object, cursor: string): CursorPosition {
    const parts = cursor.split('.');
    if (parts.length !== 2) this.invalid();
    const [payload, signature] = parts as [string, string];
    const expected = Buffer.from(this.sign(payload), 'base64url');
    const received = Buffer.from(signature, 'base64url');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) this.invalid();

    let envelope: unknown;
    try {
      envelope = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
    } catch {
      this.invalid();
    }
    if (!isCursorEnvelope(envelope)) this.invalid();
    if (envelope.collection !== collection || envelope.requestHash !== this.requestHash(query)) {
      throw new CatalogCursorError('CATALOG_CURSOR_MISMATCH');
    }
    return envelope.position;
  }

  private requestHash(query: object): string {
    return createHash('sha256').update(canonicalJson(query)).digest('base64url');
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  private invalid(): never {
    throw new CatalogCursorError('CATALOG_CURSOR_INVALID');
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function isCursorEnvelope(value: unknown): value is CursorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<CursorEnvelope>;
  return (
    candidate.version === 1 &&
    (candidate.collection === 'works' ||
      candidate.collection === 'people' ||
      candidate.collection === 'tags') &&
    typeof candidate.requestHash === 'string' &&
    typeof candidate.position === 'object' &&
    candidate.position !== null &&
    !Array.isArray(candidate.position)
  );
}
