import tseslint from 'typescript-eslint';

import {
  recommendedTypeScriptConfig,
  strictTypeScriptRules,
  typeAwareLanguageOptions,
} from './typescript.mjs';

/**
 * @param {{ tsconfigRootDir: string }} options
 */
export default function library({ tsconfigRootDir }) {
  return tseslint.config(
    {
      ignores: ['eslint.config.mjs'],
    },
    ...recommendedTypeScriptConfig,
    {
      languageOptions: typeAwareLanguageOptions(tsconfigRootDir),
    },
    {
      rules: strictTypeScriptRules,
    },
  );
}
