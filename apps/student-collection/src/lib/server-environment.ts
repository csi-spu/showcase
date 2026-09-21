import 'server-only';
import { z } from 'zod';

const serverEnvironmentSchema = z.object({
  API_KEY: z.string().min(32),
  CORE_URL: z.url().transform((value) => new URL(value).origin),
});

export interface StudentCollectionServerEnvironment {
  coreUrl: string;
  studentCollectionBffSecret: string;
}

export function getStudentCollectionServerEnvironment(): StudentCollectionServerEnvironment {
  const isProduction = process.env.NODE_ENV === 'production';
  const environment = serverEnvironmentSchema.parse({
    API_KEY:
      process.env.API_KEY ??
      (isProduction ? undefined : 'local-development-only-student-collection-bff-secret'),
    CORE_URL: process.env.CORE_URL ?? (isProduction ? undefined : 'http://localhost:4100'),
  });
  return {
    coreUrl: environment.CORE_URL,
    studentCollectionBffSecret: environment.API_KEY,
  };
}
