/**
 * Gives each parallel browser scenario its own synthetic source-rate-limit key.
 * 2001:db8::/32 is reserved for documentation and cannot identify a real user.
 */
export function createE2ESourceAddress(runShort: string, actor: number): string {
  if (!/^[0-9a-f]{12}$/u.test(runShort) || !Number.isInteger(actor) || actor < 1 || actor > 255) {
    throw new Error('E2E_SOURCE_ADDRESS_INPUT_INVALID');
  }
  return `2001:db8:${runShort.slice(0, 4)}:${runShort.slice(4, 8)}:${runShort.slice(8, 12)}::${actor.toString(16)}`;
}
