import { z } from 'zod';

const environmentSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001,http://localhost:3002')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z.url()).min(1)),
  GIT_SHA: z.string().min(7).default('development'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(4100),
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(environment: Record<string, unknown>): Environment {
  return environmentSchema.parse(environment);
}
