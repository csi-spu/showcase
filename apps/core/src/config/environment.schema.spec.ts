import { parseEnvironment } from './environment.schema';

describe('parseEnvironment auth configuration', () => {
  it('rejects the local shared API key placeholder in staging', () => {
    expect(() =>
      parseEnvironment({
        API_KEY: 'local-development-only-shared-api-key',
        APP_ENV: 'staging',
      }),
    ).toThrow('API_KEY must be environment-specific');
  });

  it('derives ADMIN_BFF_SECRET, AUTH_IDENTITY_SECRET, and STUDENT_BFF_SECRET from API_KEY', () => {
    const environment = parseEnvironment({
      API_KEY: 'staging-shared-api-key-that-is-long-enough',
      APP_ENV: 'staging',
      CATALOG_CURSOR_SECRET: 'staging-catalog-cursor-secret-that-is-long-enough',
      CLOUDFLARE_API_TOKEN: 'staging-cloudflare-api-token-that-is-long-enough',
      CLOUDFLARE_ZONE_ID: '0123456789abcdef0123456789abcdef',
      VISITOR_BFF_SECRET: 'staging-visitor-bff-secret-that-is-long-enough',
      VISITOR_CACHE_SECRET: 'staging-visitor-cache-secret-that-is-long-enough',
      BETTER_AUTH_SECRET: 'staging-better-auth-secret-that-is-long-enough',
      MEDIA_SERVICE_URL: 'https://media.example.test',
      MEDIA_SERVICE_HMAC_SECRET: 'staging-media-hmac-secret-that-is-long-enough',
      PUBLIC_MEDIA_ORIGIN: 'https://media.example.test',
    });

    expect(environment.ADMIN_BFF_SECRET).toBe('staging-shared-api-key-that-is-long-enough');
    expect(environment.AUTH_IDENTITY_SECRET).toBe('staging-shared-api-key-that-is-long-enough');
    expect(environment.STUDENT_BFF_SECRET).toBe('staging-shared-api-key-that-is-long-enough');
  });

  it('rejects the local Visitor BFF placeholder secret in staging', () => {
    expect(() =>
      parseEnvironment({
        API_KEY: 'staging-shared-api-key-that-is-long-enough',
        APP_ENV: 'staging',
        CATALOG_CURSOR_SECRET: 'staging-catalog-cursor-secret-that-is-long-enough',
        CLOUDFLARE_API_TOKEN: 'staging-cloudflare-api-token-that-is-long-enough',
        CLOUDFLARE_ZONE_ID: '0123456789abcdef0123456789abcdef',
        VISITOR_BFF_SECRET: 'local-development-only-visitor-bff-secret',
        VISITOR_CACHE_SECRET: 'staging-visitor-cache-secret-that-is-long-enough',
      }),
    ).toThrow('VISITOR_BFF_SECRET must be configured');
  });

  it('rejects the local Public Catalog cursor secret in staging', () => {
    expect(() =>
      parseEnvironment({
        API_KEY: 'staging-shared-api-key-that-is-long-enough',
        APP_ENV: 'staging',
        CATALOG_CURSOR_SECRET: 'local-development-only-catalog-cursor-secret',
      }),
    ).toThrow('CATALOG_CURSOR_SECRET must be environment-specific');
  });

  it('rejects the local BetterAuth secret placeholder in staging', () => {
    expect(() =>
      parseEnvironment({
        API_KEY: 'staging-shared-api-key-that-is-long-enough',
        APP_ENV: 'staging',
        BETTER_AUTH_SECRET: 'local-development-only-better-auth-secret',
      }),
    ).toThrow('BETTER_AUTH_SECRET must be configured');
  });

  it('requires private media service configuration outside local development', () => {
    expect(() =>
      parseEnvironment({
        API_KEY: 'staging-shared-api-key-that-is-long-enough',
        APP_ENV: 'staging',
      }),
    ).toThrow('MEDIA_SERVICE_URL must be configured');
  });
});
