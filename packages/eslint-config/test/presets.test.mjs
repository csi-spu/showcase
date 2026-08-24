import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import library from '../library.mjs';
import nestjs from '../nestjs.mjs';
import next from '../next.mjs';

const STRICT_TYPESCRIPT_RULES = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
};

/** @typedef {import('typescript-eslint').ConfigArray[number]} FlatConfigEntry */

/**
 * @param {FlatConfigEntry[]} config
 * @param {string} ruleName
 */
function configuredRule(config, ruleName) {
  for (let index = config.length - 1; index >= 0; index -= 1) {
    const configuredValue = config[index]?.rules?.[ruleName];
    if (configuredValue !== undefined) {
      return configuredValue;
    }
  }

  return undefined;
}

/** @param {FlatConfigEntry[]} config */
function pluginNames(config) {
  return config.flatMap((entry) => Object.keys(entry.plugins ?? {}));
}

test('next preset retains Core Web Vitals, TypeScript, and generated-file ignores', () => {
  assert.ok(next.some((entry) => entry.name === 'next/core-web-vitals'));
  assert.ok(next.some((entry) => entry.name === 'next/typescript'));

  const ignoredPaths = next.flatMap((entry) => entry.ignores ?? []);
  assert.deepEqual(
    new Set(ignoredPaths),
    new Set(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
  );
  assert.equal(configuredRule(next, '@typescript-eslint/no-explicit-any'), 'error');
});

test('nestjs preset retains type-aware Core rules and runtime globals', () => {
  const tsconfigRootDir = fileURLToPath(new URL('../../core/', import.meta.url));
  const config = nestjs({ tsconfigRootDir });

  assert.ok(
    config.some(
      (entry) =>
        entry.languageOptions?.parserOptions?.projectService === true &&
        entry.languageOptions.parserOptions.tsconfigRootDir === tsconfigRootDir,
    ),
  );
  assert.ok(
    config.some(
      (entry) =>
        entry.languageOptions?.sourceType === 'commonjs' &&
        entry.languageOptions.globals?.process !== undefined &&
        entry.languageOptions.globals?.jest !== undefined,
    ),
  );
  assert.ok(pluginNames(config).includes('prettier'));
  assert.ok(config.some((entry) => entry.ignores?.includes('eslint.config.mjs')));

  for (const [ruleName, severity] of Object.entries(STRICT_TYPESCRIPT_RULES)) {
    assert.equal(configuredRule(config, ruleName), severity);
  }
});

test('library preset is strict, type-aware, and framework-neutral', () => {
  const tsconfigRootDir = fileURLToPath(new URL('fixtures/library/', import.meta.url));
  const config = library({ tsconfigRootDir });

  assert.ok(
    config.some(
      (entry) =>
        entry.languageOptions?.parserOptions?.projectService === true &&
        entry.languageOptions.parserOptions.tsconfigRootDir === tsconfigRootDir,
    ),
  );
  assert.ok(config.some((entry) => entry.ignores?.includes('eslint.config.mjs')));

  for (const [ruleName, severity] of Object.entries(STRICT_TYPESCRIPT_RULES)) {
    assert.equal(configuredRule(config, ruleName), severity);
  }

  assert.ok(
    pluginNames(config).every(
      (pluginName) => !['@next/next', 'react', 'react-hooks', 'prettier'].includes(pluginName),
    ),
  );
  assert.ok(config.every((entry) => entry.languageOptions?.globals === undefined));
  assert.ok(config.every((entry) => entry.languageOptions?.sourceType !== 'commonjs'));
});
