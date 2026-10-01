import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCss } from './css.js';

writeFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), buildCss());
