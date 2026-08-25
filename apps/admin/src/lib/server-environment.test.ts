import { afterEach, describe, expect, it } from 'vitest';
import { getAdminServerEnvironment } from './server-environment';

const originalEnvironment = {
  ADMIN_BFF_SECRET: process.env.ADMIN_BFF_SECRET,
  CORE_URL: process.env.CORE_URL,
  NODE_ENV: process.env.NODE_ENV,
};
const mutableEnvironment = process.env as Record<string, string | undefined>;

function restore(name: keyof typeof originalEnvironment): void {
  const value = originalEnvironment[name];
  if (value === undefined) {
    delete mutableEnvironment[name];
  } else {
    mutableEnvironment[name] = value;
  }
}

describe('getAdminServerEnvironment', () => {
  afterEach(() => {
    restore('ADMIN_BFF_SECRET');
    restore('CORE_URL');
    restore('NODE_ENV');
  });

  it('provides local-only defaults outside production', () => {
    delete process.env.ADMIN_BFF_SECRET;
    delete process.env.CORE_URL;
    mutableEnvironment.NODE_ENV = 'development';

    expect(getAdminServerEnvironment()).toEqual({
      adminBffSecret: 'local-development-only-admin-bff-secret',
      coreUrl: 'http://localhost:4100',
    });
  });

  it('validates explicit values and reduces Core URL to its origin', () => {
    process.env.ADMIN_BFF_SECRET = 'environment-specific-admin-secret-value';
    process.env.CORE_URL = 'https://core.example.test/internal/path';
    mutableEnvironment.NODE_ENV = 'production';

    expect(getAdminServerEnvironment()).toEqual({
      adminBffSecret: 'environment-specific-admin-secret-value',
      coreUrl: 'https://core.example.test',
    });
  });

  it('fails closed when production secrets are absent', () => {
    delete process.env.ADMIN_BFF_SECRET;
    delete process.env.CORE_URL;
    mutableEnvironment.NODE_ENV = 'production';

    expect(() => getAdminServerEnvironment()).toThrow();
  });
});
