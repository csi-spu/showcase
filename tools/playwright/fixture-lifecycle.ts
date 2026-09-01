export function createIdempotentCleanup(action: () => Promise<void>): () => Promise<void> {
  let cleanupAttempt: Promise<void> | undefined;

  return async () => {
    if (cleanupAttempt !== undefined) return cleanupAttempt;

    const currentAttempt = action();
    cleanupAttempt = currentAttempt;
    try {
      await currentAttempt;
    } catch (error: unknown) {
      if (cleanupAttempt === currentAttempt) cleanupAttempt = undefined;
      throw error;
    }
  };
}
