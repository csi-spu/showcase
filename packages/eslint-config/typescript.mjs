import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/** @type {NonNullable<import('typescript-eslint').ConfigWithExtends['rules']>} */
export const strictTypeScriptRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
};

export const recommendedTypeScriptConfig = [
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
];

/**
 * @param {string} tsconfigRootDir
 */
export function typeAwareLanguageOptions(tsconfigRootDir) {
  return {
    parserOptions: {
      projectService: true,
      tsconfigRootDir,
    },
  };
}
