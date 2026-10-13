import { z } from 'zod';

// The CMS's Content-Security-Policy allows no eval (infra/production/Caddyfile). Zod probes `new Function` when it
// first builds a schema, which the browser reports as a violation even though Zod copes; `jitless` skips the probe.
// Imported first by main.tsx so it runs before any module creates a schema (Phase 18).
z.config({ jitless: true });
