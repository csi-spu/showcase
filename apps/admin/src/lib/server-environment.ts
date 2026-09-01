import 'server-only';
import { z } from 'zod';

const serverEnvironmentSchema = z.object({
  API_KEY: z.string().min(32),
  CORE_URL: z.url().transform((value) => new URL(value).origin),
});

export interface AdminServerEnvironment {
  adminBffSecret: string;
  coreUrl: string;
}

export function getAdminServerEnvironment(): AdminServerEnvironment {
  const isProduction = process.env.NODE_ENV === 'production';
  const environment = serverEnvironmentSchema.parse({
    API_KEY:
      process.env.API_KEY ??
      (isProduction ? undefined : 'local-development-only-admin-bff-secret'),
    CORE_URL: process.env.CORE_URL ?? (isProduction ? undefined : 'http://localhost:4100'),
  });
  return {
    adminBffSecret: environment.API_KEY,
    coreUrl: environment.CORE_URL,
  };
}
