import { runContinuousCollectionFileInspector } from './inspect-collection-files';

describe('continuous collection file inspector', () => {
  it('keeps polling after a transient failure instead of exiting', async () => {
    /*
     * A stalled inspector means uploaded files stay quarantined and Students
     * cannot submit, so a single database blip must not end the run.
     */
    const abortController = new AbortController();
    const forms = {
      inspectNextFile: jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('unreachable'), { code: 'EHOSTUNREACH' }))
        .mockImplementationOnce(() => {
          abortController.abort();
          return Promise.resolve(false);
        }),
    };
    const onFailure = jest.fn();
    const wait = jest.fn().mockResolvedValue(undefined);

    await runContinuousCollectionFileInspector({
      forms,
      onBatch: jest.fn(),
      onFailure,
      signal: abortController.signal,
      wait,
    });

    expect(forms.inspectNextFile).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenCalledWith(expect.any(Error), 2_000);
    expect(wait).toHaveBeenCalledWith(2_000, abortController.signal);
  });

  it('drains the queue in one batch and reports how many it inspected', async () => {
    const abortController = new AbortController();
    const forms = {
      inspectNextFile: jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockImplementationOnce(() => {
          abortController.abort();
          return Promise.resolve(false);
        }),
    };
    const onBatch = jest.fn();

    await runContinuousCollectionFileInspector({
      forms,
      onBatch,
      onFailure: jest.fn(),
      signal: abortController.signal,
      wait: jest.fn().mockResolvedValue(undefined),
    });

    expect(onBatch).toHaveBeenCalledWith(2);
  });
});
