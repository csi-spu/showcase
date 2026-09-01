// BetterAuth publishes ESM-only runtime modules. Unit tests run in Jest's CJS
// transform and replace the provider seam; the real engine is exercised by the
// migration smoke and media/auth integration checks.
jest.mock('better-auth', () => ({
  betterAuth: () => ({
    $context: Promise.resolve({
      internalAdapter: {
        createAccount: jest.fn(),
        createUser: jest.fn(),
        deleteSession: jest.fn(),
        deleteUser: jest.fn(),
        findSession: jest.fn(),
        findUserByEmail: jest.fn(),
        updatePassword: jest.fn(),
      },
      password: { hash: jest.fn().mockResolvedValue('test-hash'), verify: jest.fn() },
    }),
    api: { signInEmail: jest.fn() },
  }),
}));
jest.mock('better-auth/db', () => ({
  createLocalAccountIssuer: jest.fn(() => 'local:credential'),
}));
jest.mock('@better-auth/prisma-adapter', () => ({ prismaAdapter: jest.fn(() => jest.fn()) }));
