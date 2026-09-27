import { afterEach, describe, expect, it } from 'vitest';
import { getInstructorServerEnvironment } from './server-environment';

const originalEnvironment = {
  API_KEY: process.env.API_KEY,
  CORE_URL: process.env.CORE_URL,
  NODE_ENV: process.env.NODE_ENV,
  STUDENT_COLLECTION_URL: process.env.STUDENT_COLLECTION_URL,
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

function setProductionValues(): void {
  process.env.API_KEY = 'environment-specific-instructor-secret-value';
  process.env.CORE_URL = 'https://core.example.test';
  mutableEnvironment.NODE_ENV = 'production';
}

describe('getInstructorServerEnvironment', () => {
  afterEach(() => {
    for (const name of Object.keys(originalEnvironment)) {
      restore(name as keyof typeof originalEnvironment);
    }
  });

  it('provides local-only defaults outside production', () => {
    delete process.env.API_KEY;
    delete process.env.CORE_URL;
    delete process.env.STUDENT_COLLECTION_URL;
    mutableEnvironment.NODE_ENV = 'development';

    expect(getInstructorServerEnvironment()).toEqual({
      coreUrl: 'http://localhost:4100',
      instructorBffSecret: 'local-development-only-instructor-bff-secret',
      studentCollectionUrl: 'http://localhost:3004',
    });
  });

  it('reduces the Student Collection URL to its origin', () => {
    setProductionValues();
    process.env.STUDENT_COLLECTION_URL = 'https://collect.example.test/forms/?from=instructor';

    expect(getInstructorServerEnvironment().studentCollectionUrl).toBe(
      'https://collect.example.test',
    );
  });

  it('fails closed in production without a Student Collection URL', () => {
    setProductionValues();
    delete process.env.STUDENT_COLLECTION_URL;

    expect(() => getInstructorServerEnvironment()).toThrow();
  });

  it('rejects a Student Collection URL that is not a URL', () => {
    setProductionValues();
    process.env.STUDENT_COLLECTION_URL = 'collect.example.test';

    expect(() => getInstructorServerEnvironment()).toThrow();
  });
});
