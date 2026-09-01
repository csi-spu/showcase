import 'server-only';
import { z } from 'zod';

const serverEnvironmentSchema = z.object({
  API_KEY: z.string().min(32),
  CORE_URL: z.url().transform((value) => new URL(value).origin),
  VISITOR_URL: z.url().transform((value) => new URL(value).origin),
});

export interface StudentServerEnvironment {
  coreUrl: string;
  studentBffSecret: string;
  visitorUrl: string;
}

export function getStudentServerEnvironment(): StudentServerEnvironment {
  const isProduction = process.env.NODE_ENV === 'production';
  const environment = serverEnvironmentSchema.parse({
    API_KEY:
      process.env.API_KEY ??
      (isProduction ? undefined : 'local-development-only-student-bff-secret'),
    CORE_URL: process.env.CORE_URL ?? (isProduction ? undefined : 'http://localhost:4100'),
    VISITOR_URL: process.env.VISITOR_URL ?? (isProduction ? undefined : 'http://localhost:3000'),
  });
  return {
    coreUrl: environment.CORE_URL,
    studentBffSecret: environment.API_KEY,
    visitorUrl: environment.VISITOR_URL,
  };
}
