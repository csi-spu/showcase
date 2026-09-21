import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const DEPLOYABLE_APPLICATIONS = [
  { app: 'core', dockerfile: 'apps/core/Dockerfile', package: '@showcase/core' },
  { app: 'admin', dockerfile: 'apps/admin/Dockerfile', package: '@showcase/admin' },
  { app: 'instructor', dockerfile: 'apps/instructor/Dockerfile', package: '@showcase/instructor' },
  { app: 'student', dockerfile: 'apps/student/Dockerfile', package: '@showcase/student' },
  {
    app: 'student-collection',
    dockerfile: 'apps/student-collection/Dockerfile',
    package: '@showcase/student-collection',
  },
  { app: 'visitor', dockerfile: 'apps/visitor/Dockerfile', package: '@showcase/visitor' },
  { app: 'media', dockerfile: 'apps/media/Dockerfile', package: '@showcase/media' },
];

export function createDeploymentPlan({
  isInitialPush = false,
  requestedApps,
  sourceSha,
  turboPackages = [],
}) {
  if (!/^[0-9a-f]{40}$/u.test(sourceSha)) throw new Error('SOURCE_SHA_INVALID');
  const deployableAppNames = new Set(DEPLOYABLE_APPLICATIONS.map(({ app }) => app));
  if (requestedApps?.some((app) => !deployableAppNames.has(app)) === true) {
    throw new Error('DEPLOYMENT_APP_INVALID');
  }
  const requestedAppNames = requestedApps === undefined ? null : new Set(requestedApps);
  const affectedPackages = new Set(turboPackages);
  const matrix = DEPLOYABLE_APPLICATIONS.filter(
    (application) =>
      isInitialPush ||
      requestedAppNames?.has(application.app) === true ||
      affectedPackages.has(application.package),
  );
  return {
    apps: matrix.map(({ app }) => app),
    matrix,
    sourceSha,
    version: 1,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      all: { type: 'boolean' },
      'apps-json': { type: 'string' },
      output: { type: 'string' },
      'source-sha': { type: 'string' },
      'turbo-json': { type: 'string' },
    },
    strict: true,
  });
  if (values.output === undefined || values['source-sha'] === undefined) {
    throw new Error('USAGE: --source-sha <sha> --output <path> (--all | --turbo-json <path>)');
  }
  const inputCount = [
    values.all === true,
    values['apps-json'] !== undefined,
    values['turbo-json'] !== undefined,
  ].filter(Boolean).length;
  if (inputCount > 1) {
    throw new Error('DEPLOYMENT_PLAN_INPUT_CONFLICT');
  }
  if (inputCount === 0) {
    throw new Error('DEPLOYMENT_PLAN_INPUT_REQUIRED');
  }

  let turboPackages = [];
  let requestedApps;
  if (values['apps-json'] !== undefined) {
    requestedApps = JSON.parse(values['apps-json']);
    if (
      !Array.isArray(requestedApps) ||
      requestedApps.length === 0 ||
      requestedApps.some((app) => typeof app !== 'string')
    ) {
      throw new Error('DEPLOYMENT_APPS_INVALID');
    }
  }
  if (values['turbo-json'] !== undefined) {
    const dryRun = JSON.parse(await readFile(values['turbo-json'], 'utf8'));
    if (!Array.isArray(dryRun.tasks)) throw new Error('TURBO_DRY_RUN_INVALID');
    turboPackages = dryRun.tasks.map((task) => {
      if (typeof task?.package !== 'string') throw new Error('TURBO_DRY_RUN_INVALID');
      return task.package;
    });
  }
  const plan = createDeploymentPlan({
    isInitialPush: values.all === true,
    requestedApps,
    sourceSha: values['source-sha'],
    turboPackages,
  });
  await writeFile(values.output, `${JSON.stringify(plan)}\n`, { encoding: 'utf8', flag: 'wx' });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
