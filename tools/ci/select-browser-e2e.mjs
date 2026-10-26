import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const SPEC_DIRECTORY = 'tools/playwright';

// Browser applications each journey drives. Core backs every journey, so it is implied.
const SPEC_APPLICATIONS = {
  'collection-deletion.spec.ts': ['@showcase/instructor', '@showcase/student-collection'],
  'collection-first-login-deeplink.spec.ts': ['@showcase/student-collection'],
  'collection-form-sharing.spec.ts': ['@showcase/instructor', '@showcase/student-collection'],
  'collection-lifecycle.spec.ts': ['@showcase/instructor', '@showcase/student-collection'],
  'collection-member-selection.spec.ts': ['@showcase/instructor'],
  'collection-milestone-3.spec.ts': ['@showcase/instructor', '@showcase/student-collection'],
  'collection-milestone-4.spec.ts': ['@showcase/instructor', '@showcase/student-collection'],
  'profile-consent.spec.ts': ['@showcase/student', '@showcase/visitor'],
  'work-lifecycle.spec.ts': ['@showcase/admin', '@showcase/student', '@showcase/visitor'],
};

// Changes that can alter every journey: the shared API and the harness itself.
const FULL_RUN_PACKAGES = new Set(['@showcase/core']);
const FULL_RUN_PATHS = [
  /^tools\/playwright\//u,
  /^playwright\.config\.ts$/u,
  /^\.github\/workflows\/ci\.yml$/u,
  /^\.github\/actions\//u,
];

export function selectBrowserE2ESpecs({
  affectedPackages = [],
  changedFiles = [],
  isFullRun = false,
  specFiles,
}) {
  const mappedSpecs = Object.keys(SPEC_APPLICATIONS);
  const unmappedSpec = specFiles.find((spec) => !Object.hasOwn(SPEC_APPLICATIONS, spec));
  if (unmappedSpec !== undefined) throw new Error(`BROWSER_E2E_SPEC_UNMAPPED: ${unmappedSpec}`);
  const missingSpec = mappedSpecs.find((spec) => !specFiles.includes(spec));
  if (missingSpec !== undefined) throw new Error(`BROWSER_E2E_SPEC_MISSING: ${missingSpec}`);

  const affected = new Set(affectedPackages);
  const isEverySpecSelected =
    isFullRun ||
    affectedPackages.some((name) => FULL_RUN_PACKAGES.has(name)) ||
    changedFiles.some((file) => FULL_RUN_PATHS.some((pattern) => pattern.test(file)));
  return mappedSpecs
    .filter(
      (spec) => isEverySpecSelected || SPEC_APPLICATIONS[spec].some((name) => affected.has(name)),
    )
    .map((spec) => `${SPEC_DIRECTORY}/${spec}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      all: { type: 'boolean' },
      'changed-files': { type: 'string' },
      'turbo-json': { type: 'string' },
    },
    strict: true,
  });
  const isFullRun = values.all === true;
  const hasAffectedInput =
    values['changed-files'] !== undefined && values['turbo-json'] !== undefined;
  if (isFullRun === hasAffectedInput) {
    throw new Error('USAGE: --all | --turbo-json <path> --changed-files <path>');
  }

  let affectedPackages = [];
  let changedFiles = [];
  if (hasAffectedInput) {
    const turboList = JSON.parse(await readFile(values['turbo-json'], 'utf8'));
    if (!Array.isArray(turboList?.packages?.items)) throw new Error('TURBO_LS_INVALID');
    affectedPackages = turboList.packages.items.map((item) => {
      if (typeof item?.name !== 'string') throw new Error('TURBO_LS_INVALID');
      return item.name;
    });
    changedFiles = (await readFile(values['changed-files'], 'utf8'))
      .split('\n')
      .filter((line) => line !== '');
  }
  const specFiles = (await readdir(SPEC_DIRECTORY)).filter((file) => file.endsWith('.spec.ts'));
  const specs = selectBrowserE2ESpecs({ affectedPackages, changedFiles, isFullRun, specFiles });
  process.stdout.write(`${JSON.stringify(specs)}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
