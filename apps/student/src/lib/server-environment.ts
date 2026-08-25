import 'server-only';
import { z } from 'zod';

const serverEnvironmentSchema = z.object({
  CORE_URL: z.url().transform((value) => new URL(value).origin),
  STUDENT_BFF_SECRET: z.string().min(32),
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
    CORE_URL: process.env.CORE_URL ?? (isProduction ? undefined : 'http://localhost:4100'),
    STUDENT_BFF_SECRET:
      process.env.STUDENT_BFF_SECRET ??
      (isProduction ? undefined : 'local-development-only-student-bff-secret'),
    VISITOR_URL: process.env.VISITOR_URL ?? (isProduction ? undefined : 'http://localhost:3000'),
  });
  return {
    coreUrl: environment.CORE_URL,
    studentBffSecret: environment.STUDENT_BFF_SECRET,
    visitorUrl: environment.VISITOR_URL,
  };
}
