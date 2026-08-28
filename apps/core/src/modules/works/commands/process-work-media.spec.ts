import { runContinuousWorkMediaProcessor } from './process-work-media';

describe('continuous Work media processor', () => {
  it('continues polling after a transient processing failure', async () => {
    const abortController = new AbortController();
    const media = {
      cleanupNext: jest.fn().mockResolvedValue(null),
      processNext: jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('unreachable'), { code: 'EHOSTUNREACH' }))
        .mockImplementationOnce(() => {
          abortController.abort();
          return Promise.resolve(null);
        }),
    };
    const onFailure = jest.fn();
    const wait = jest.fn().mockResolvedValue(undefined);

    await runContinuousWorkMediaProcessor({
      media,
      onBatch: jest.fn(),
      onFailure,
      signal: abortController.signal,
      wait,
    });

    expect(media.processNext).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenCalledWith(expect.any(Error), 2_000);
    expect(wait).toHaveBeenCalledWith(2_000, abortController.signal);
  });
});
