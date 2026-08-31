import { safeErrorLogFields } from './error-log';

describe('safeErrorLogFields', () => {
  it('keeps the error type and stable provider code without logging the message', () => {
    const error = Object.assign(new Error('token=secret'), { code: 'PROVIDER_TIMEOUT' });
    expect(safeErrorLogFields(error)).toEqual({
      errorName: 'Error',
      providerErrorCode: 'PROVIDER_TIMEOUT',
    });
    expect(JSON.stringify(safeErrorLogFields(error))).not.toContain('secret');
  });

  it('does not copy arbitrary error codes into structured logs', () => {
    expect(
      safeErrorLogFields(Object.assign(new Error('private'), { code: 'secret detail' })),
    ).toEqual({
      errorName: 'Error',
    });
  });
});
