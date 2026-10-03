import globals from 'globals';
import base from '@tk/config/eslint';

export default [...base, { files: ['src/**/*.mjs'], languageOptions: { globals: { ...globals.node } } }];
