import { randomUUID } from 'node:crypto';
import { SupabaseAuthAdapter } from '../src/modules/auth/infrastructure/supabase-auth.adapter';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const hasLocalAuthCredentials = PUBLISHABLE_KEY !== undefined && SECRET_KEY !== undefined;

(hasLocalAuthCredentials ? describe : describe.skip)(
  'SupabaseAuthAdapter local integration',
  () => {
    const providerUserId = randomUUID();
    const identity = `integration-${providerUserId}@auth.invalid`;
    const initialPassword = 'initial integration password';
    const changedPassword = 'changed integration password';

    beforeAll(async () => {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        body: JSON.stringify({
          email: identity,
          email_confirm: true,
          id: providerUserId,
          password: initialPassword,
        }),
        headers: {
          apikey: requireSecretKey(),
          authorization: `Bearer ${requireSecretKey()}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`SUPABASE_TEST_USER_CREATE_FAILED_${response.status}`);
      }
    });

    afterAll(async () => {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${providerUserId}`, {
        headers: {
          apikey: requireSecretKey(),
          authorization: `Bearer ${requireSecretKey()}`,
        },
        method: 'DELETE',
      });
    });

    it('authenticates, changes password, refreshes rotated credentials, and revokes locally', async () => {
      const adapter = new SupabaseAuthAdapter({
        apiKey: requirePublishableKey(),
        baseUrl: SUPABASE_URL,
        timeoutMilliseconds: 5_000,
      });
      const initialSession = await adapter.authenticate(identity, initialPassword);
      expect(initialSession.providerUserId).toBe(providerUserId);

      await adapter.changePassword(initialSession.accessToken, changedPassword);
      const changedSession = await adapter.authenticate(identity, changedPassword);
      const refreshedSession = await adapter.refresh(changedSession.refreshToken);
      expect(refreshedSession.providerUserId).toBe(providerUserId);
      expect(refreshedSession.refreshToken).not.toBe(changedSession.refreshToken);

      await expect(adapter.revoke(refreshedSession.accessToken, 'local')).resolves.toBeUndefined();
    });

    it('keeps public email signup disabled while password login is enabled', async () => {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        body: JSON.stringify({
          email: `signup-denied-${randomUUID()}@auth.invalid`,
          password: 'public signup must remain disabled',
        }),
        headers: {
          apikey: requirePublishableKey(),
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      expect(response.ok).toBe(false);
    });

    function requirePublishableKey(): string {
      if (PUBLISHABLE_KEY === undefined) {
        throw new Error('SUPABASE_PUBLISHABLE_KEY_REQUIRED');
      }
      return PUBLISHABLE_KEY;
    }

    function requireSecretKey(): string {
      if (SECRET_KEY === undefined) {
        throw new Error('SUPABASE_SECRET_KEY_REQUIRED');
      }
      return SECRET_KEY;
    }
  },
);
