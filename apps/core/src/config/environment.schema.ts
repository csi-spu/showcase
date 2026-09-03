import { z } from 'zod';

const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const LOCAL_API_KEY = 'local-development-only-shared-api-key';
const LOCAL_CATALOG_CURSOR_SECRET = 'local-development-only-catalog-cursor-secret';
const LOCAL_CLOUDFLARE_API_TOKEN = 'local-development-only-cloudflare-api-token';
const LOCAL_VISITOR_CACHE_SECRET = 'local-development-only-visitor-cache-secret';
const LOCAL_VISITOR_BFF_SECRET = 'local-development-only-visitor-bff-secret';
const LOCAL_BETTER_AUTH_SECRET = 'local-development-only-better-auth-secret';
const originSchema = z
  .url()
  .refine((value) => new URL(value).origin === value, 'Must be an origin without a path');

const environmentSchema = z
  .object({
    ADMIN_URL: originSchema.default('http://localhost:3001'),
    API_KEY: z.string().min(32).default(LOCAL_API_KEY),
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    BETTER_AUTH_BASE_URL: originSchema.default('http://127.0.0.1:4100'),
    BETTER_AUTH_SECRET: z.string().min(32).default(LOCAL_BETTER_AUTH_SECRET),
    CATALOG_CURSOR_SECRET: z.string().min(32).default(LOCAL_CATALOG_CURSOR_SECRET),
    CLOUDFLARE_API_TOKEN: z.string().min(32).default(LOCAL_CLOUDFLARE_API_TOKEN),
    CLOUDFLARE_ZONE_ID: z
      .string()
      .regex(/^[0-9a-f]{32}$/u)
      .default('00000000000000000000000000000000'),
    CORE_URL: originSchema.default('http://127.0.0.1:4100'),
    DATABASE_URL: z.string().url().default(LOCAL_DATABASE_URL),
    GIT_SHA: z.string().min(7).default('development'),
    MEDIA_PROVIDER_URL: originSchema.default('http://127.0.0.1:4191'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65_535).default(4100),
    MEDIA_SERVICE_URL: originSchema.optional(),
    MEDIA_SERVICE_HMAC_SECRET: z.string().min(32).optional(),
    PUBLIC_MEDIA_ORIGIN: originSchema.optional(),
    SENTRY_DSN: z.preprocess((value) => (value === '' ? undefined : value), z.url().optional()),
    STUDENT_URL: originSchema.default('http://localhost:3002'),
    VISITOR_CACHE_SECRET: z.string().min(32).default(LOCAL_VISITOR_CACHE_SECRET),
    VISITOR_BFF_SECRET: z.string().min(32).default(LOCAL_VISITOR_BFF_SECRET),
    VISITOR_URL: originSchema.default('http://localhost:3000'),
  })
  .superRefine((environment, context) => {
    if (
      ['production', 'staging'].includes(environment.APP_ENV) &&
      environment.API_KEY === LOCAL_API_KEY
    ) {
      context.addIssue({
        code: 'custom',
        message: 'API_KEY must be environment-specific outside local development',
        path: ['API_KEY'],
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
      environment.BETTER_AUTH_SECRET === LOCAL_BETTER_AUTH_SECRET
    ) {
      context.addIssue({
        code: 'custom',
        message: 'BETTER_AUTH_SECRET must be configured outside local development',
        path: ['BETTER_AUTH_SECRET'],
      });
    }

    if (['production', 'staging'].includes(environment.APP_ENV)) {
      for (const key of [
        'MEDIA_SERVICE_URL',
        'MEDIA_SERVICE_HMAC_SECRET',
        'PUBLIC_MEDIA_ORIGIN',
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
  })
  .transform((environment) => ({
    ...environment,
    ADMIN_BFF_SECRET: environment.API_KEY,
    AUTH_IDENTITY_SECRET: environment.API_KEY,
    STUDENT_BFF_SECRET: environment.API_KEY,
    CORS_ALLOWED_ORIGINS: [environment.ADMIN_URL, environment.STUDENT_URL, environment.VISITOR_URL],
    PUBLIC_MEDIA_ORIGIN: environment.PUBLIC_MEDIA_ORIGIN ?? environment.CORE_URL,
  }));

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(environment: Record<string, unknown>): Environment {
  return environmentSchema.parse(environment);
}
