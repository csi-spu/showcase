import { parseEnvironment } from './environment.schema';

describe('parseEnvironment auth configuration', () => {
  it('rejects local placeholder authentication secrets in staging', () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: 'staging',
        AUTH_IDENTITY_SECRET: 'local-development-only-identity-secret',
        CORS_ALLOWED_ORIGINS: 'https://student.example.test',
        STUDENT_BFF_SECRET: 'staging-student-bff-secret-that-is-long-enough',
        SUPABASE_PUBLISHABLE_KEY: 'staging-publishable-key',
      }),
    ).toThrow('AUTH_IDENTITY_SECRET must be environment-specific');
  });

  it('rejects the local Student BFF placeholder secret in staging', () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: 'staging',
        AUTH_IDENTITY_SECRET: 'staging-identity-secret-that-is-long-enough',
        CORS_ALLOWED_ORIGINS: 'https://student.example.test',
        STUDENT_BFF_SECRET: 'local-development-only-student-bff-secret',
        SUPABASE_PUBLISHABLE_KEY: 'staging-publishable-key',
      }),
    ).toThrow('STUDENT_BFF_SECRET must be environment-specific');
  });

  it('rejects the local Admin BFF placeholder secret in staging', () => {
    expect(() =>
      parseEnvironment({
        ADMIN_BFF_SECRET: 'local-development-only-admin-bff-secret',
        APP_ENV: 'staging',
        AUTH_IDENTITY_SECRET: 'staging-identity-secret-that-is-long-enough',
        CORS_ALLOWED_ORIGINS: 'https://admin.example.test',
        STUDENT_BFF_SECRET: 'staging-student-bff-secret-that-is-long-enough',
        SUPABASE_PUBLISHABLE_KEY: 'staging-publishable-key',
      }),
    ).toThrow('ADMIN_BFF_SECRET must be environment-specific');
  });

  it('rejects the local Supabase secret-key placeholder in staging', () => {
    expect(() =>
      parseEnvironment({
        ADMIN_BFF_SECRET: 'staging-admin-bff-secret-that-is-long-enough',
        APP_ENV: 'staging',
        AUTH_IDENTITY_SECRET: 'staging-identity-secret-that-is-long-enough',
        CORS_ALLOWED_ORIGINS: 'https://admin.example.test',
        STUDENT_BFF_SECRET: 'staging-student-bff-secret-that-is-long-enough',
        SUPABASE_PUBLISHABLE_KEY: 'staging-publishable-key',
        SUPABASE_SECRET_KEY: 'local-secret-key-set-by-supabase-status',
      }),
    ).toThrow('SUPABASE_SECRET_KEY must be configured');
  });

  it('requires complete private R2 media configuration outside local development', () => {
    expect(() =>
      parseEnvironment({
        ADMIN_BFF_SECRET: 'staging-admin-bff-secret-that-is-long-enough',
        APP_ENV: 'staging',
        AUTH_IDENTITY_SECRET: 'staging-identity-secret-that-is-long-enough',
        CORS_ALLOWED_ORIGINS: 'https://student.example.test',
        STUDENT_BFF_SECRET: 'staging-student-bff-secret-that-is-long-enough',
        SUPABASE_PUBLISHABLE_KEY: 'staging-publishable-key',
        SUPABASE_SECRET_KEY: 'staging-secret-key',
      }),
    ).toThrow('R2_ACCESS_KEY_ID must be configured');
  });
});
