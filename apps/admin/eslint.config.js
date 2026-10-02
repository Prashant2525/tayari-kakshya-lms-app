import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import base from '@tk/config/eslint';

export default [
  ...base,
  { files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser } } },
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
];
