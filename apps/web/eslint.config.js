import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import base from '@tk/config/eslint';

export default [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...base,
  { files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
];
