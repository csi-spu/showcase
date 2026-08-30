import { describe, expect, it } from 'vitest';
import { resolveRecoveryQueueView } from './recovery-queue-view';

describe('Recovery queue view', () => {
  it('shows one bounded queue and defaults invalid input to Work removal requests', () => {
    expect(resolveRecoveryQueueView(undefined)).toBe('removals');
    expect(resolveRecoveryQueueView('removals')).toBe('removals');
    expect(resolveRecoveryQueueView('attributions')).toBe('attributions');
    expect(resolveRecoveryQueueView('unknown')).toBe('removals');
  });
});
