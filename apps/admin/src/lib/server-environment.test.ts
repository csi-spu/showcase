import { afterEach, describe, expect, it } from 'vitest';
import { getAdminServerEnvironment } from './server-environment';

const originalEnvironment = {
  API_KEY: process.env.API_KEY,
  CORE_URL: process.env.CORE_URL,
  VISITOR_URL: process.env.VISITOR_URL,
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
    restore('API_KEY');
    restore('CORE_URL');
    restore('VISITOR_URL');
    restore('NODE_ENV');
  });

  it('provides local-only defaults outside production', () => {
    delete process.env.API_KEY;
    delete process.env.CORE_URL;
    mutableEnvironment.NODE_ENV = 'development';

    expect(getAdminServerEnvironment()).toEqual({
      adminBffSecret: 'local-development-only-admin-bff-secret',
      coreUrl: 'http://localhost:4100',
      visitorUrl: 'http://localhost:3000',
    });
  });

  it('validates explicit values and reduces Core URL to its origin', () => {
    process.env.API_KEY = 'environment-specific-admin-secret-value';
    process.env.CORE_URL = 'https://core.example.test/internal/path';
    process.env.VISITOR_URL = 'https://visitor.example.test/catalog/path';
    mutableEnvironment.NODE_ENV = 'production';

    expect(getAdminServerEnvironment()).toEqual({
      adminBffSecret: 'environment-specific-admin-secret-value',
      coreUrl: 'https://core.example.test',
      visitorUrl: 'https://visitor.example.test',
    });
  });

  it('fails closed when production secrets are absent', () => {
    delete process.env.API_KEY;
    delete process.env.CORE_URL;
    mutableEnvironment.NODE_ENV = 'production';

    expect(() => getAdminServerEnvironment()).toThrow();
  });
});
