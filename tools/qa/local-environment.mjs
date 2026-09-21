export function assertLocalEnvironment(environment) {
  const fail = () => {
    throw new Error('QA_LOCAL_CONFIGURATION_REQUIRED');
  };
  if (environment.APP_ENV !== 'development' || environment.NODE_ENV === 'production') fail();
  let database;
  let core;
  try {
    database = new URL(environment.DATABASE_URL);
    core = new URL(environment.CORE_URL);
  } catch {
    fail();
  }
  const isLoopback = (url) => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (
    !isLoopback(database) ||
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    database.search ||
    database.hash
  )
    fail();
  if (!isLoopback(core) || core.protocol !== 'http:' || core.origin !== environment.CORE_URL)
    fail();
  if (
    !environment.API_KEY ||
    environment.API_KEY.length < 32 ||
    !environment.BETTER_AUTH_SECRET ||
    environment.BETTER_AUTH_SECRET.length < 32
  )
    fail();
  return environment;
}
