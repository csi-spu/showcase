import { createHmac } from 'node:crypto';
import type { AttributionSecretProtector } from '../application/attribution-invitations.ports';

export class NodeAttributionSecretProtector implements AttributionSecretProtector {
  constructor(private readonly secret: string) {}

  hashInvitationSession(value: string): string {
    return this.hash('attribution-invitation-session', value);
  }

  hashInvitationToken(value: string): string {
    return this.hash('attribution-invitation-token', value);
  }

  hashRecoveryCode(value: string): string {
    return this.hash('attribution-recovery-code', value);
  }

  private hash(domain: string, value: string): string {
    return createHmac('sha256', this.secret)
      .update(domain)
      .update('\0')
      .update(value)
      .digest('hex');
  }
}
