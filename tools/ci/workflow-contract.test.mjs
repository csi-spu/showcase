import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';

const ci = YAML.parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
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
  assert.match(production.jobs['deploy-student'].if, /contains\(fromJSON\(.+apps\), 'student'\)/u);
});

test('staging is not part of the current delivery workflow', () => {
  assert.equal(existsSync('.github/workflows/staging.yml'), false);
});
