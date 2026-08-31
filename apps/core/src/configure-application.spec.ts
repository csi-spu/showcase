import type { NextFunction, Response } from 'express';
import { handleBodyParserError } from './configure-application';

describe('handleBodyParserError', () => {
  it('maps an oversized roster body to the stable import error contract', () => {
    const json = jest.fn();
    const setHeader = jest.fn();
    setHeader.mockReturnValue({ json, setHeader });
    const status = jest.fn().mockReturnValue({ json, setHeader });
    const next: NextFunction = jest.fn();
    const response = { json, setHeader, status } as unknown as Response;

    handleBodyParserError({ status: 413 }, {} as never, response, next);

    expect(status).toHaveBeenCalledWith(413);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(json).toHaveBeenCalledWith({ error: { code: 'ROSTER_FILE_TOO_LARGE' } });
    expect(next).not.toHaveBeenCalled();
  });

  it('passes unrelated parser errors to Nest', () => {
    const next: NextFunction = jest.fn();
    handleBodyParserError(new Error('malformed body'), {} as never, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
