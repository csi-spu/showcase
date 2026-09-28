import library from '@showcase/eslint-config/library';

export default [{ ignores: ['dist/**'] }, ...library({ tsconfigRootDir: import.meta.dirname })];
