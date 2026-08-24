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
});
