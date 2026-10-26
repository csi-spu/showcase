import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import test from 'node:test';
import { selectBrowserE2ESpecs } from './select-browser-e2e.mjs';

const SPEC_FILES = readdirSync('tools/playwright').filter((file) => file.endsWith('.spec.ts'));
const ALL_SPECS = SPEC_FILES.toSorted().map((file) => `tools/playwright/${file}`);

test('maps every Playwright specification to the applications it drives', () => {
  assert.deepEqual(
    selectBrowserE2ESpecs({ isFullRun: true, specFiles: SPEC_FILES }).toSorted(),
    ALL_SPECS,
  );
});

test('selects only the journeys that drive an affected application', () => {
  assert.deepEqual(
    selectBrowserE2ESpecs({ affectedPackages: ['@showcase/admin'], specFiles: SPEC_FILES }),
    ['tools/playwright/work-lifecycle.spec.ts'],
  );
  assert.deepEqual(
    selectBrowserE2ESpecs({ affectedPackages: ['@showcase/visitor'], specFiles: SPEC_FILES }),
    ['tools/playwright/profile-consent.spec.ts', 'tools/playwright/work-lifecycle.spec.ts'],
  );
  assert.deepEqual(
    selectBrowserE2ESpecs({
      affectedPackages: ['@showcase/student-collection'],
      specFiles: SPEC_FILES,
    }),
    [
      'tools/playwright/collection-deletion.spec.ts',
      'tools/playwright/collection-first-login-deeplink.spec.ts',
      'tools/playwright/collection-form-sharing.spec.ts',
      'tools/playwright/collection-lifecycle.spec.ts',
      'tools/playwright/collection-milestone-3.spec.ts',
      'tools/playwright/collection-milestone-4.spec.ts',
    ],
  );
});

test('skips browser journeys when no driven application is affected', () => {
  assert.deepEqual(
    selectBrowserE2ESpecs({
      affectedPackages: ['@showcase/media'],
      changedFiles: ['apps/media/src/server.ts', 'docs/infrastructure/ci-cd.md'],
      specFiles: SPEC_FILES,
    }),
    [],
  );
  assert.deepEqual(selectBrowserE2ESpecs({ specFiles: SPEC_FILES }), []);
});

test('runs every journey for a Core change', () => {
  assert.deepEqual(
    selectBrowserE2ESpecs({
      affectedPackages: ['@showcase/core'],
      specFiles: SPEC_FILES,
    }).toSorted(),
    ALL_SPECS,
  );
});

test('runs every journey when the harness or CI environment changes', () => {
  for (const file of [
    'tools/playwright/fixtures.ts',
    'tools/playwright/work-lifecycle.spec.ts',
    'playwright.config.ts',
    '.github/workflows/ci.yml',
    '.github/actions/setup/action.yml',
  ]) {
    assert.deepEqual(
      selectBrowserE2ESpecs({ changedFiles: [file], specFiles: SPEC_FILES }).toSorted(),
      ALL_SPECS,
      file,
    );
  }
});

test('fails closed when a specification is not mapped or a mapping is stale', () => {
  assert.throws(
    () => selectBrowserE2ESpecs({ specFiles: [...SPEC_FILES, 'new-journey.spec.ts'] }),
    /BROWSER_E2E_SPEC_UNMAPPED: new-journey\.spec\.ts/u,
  );
  assert.throws(
    () => selectBrowserE2ESpecs({ specFiles: SPEC_FILES.slice(1) }),
    /BROWSER_E2E_SPEC_MISSING/u,
  );
});
