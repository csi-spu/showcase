import { createLocalAccountIssuer } from '../../apps/core/node_modules/better-auth/dist/db/index.mjs';
import { betterAuth } from '../../apps/core/node_modules/better-auth/dist/index.mjs';
import { prismaAdapter } from '../../apps/core/node_modules/@better-auth/prisma-adapter/dist/index.mjs';
import { PrismaClient } from '../../apps/core/node_modules/@prisma/client/index.js';

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.BETTER_AUTH_SECRET ?? 'local-development-only-better-auth-secret';
if (databaseUrl === undefined) throw new Error('E2E_FIXTURE_DATABASE_URL_REQUIRED');

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const auth = betterAuth({
  appName: 'Student Showcase E2E',
  baseURL: process.env.BETTER_AUTH_BASE_URL ?? 'http://127.0.0.1:4100',
  database: prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),
  secret,
  emailAndPassword: { enabled: true, disableSignUp: true },
  advanced: { database: { generateId: 'uuid' }, useSecureCookies: false },
});

const command = process.argv[2];
const identity = process.argv[3];
const password = process.argv[4];
if (typeof identity !== 'string') throw new Error('E2E_FIXTURE_IDENTITY_REQUIRED');
const context = await auth.$context;

if (command === 'create') {
  const existing = await context.internalAdapter.findUserByEmail(identity, {
    includeAccounts: true,
  });
  if (existing !== null) {
    process.stdout.write(existing.user.id);
  } else {
    const user = await context.internalAdapter.createUser({
      email: identity,
      emailVerified: true,
      name: identity,
    });
    await context.internalAdapter.createAccount({
      accountId: user.id,
      issuer: createLocalAccountIssuer('credential'),
      password: await context.password.hash(password ?? ''),
      providerId: 'credential',
      userId: user.id,
    });
    process.stdout.write(user.id);
  }
} else if (command === 'delete') {
  await context.internalAdapter.deleteUser(identity);
} else if (command === 'exists') {
  const byEmail = await context.internalAdapter.findUserByEmail(identity);
  if (byEmail?.user?.id) process.stdout.write(byEmail.user.id);
  else {
    const byId = await context.internalAdapter.findUserById?.(identity);
    if (byId?.id) process.stdout.write(byId.id);
  }
} else {
  throw new Error('E2E_FIXTURE_COMMAND_INVALID');
}

await prisma.$disconnect();
