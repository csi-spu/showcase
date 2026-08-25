import { z } from 'zod';

const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const LOCAL_IDENTITY_SECRET = 'local-development-only-identity-secret';
const LOCAL_STUDENT_BFF_SECRET = 'local-development-only-student-bff-secret';
const LOCAL_SUPABASE_KEY = 'local-publishable-key-set-by-supabase-status';
const originSchema = z
  .url()
  .refine((value) => new URL(value).origin === value, 'Must be an origin without a path');

const environmentSchema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    AUTH_IDENTITY_SECRET: z.string().min(32).default(LOCAL_IDENTITY_SECRET),
    CORS_ALLOWED_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://localhost:3001,http://localhost:3002')
      .transform((value) => value.split(',').map((origin) => origin.trim()))
      .pipe(z.array(originSchema).min(1)),
    DATABASE_URL: z.string().url().default(LOCAL_DATABASE_URL),
    GIT_SHA: z.string().min(7).default('development'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65_535).default(4100),
    STUDENT_BFF_SECRET: z.string().min(32).default(LOCAL_STUDENT_BFF_SECRET),
    SUPABASE_AUTH_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(5_000),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1).default(LOCAL_SUPABASE_KEY),
    SUPABASE_URL: z.url().default('http://127.0.0.1:54321'),
  })
  .superRefine((environment, context) => {
    if (
      ['production', 'staging'].includes(environment.APP_ENV) &&
      environment.AUTH_IDENTITY_SECRET === LOCAL_IDENTITY_SECRET
    ) {
      context.addIssue({
        code: 'custom',
        message: 'AUTH_IDENTITY_SECRET must be environment-specific outside local development',
        path: ['AUTH_IDENTITY_SECRET'],
      });
    }

    if (
      ['production', 'staging'].includes(environment.APP_ENV) &&
      environment.STUDENT_BFF_SECRET === LOCAL_STUDENT_BFF_SECRET
    ) {
      context.addIssue({
        code: 'custom',
        message: 'STUDENT_BFF_SECRET must be environment-specific outside local development',
        path: ['STUDENT_BFF_SECRET'],
      });
    }

    if (
      ['production', 'staging'].includes(environment.APP_ENV) &&
      environment.SUPABASE_PUBLISHABLE_KEY === LOCAL_SUPABASE_KEY
    ) {
      context.addIssue({
        code: 'custom',
        message: 'SUPABASE_PUBLISHABLE_KEY must be configured outside local development',
        path: ['SUPABASE_PUBLISHABLE_KEY'],
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(environment: Record<string, unknown>): Environment {
  return environmentSchema.parse(environment);
}
