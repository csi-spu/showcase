import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';

const ci = YAML.parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
const buildImage = YAML.parse(readFileSync('.github/workflows/build-image.yml', 'utf8'));
const production = YAML.parse(readFileSync('.github/workflows/production.yml', 'utf8'));

test('CI publishes the Turbo-derived deployment plan for a successful main push', () => {
  const steps = ci.jobs.quality.steps;
  assert.ok(steps.some((step) => step.name === 'Create deployment plan'));
  assert.ok(steps.some((step) => step.name === 'Upload deployment plan'));
});

test('production consumes the CI plan and builds only its application matrix', () => {
  assert.deepEqual(production.on.workflow_run.workflows, ['CI']);
  assert.equal(
    production.jobs.build.strategy.matrix,
    '${{ fromJSON(needs.resolve-plan.outputs.matrix) }}',
  );
  assert.match(production.jobs['deploy-media'].if, /contains\(fromJSON\(.+apps\), 'media'\)/u);
  assert.match(production.jobs['deploy-core'].if, /contains\(fromJSON\(.+apps\), 'core'\)/u);
  assert.match(
    production.jobs['deploy-instructor'].if,
    /contains\(fromJSON\(.+apps\), 'instructor'\)/u,
  );
  assert.match(production.jobs['deploy-student'].if, /contains\(fromJSON\(.+apps\), 'student'\)/u);
  assert.match(
    production.jobs['deploy-student-collection'].if,
    /contains\(fromJSON\(.+apps\), 'student-collection'\)/u,
  );
});

test('a Core deployment updates every Core-image worker before frontends', () => {
  const workerJobs = [
    'deploy-cache-worker',
    'deploy-collection-export-builder',
    'deploy-collection-file-inspector',
    'deploy-collection-reminder-dispatcher',
    'deploy-media-processor',
  ];

  for (const jobName of workerJobs) {
    const job = production.jobs[jobName];
    assert.ok(job, `${jobName} must exist`);
    assert.match(job.if, /contains\(fromJSON\(.+apps\), 'core'\)/u);
    assert.equal(job.with.image_tag, 'sha-${{ needs.resolve-plan.outputs.source_sha }}');
  }
  assert.equal(
    production.jobs['deploy-collection-export-builder'].with.application_uuid,
    '${{ vars.COOLIFY_PRODUCTION_COLLECTION_EXPORT_BUILDER }}',
  );
  assert.equal(
    production.jobs['deploy-collection-file-inspector'].with.application_uuid,
    '${{ vars.COOLIFY_PRODUCTION_COLLECTION_FILE_INSPECTOR }}',
  );
  assert.equal(
    production.jobs['deploy-collection-reminder-dispatcher'].with.application_uuid,
    '${{ vars.COOLIFY_PRODUCTION_COLLECTION_REMINDER_DISPATCHER }}',
  );

  for (const frontend of [
    'deploy-admin',
    'deploy-instructor',
    'deploy-student',
    'deploy-student-collection',
    'deploy-visitor',
  ]) {
    assert.ok(production.jobs[frontend].needs.includes('deploy-collection-export-builder'));
    assert.match(production.jobs[frontend].if, /needs\.deploy-collection-export-builder\.result/u);
    assert.ok(production.jobs[frontend].needs.includes('deploy-collection-file-inspector'));
    assert.match(production.jobs[frontend].if, /needs\.deploy-collection-file-inspector\.result/u);
    assert.ok(production.jobs[frontend].needs.includes('deploy-collection-reminder-dispatcher'));
    assert.match(
      production.jobs[frontend].if,
      /needs\.deploy-collection-reminder-dispatcher\.result/u,
    );
  }
});

test('staging is not part of the current delivery workflow', () => {
  assert.equal(existsSync('.github/workflows/staging.yml'), false);
});

test('production image builds provide Sentry source-map configuration without a token build arg', () => {
  assert.equal(buildImage.on.workflow_call.secrets.SENTRY_AUTH_TOKEN.required, true);
  assert.equal(production.jobs.build.with.sentry_org, '${{ vars.SENTRY_ORG }}');
  assert.match(production.jobs.build.with.sentry_dsn, /SENTRY_DSN_ADMIN/u);
  assert.match(production.jobs.build.with.sentry_dsn, /SENTRY_DSN_INSTRUCTOR/u);
  assert.match(production.jobs.build.with.sentry_dsn, /SENTRY_DSN_STUDENT_COLLECTION/u);
  assert.equal(production.jobs.build.secrets.SENTRY_AUTH_TOKEN, '${{ secrets.SENTRY_AUTH_TOKEN }}');

  const buildStep = buildImage.jobs.build.steps.find(
    (step) => step.name === 'Build and push immutable image',
  );
  assert.match(buildStep.with['build-args'], /SENTRY_ORG=/u);
  assert.match(buildStep.with['build-args'], /NEXT_PUBLIC_SENTRY_DSN=/u);
  assert.match(buildStep.with.secrets, /sentry-auth-token=/u);
  assert.doesNotMatch(buildStep.with['build-args'], /SENTRY_AUTH_TOKEN/u);
});
