import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeploymentPlan } from './create-deployment-plan.mjs';

const SOURCE_SHA = '1234567890abcdef1234567890abcdef12345678';

test('maps affected Turbo packages to deployable application images', () => {
  assert.deepEqual(
    createDeploymentPlan({
      sourceSha: SOURCE_SHA,
      turboPackages: ['@showcase/ui', '@showcase/student', '@showcase/student', '@showcase/media'],
    }),
    {
      apps: ['student', 'media'],
      matrix: [
        {
          app: 'student',
          dockerfile: 'apps/student/Dockerfile',
          package: '@showcase/student',
        },
        { app: 'media', dockerfile: 'apps/media/Dockerfile', package: '@showcase/media' },
      ],
      sourceSha: SOURCE_SHA,
      version: 1,
    },
  );
});

test('marks every deployable application for an initial push', () => {
  const plan = createDeploymentPlan({ isInitialPush: true, sourceSha: SOURCE_SHA });

  assert.deepEqual(plan.apps, ['core', 'admin', 'student', 'visitor', 'media']);
});

test('creates a canonical plan for an explicit manual deployment selection', () => {
  const plan = createDeploymentPlan({
    requestedApps: ['media', 'core'],
    sourceSha: SOURCE_SHA,
  });

  assert.deepEqual(plan.apps, ['core', 'media']);
  assert.deepEqual(
    plan.matrix.map(({ app }) => app),
    ['core', 'media'],
  );
});

test('rejects an unknown manual deployment application', () => {
  assert.throws(
    () => createDeploymentPlan({ requestedApps: ['database'], sourceSha: SOURCE_SHA }),
    /DEPLOYMENT_APP_INVALID/u,
  );
});

test('rejects an invalid source SHA', () => {
  assert.throws(
    () => createDeploymentPlan({ sourceSha: 'main', turboPackages: [] }),
    /SOURCE_SHA_INVALID/u,
  );
});
