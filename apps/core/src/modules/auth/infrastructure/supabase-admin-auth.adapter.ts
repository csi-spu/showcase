import { z } from 'zod';
import type {
  AdminProvisioningProvider,
  ProvisionedProviderIdentity,
} from '../application/admin-provisioning.ports';

interface SupabaseAdminAuthAdapterOptions {
  baseUrl: string;
  secretKey: string;
  timeoutMilliseconds: number;
}

const providerIdentitySchema = z.object({ id: z.uuid() }).passthrough();

export class SupabaseAdminAuthAdapter implements AdminProvisioningProvider {
  private readonly authUrl: string;

  constructor(private readonly options: SupabaseAdminAuthAdapterOptions) {
    this.authUrl = new URL('/auth/v1', options.baseUrl).toString().replace(/\/$/, '');
  }

  async createIdentity(input: {
    password: string;
    syntheticIdentity: string;
  }): Promise<ProvisionedProviderIdentity> {
    let response: Response;
    try {
      response = await fetch(`${this.authUrl}/admin/users`, {
        body: JSON.stringify({
          email: input.syntheticIdentity,
          email_confirm: true,
          password: input.password,
        }),
        headers: this.headers(),
        method: 'POST',
        signal: AbortSignal.timeout(this.options.timeoutMilliseconds),
      });
    } catch {
      throw new Error('ADMIN_PROVIDER_UNAVAILABLE');
    }
    if (!response.ok) {
      throw new Error('ADMIN_PROVIDER_UNAVAILABLE');
    }
    try {
      const identity = providerIdentitySchema.parse(await response.json());
      return { providerUserId: identity.id };
    } catch {
      throw new Error('ADMIN_PROVIDER_UNAVAILABLE');
    }
  }

  async deleteIdentity(providerUserId: string): Promise<void> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(`${this.authUrl}/admin/users/${providerUserId}`, {
          body: JSON.stringify({ should_soft_delete: false }),
          headers: this.headers(),
          method: 'DELETE',
          signal: AbortSignal.timeout(this.options.timeoutMilliseconds),
        });
        if (response.ok) {
          return;
        }
      } catch {
        // A second idempotent DELETE attempt is safe.
      }
    }
    throw new Error('ADMIN_PROVIDER_UNAVAILABLE');
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.options.secretKey,
      'content-type': 'application/json',
    };
  }
}
