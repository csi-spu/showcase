export function encodeListCursor(createdAt: Date, accountId: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${accountId}`, 'utf8').toString('base64url');
}

export function decodeListCursor(cursor: string): { accountId: string; createdAt: Date } | null {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const separatorIndex = decoded.indexOf('|');
  if (separatorIndex === -1) return null;
  const createdAtValue = decoded.slice(0, separatorIndex);
  const accountId = decoded.slice(separatorIndex + 1);
  const createdAt = new Date(createdAtValue);
  if (Number.isNaN(createdAt.getTime()) || accountId.length === 0) return null;
  return { accountId, createdAt };
}
