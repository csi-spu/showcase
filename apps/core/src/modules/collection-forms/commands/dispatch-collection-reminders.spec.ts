import { runContinuousCollectionReminderDispatcher } from './dispatch-collection-reminders';

describe('continuous collection reminder dispatcher', () => {
  it('keeps polling after a transient failure instead of exiting', async () => {
    /*
     * A stalled dispatcher means Students stop being reminded of deadlines they
     * can still meet, so a single database blip must not end the run.
     */
    const abortController = new AbortController();
    const forms = {
      dispatchDueReminders: jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('unreachable'), { code: 'EHOSTUNREACH' }))
        .mockImplementationOnce(() => {
          abortController.abort();
          return Promise.resolve(0);
        }),
    };
    const onFailure = jest.fn();
    const wait = jest.fn().mockResolvedValue(undefined);

    await runContinuousCollectionReminderDispatcher({
      forms,
      onBatch: jest.fn(),
      onFailure,
      signal: abortController.signal,
      wait,
    });

    expect(forms.dispatchDueReminders).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenCalledWith(expect.any(Error), 60_000);
    expect(wait).toHaveBeenCalledWith(60_000, abortController.signal);
  });

  it('drains successive batches and reports the total it delivered', async () => {
    const abortController = new AbortController();
    const forms = {
      dispatchDueReminders: jest
        .fn()
        .mockResolvedValueOnce(200)
        .mockResolvedValueOnce(30)
        .mockImplementationOnce(() => {
          abortController.abort();
          return Promise.resolve(0);
        }),
    };
    const onBatch = jest.fn();

    await runContinuousCollectionReminderDispatcher({
      forms,
      onBatch,
      onFailure: jest.fn(),
      signal: abortController.signal,
      wait: jest.fn().mockResolvedValue(undefined),
    });

    expect(onBatch).toHaveBeenCalledWith(230);
  });

  /* An empty due set must not spin: the run ends and the schedule takes over. */
  it('stops asking once a batch delivers nothing', async () => {
    const abortController = new AbortController();
    const forms = {
      dispatchDueReminders: jest.fn().mockImplementation(() => {
        abortController.abort();
        return Promise.resolve(0);
      }),
    };

    await runContinuousCollectionReminderDispatcher({
      forms,
      onBatch: jest.fn(),
      onFailure: jest.fn(),
      signal: abortController.signal,
      wait: jest.fn().mockResolvedValue(undefined),
    });

    expect(forms.dispatchDueReminders).toHaveBeenCalledTimes(1);
  });
});
