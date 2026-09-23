import { buildBatch, runContinuousCollectionExportBuilder } from './build-collection-exports';

function fakeForms(overrides: { buildNextExport?: jest.Mock; cleanUpExpiredExport?: jest.Mock }): {
  buildNextExport: jest.Mock;
  cleanUpExpiredExport: jest.Mock;
} {
  return {
    buildNextExport: overrides.buildNextExport ?? jest.fn().mockResolvedValue(false),
    cleanUpExpiredExport: overrides.cleanUpExpiredExport ?? jest.fn().mockResolvedValue(false),
  };
}

describe('collection export batch', () => {
  /*
   * A run that kept claiming would hold one process on a burst of requests
   * while other runs sit idle, so the bound is part of the contract.
   */
  it('builds no more than the per-run maximum even when work remains', async () => {
    const forms = fakeForms({ buildNextExport: jest.fn().mockResolvedValue(true) });

    const result = await buildBatch(forms);

    expect(result.built).toBe(5);
    expect(forms.buildNextExport).toHaveBeenCalledTimes(5);
  });

  it('stops claiming once the queue is empty', async () => {
    const forms = fakeForms({
      buildNextExport: jest.fn().mockResolvedValueOnce(true).mockResolvedValue(false),
    });

    const result = await buildBatch(forms);

    expect(result.built).toBe(1);
    expect(forms.buildNextExport).toHaveBeenCalledTimes(2);
  });

  /*
   * Building comes first because an Instructor is waiting on it, while an
   * expired artifact is already undownloadable whether or not its bytes are gone.
   */
  it('sweeps expired artifacts only after building what is queued', async () => {
    const calls: string[] = [];
    const forms = fakeForms({
      buildNextExport: jest.fn().mockImplementation(() => {
        calls.push('build');
        return Promise.resolve(calls.filter((call) => call === 'build').length < 2);
      }),
      cleanUpExpiredExport: jest.fn().mockImplementation(() => {
        calls.push('clean');
        return Promise.resolve(false);
      }),
    });

    const result = await buildBatch(forms);

    expect(calls).toEqual(['build', 'build', 'clean']);
    expect(result).toEqual({ built: 1, cleaned: 0 });
  });

  it('bounds cleanup so a large expired backlog drains over several runs', async () => {
    const forms = fakeForms({ cleanUpExpiredExport: jest.fn().mockResolvedValue(true) });

    const result = await buildBatch(forms);

    expect(result.cleaned).toBe(20);
  });
});

describe('continuous collection export builder', () => {
  /*
   * A stalled builder leaves every requested export pending forever, so a
   * single storage or database blip must not end the run.
   */
  it('keeps polling after a transient failure instead of exiting', async () => {
    const abortController = new AbortController();
    const forms = fakeForms({
      buildNextExport: jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('unreachable'), { code: 'EHOSTUNREACH' }))
        .mockImplementationOnce(() => {
          abortController.abort();
          return Promise.resolve(false);
        }),
    });
    const onFailure = jest.fn();
    const wait = jest.fn().mockResolvedValue(undefined);

    await runContinuousCollectionExportBuilder({
      forms,
      onBatch: jest.fn(),
      onFailure,
      signal: abortController.signal,
      wait,
    });

    expect(onFailure).toHaveBeenCalledWith(expect.any(Error), 10_000);
    expect(wait).toHaveBeenCalledWith(10_000, abortController.signal);
  });

  it('backs off further while failures continue', async () => {
    const abortController = new AbortController();
    let attempts = 0;
    const forms = fakeForms({
      buildNextExport: jest.fn().mockImplementation(() => {
        attempts += 1;
        if (attempts >= 3) abortController.abort();
        return Promise.reject(new Error('unavailable'));
      }),
    });
    const onFailure = jest.fn<void, [unknown, number]>();

    await runContinuousCollectionExportBuilder({
      forms,
      onBatch: jest.fn(),
      onFailure,
      signal: abortController.signal,
      wait: jest.fn().mockResolvedValue(undefined),
    });

    expect(onFailure.mock.calls.map(([, delay]) => delay)).toEqual([10_000, 20_000, 40_000]);
  });

  it('reports what one pass built and cleaned', async () => {
    const abortController = new AbortController();
    let built = 0;
    const forms = fakeForms({
      buildNextExport: jest.fn().mockImplementation(() => {
        built += 1;
        if (built >= 2) abortController.abort();
        return Promise.resolve(built < 2);
      }),
      cleanUpExpiredExport: jest.fn().mockResolvedValueOnce(true).mockResolvedValue(false),
    });
    const onBatch = jest.fn();

    await runContinuousCollectionExportBuilder({
      forms,
      onBatch,
      onFailure: jest.fn(),
      signal: abortController.signal,
      wait: jest.fn().mockResolvedValue(undefined),
    });

    expect(onBatch).toHaveBeenCalledWith({ built: 1, cleaned: 1 });
  });
});
