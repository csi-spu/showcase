export type RecoveryQueueView = 'attributions' | 'removals';

export function resolveRecoveryQueueView(value: string | undefined): RecoveryQueueView {
  return value === 'attributions' ? 'attributions' : 'removals';
}
