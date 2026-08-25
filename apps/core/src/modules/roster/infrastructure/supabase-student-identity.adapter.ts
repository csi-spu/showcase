import { z } from 'zod';
import type { StudentIdentityProvider } from '../application/roster.ports';

interface SupabaseStudentIdentityAdapterOptions {
  baseUrl: string;
  secretKey: string;
  timeoutMilliseconds: number;
}

const providerIdentitySchema = z.object({ email: z.string(), id: z.uuid() }).passthrough();

class IdentityMismatchError extends Error {}

export class SupabaseStudentIdentityAdapter implements StudentIdentityProvider {
  private readonly authUrl: string;

  constructor(
    private readonly options: SupabaseStudentIdentityAdapterOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.authUrl = new URL('/auth/v1', options.baseUrl).toString().replace(/\/$/, '');
  }

  async ensureIdentity(input: {
    password: string;
    providerUserId: string;
    syntheticIdentity: string;
  }): Promise<void> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await this.fetchImpl(`${this.authUrl}/admin/users`, {
          body: JSON.stringify({
            email: input.syntheticIdentity,
            email_confirm: true,
            id: input.providerUserId,
            password: input.password,
          }),
          headers: this.headers(),
          method: 'POST',
          signal: AbortSignal.timeout(this.options.timeoutMilliseconds),
        });
        if (response.ok) {
          const identity = providerIdentitySchema.parse(await response.json());
          if (identity.id === input.providerUserId && identity.email === input.syntheticIdentity) {
            return;
          }
          throw new IdentityMismatchError();
        }

        const existing = await this.getIdentity(input.providerUserId);
        if (existing !== null) {
          if (existing.id === input.providerUserId && existing.email === input.syntheticIdentity) {
            return;
          }
          throw new IdentityMismatchError();
        }
      } catch (error: unknown) {
        if (attempt === 2 || error instanceof IdentityMismatchError) {
          throw new Error('ROSTER_AUTH_PROVIDER_UNAVAILABLE');
        }
      }
    }
    throw new Error('ROSTER_AUTH_PROVIDER_UNAVAILABLE');
  }

  private async getIdentity(providerUserId: string) {
    const response = await this.fetchImpl(`${this.authUrl}/admin/users/${providerUserId}`, {
      headers: this.headers(),
      method: 'GET',
      signal: AbortSignal.timeout(this.options.timeoutMilliseconds),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('ROSTER_AUTH_PROVIDER_UNAVAILABLE');
    return providerIdentitySchema.parse(await response.json());
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.options.secretKey,
      'content-type': 'application/json',
    };
  }
}
