import { parseEnvironment } from './environment.schema';

describe('parseEnvironment auth configuration', () => {
  it('requires the exact Student Origin to be included in credentialed CORS', () => {
    expect(() =>
      parseEnvironment({
        CORS_ALLOWED_ORIGINS: 'https://visitor.example.test',
        STUDENT_ORIGIN: 'https://student.example.test',
      }),
    ).toThrow('STUDENT_ORIGIN must be present in CORS_ALLOWED_ORIGINS');
  });

  it('rejects local placeholder secrets in staging', () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: 'staging',
        AUTH_IDENTITY_SECRET: 'local-development-only-identity-secret',
        CORS_ALLOWED_ORIGINS: 'https://student.example.test',
        STUDENT_ORIGIN: 'https://student.example.test',
        SUPABASE_PUBLISHABLE_KEY: 'staging-publishable-key',
      }),
    ).toThrow('AUTH_IDENTITY_SECRET must be environment-specific');
  });

  it('rejects a Student URL with a path because browser Origin headers cannot match it', () => {
    expect(() =>
      parseEnvironment({
        CORS_ALLOWED_ORIGINS: 'https://student.example.test/auth',
        STUDENT_ORIGIN: 'https://student.example.test/auth',
      }),
    ).toThrow('Must be an origin without a path');
  });
});
