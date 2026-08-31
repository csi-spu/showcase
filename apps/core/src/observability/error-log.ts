export interface SafeErrorLogFields {
  errorName: string;
  providerErrorCode?: string;
}

export function safeErrorLogFields(error: unknown): SafeErrorLogFields {
  if (!(error instanceof Error)) return { errorName: 'UNKNOWN' };
  const code = 'code' in error ? error.code : undefined;
  const providerErrorCode =
    typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,100}$/u.test(code) ? code : undefined;
  return providerErrorCode === undefined
    ? { errorName: error.name }
    : { errorName: error.name, providerErrorCode };
}
