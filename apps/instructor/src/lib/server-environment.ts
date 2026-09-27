import 'server-only';
import { z } from 'zod';

const serverEnvironmentSchema = z.object({
  API_KEY: z.string().min(32),
  CORE_URL: z.url().transform((value) => new URL(value).origin),
  STUDENT_COLLECTION_URL: z.url().transform((value) => new URL(value).origin),
});

export interface InstructorServerEnvironment {
  coreUrl: string;
  instructorBffSecret: string;
  /** Where Students answer forms; the origin of every shared Student link. */
  studentCollectionUrl: string;
}

export function getInstructorServerEnvironment(): InstructorServerEnvironment {
  const isProduction = process.env.NODE_ENV === 'production';
  const environment = serverEnvironmentSchema.parse({
    API_KEY:
      process.env.API_KEY ??
      (isProduction ? undefined : 'local-development-only-instructor-bff-secret'),
    CORE_URL: process.env.CORE_URL ?? (isProduction ? undefined : 'http://localhost:4100'),
    STUDENT_COLLECTION_URL:
      process.env.STUDENT_COLLECTION_URL ?? (isProduction ? undefined : 'http://localhost:3004'),
  });
  return {
    coreUrl: environment.CORE_URL,
    instructorBffSecret: environment.API_KEY,
    studentCollectionUrl: environment.STUDENT_COLLECTION_URL,
  };
}
