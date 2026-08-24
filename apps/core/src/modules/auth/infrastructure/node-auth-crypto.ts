import { createHmac, randomBytes } from 'node:crypto';
import { Clock, IdentityProtector, TokenGenerator } from '../application/auth.ports';

export class NodeClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class NodeIdentityProtector implements IdentityProtector {
  constructor(private readonly secret: string) {}

  hashSessionToken(value: string): string {
    return this.hash('session', value);
  }

  hashSourceAddress(value: string): string {
    return this.hash('source', value);
  }

  hashStudentId(value: string): string {
    return this.hash('student-id', value);
  }

  toSyntheticIdentity(studentId: string): string {
    return `${this.hashStudentId(studentId)}@auth.invalid`;
  }

  private hash(domain: string, value: string): string {
    return createHmac('sha256', this.secret)
      .update(domain)
      .update('\0')
      .update(value)
      .digest('hex');
  }
}

export class NodeTokenGenerator implements TokenGenerator {
  generate(byteLength: number): string {
    return randomBytes(byteLength).toString('base64url');
  }
}
