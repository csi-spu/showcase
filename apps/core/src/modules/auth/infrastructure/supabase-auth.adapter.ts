import { z } from 'zod';
import { AuthProvider, AuthProviderError, ProviderSession } from '../application/auth.ports';

const providerSessionSchema = z.object({
  access_token: z.string().min(1),
  expires_at: z.number().int().positive().optional(),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  user: z.object({ id: z.uuid() }),
});

interface SupabaseAuthAdapterOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMilliseconds: number;
}

export class SupabaseAuthAdapter implements AuthProvider {
  private readonly authUrl: string;

  constructor(private readonly options: SupabaseAuthAdapterOptions) {
    this.authUrl = `${options.baseUrl.replace(/\/$/, '')}/auth/v1`;
  }

  async authenticate(identity: string, password: string): Promise<ProviderSession> {
    const response = await this.request(
      '/token?grant_type=password',
      {
        body: JSON.stringify({ email: identity, password }),
        method: 'POST',
      },
      false,
    );
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new AuthProviderError('INVALID_CREDENTIALS');
      }
      throw new AuthProviderError('PROVIDER_UNAVAILABLE');
    }

    return this.parseProviderSession(response);
  }

  async changePassword(accessToken: string, newPassword: string): Promise<void> {
    const response = await this.request(
      '/user',
      {
        body: JSON.stringify({ password: newPassword }),
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'PUT',
      },
      false,
    );
    if (!response.ok) {
      throw new AuthProviderError(
        response.status >= 500 || response.status === 429
          ? 'PROVIDER_UNAVAILABLE'
          : 'PROVIDER_REJECTED',
      );
    }
  }

  async refresh(refreshToken: string): Promise<ProviderSession> {
    const response = await this.request(
      '/token?grant_type=refresh_token',
      {
        body: JSON.stringify({ refresh_token: refreshToken }),
        method: 'POST',
      },
      true,
    );
    if (!response.ok) {
      throw new AuthProviderError(
        response.status >= 500 || response.status === 429
          ? 'PROVIDER_UNAVAILABLE'
          : 'PROVIDER_REJECTED',
      );
    }

    return this.parseProviderSession(response);
  }

  async revoke(accessToken: string, scope: 'global' | 'local'): Promise<void> {
    const response = await this.request(
      `/logout?scope=${scope}`,
      {
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'POST',
      },
      true,
    );
    if (!response.ok && response.status !== 401) {
      throw new AuthProviderError(
        response.status >= 500 || response.status === 429
          ? 'PROVIDER_UNAVAILABLE'
          : 'PROVIDER_REJECTED',
      );
    }
  }

  private async parseProviderSession(response: Response): Promise<ProviderSession> {
    try {
      const result = providerSessionSchema.parse(await response.json());
      const expiresAt = new Date(
        (result.expires_at ?? Math.floor(Date.now() / 1_000) + result.expires_in) * 1_000,
      );
      return {
        accessToken: result.access_token,
        expiresAt,
        providerUserId: result.user.id,
        refreshToken: result.refresh_token,
      };
    } catch (error: unknown) {
      throw new AuthProviderError('PROVIDER_UNAVAILABLE', { cause: error });
    }
  }

  private async request(path: string, init: RequestInit, canRetry: boolean): Promise<Response> {
    const maximumAttempts = canRetry ? 2 : 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMilliseconds);
      try {
        const response = await fetch(`${this.authUrl}${path}`, {
          ...init,
          headers: {
            apikey: this.options.apiKey,
            'content-type': 'application/json',
            ...init.headers,
          },
          signal: controller.signal,
        });
        if (response.status < 500 || attempt === maximumAttempts) {
          return response;
        }
      } catch (error: unknown) {
        lastError = error;
        if (attempt === maximumAttempts) {
          break;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new AuthProviderError('PROVIDER_UNAVAILABLE', { cause: lastError });
  }
}
