import { z } from 'zod';

const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const LOCAL_IDENTITY_SECRET = 'local-development-only-identity-secret';
const LOCAL_ADMIN_BFF_SECRET = 'local-development-only-admin-bff-secret';
const LOCAL_CATALOG_CURSOR_SECRET = 'local-development-only-catalog-cursor-secret';
const LOCAL_CLOUDFLARE_API_TOKEN = 'local-development-only-cloudflare-api-token';
const LOCAL_STUDENT_BFF_SECRET = 'local-development-only-student-bff-secret';
const LOCAL_VISITOR_CACHE_SECRET = 'local-development-only-visitor-cache-secret';
const LOCAL_VISITOR_BFF_SECRET = 'local-development-only-visitor-bff-secret';
const LOCAL_SUPABASE_KEY = 'local-publishable-key-set-by-supabase-status';
const LOCAL_SUPABASE_SECRET_KEY = 'local-secret-key-set-by-supabase-status';
const originSchema = z
  .url()
  .refine((value) => new URL(value).origin === value, 'Must be an origin without a path');

const environmentSchema = z
  .object({
    ADMIN_BFF_SECRET: z.string().min(32).default(LOCAL_ADMIN_BFF_SECRET),
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    AUTH_IDENTITY_SECRET: z.string().min(32).default(LOCAL_IDENTITY_SECRET),
    CATALOG_CURSOR_SECRET: z.string().min(32).default(LOCAL_CATALOG_CURSOR_SECRET),
    CLOUDFLARE_API_TOKEN: z.string().min(32).default(LOCAL_CLOUDFLARE_API_TOKEN),
    CLOUDFLARE_ZONE_ID: z
      .string()
      .regex(/^[0-9a-f]{32}$/u)
      .default('00000000000000000000000000000000'),
    CORS_ALLOWED_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://localhost:3001,http://localhost:3002')
      .transform((value) => value.split(',').map((origin) => origin.trim()))
      .pipe(z.array(originSchema).min(1)),
    DATABASE_URL: z.string().url().default(LOCAL_DATABASE_URL),
    GIT_SHA: z.string().min(7).default('development'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65_535).default(4100),
    PUBLIC_MEDIA_ORIGIN: originSchema.optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_BUCKET_NAME: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
      .optional(),
    R2_ENDPOINT: originSchema.optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(5_000),
    STUDENT_BFF_SECRET: z.string().min(32).default(LOCAL_STUDENT_BFF_SECRET),
    SUPABASE_AUTH_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(5_000),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1).default(LOCAL_SUPABASE_KEY),
    SUPABASE_SECRET_KEY: z.string().min(1).default(LOCAL_SUPABASE_SECRET_KEY),
    SUPABASE_URL: z.url().default('http://127.0.0.1:54321'),
    VISITOR_CACHE_SECRET: z.string().min(32).default(LOCAL_VISITOR_CACHE_SECRET),
    VISITOR_BFF_SECRET: z.string().min(32).default(LOCAL_VISITOR_BFF_SECRET),
    VISITOR_URL: originSchema.default('http://localhost:3000'),
  })
  .superRefine((environment, context) => {
    if (
      ['production', 'staging'].includes(environment.APP_ENV) &&
      environment.ADMIN_BFF_SECRET === LOCAL_ADMIN_BFF_SECRET
    ) {
      context.addIssue({
        code: 'custom',
        message: 'ADMIN_BFF_SECRET must be environment-specific outside local development',
        path: ['ADMIN_BFF_SECRET'],
      });
    }

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
      environment.CATALOG_CURSOR_SECRET === LOCAL_CATALOG_CURSOR_SECRET
    ) {
      context.addIssue({
        code: 'custom',
        message: 'CATALOG_CURSOR_SECRET must be environment-specific outside local development',
        path: ['CATALOG_CURSOR_SECRET'],
      });
    }

    if (
      ['production', 'staging'].includes(environment.APP_ENV) &&
      environment.CLOUDFLARE_API_TOKEN === LOCAL_CLOUDFLARE_API_TOKEN
    ) {
      context.addIssue({
        code: 'custom',
        message: 'CLOUDFLARE_API_TOKEN must be configured outside local development',
        path: ['CLOUDFLARE_API_TOKEN'],
      });
    }

    if (
      ['production', 'staging'].includes(environment.APP_ENV) &&
      environment.CLOUDFLARE_ZONE_ID === '00000000000000000000000000000000'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'CLOUDFLARE_ZONE_ID must be configured outside local development',
        path: ['CLOUDFLARE_ZONE_ID'],
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
      environment.VISITOR_BFF_SECRET === LOCAL_VISITOR_BFF_SECRET
    ) {
      context.addIssue({
        code: 'custom',
        message: 'VISITOR_BFF_SECRET must be configured outside local development',
        path: ['VISITOR_BFF_SECRET'],
      });
    }

    if (
      ['production', 'staging'].includes(environment.APP_ENV) &&
      environment.VISITOR_CACHE_SECRET === LOCAL_VISITOR_CACHE_SECRET
    ) {
      context.addIssue({
        code: 'custom',
        message: 'VISITOR_CACHE_SECRET must be configured outside local development',
        path: ['VISITOR_CACHE_SECRET'],
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

    if (
      ['production', 'staging'].includes(environment.APP_ENV) &&
      environment.SUPABASE_SECRET_KEY === LOCAL_SUPABASE_SECRET_KEY
    ) {
      context.addIssue({
        code: 'custom',
        message: 'SUPABASE_SECRET_KEY must be configured outside local development',
        path: ['SUPABASE_SECRET_KEY'],
      });
    }

    if (['production', 'staging'].includes(environment.APP_ENV)) {
      for (const key of [
        'PUBLIC_MEDIA_ORIGIN',
        'R2_ACCESS_KEY_ID',
        'R2_BUCKET_NAME',
        'R2_ENDPOINT',
        'R2_SECRET_ACCESS_KEY',
      ] as const) {
        if (environment[key] === undefined) {
          context.addIssue({
            code: 'custom',
            message: `${key} must be configured outside local development`,
            path: [key],
          });
        }
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(environment: Record<string, unknown>): Environment {
  return environmentSchema.parse(environment);
}
