import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import {
  recommendedTypeScriptConfig,
  strictTypeScriptRules,
  typeAwareLanguageOptions,
} from './typescript.mjs';

/**
 * @param {{ tsconfigRootDir: string }} options
 */
export default function nestjs({ tsconfigRootDir }) {
  return tseslint.config(
    {
      ignores: ['eslint.config.mjs'],
    },
    ...recommendedTypeScriptConfig,
    eslintPluginPrettierRecommended,
    {
      languageOptions: {
        ...typeAwareLanguageOptions(tsconfigRootDir),
        globals: {
          ...globals.node,
          ...globals.jest,
        },
        sourceType: 'commonjs',
      },
    },
    {
      rules: strictTypeScriptRules,
    },
  );
}
