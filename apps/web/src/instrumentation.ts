import { websiteEnvProblems } from './lib/env-check';

/** Runs once when the Next.js server starts (not during `next build`): refuse to serve with broken settings. */
export function register() {
  if (process.env['NEXT_RUNTIME'] !== 'nodejs' || process.env['NODE_ENV'] !== 'production') return;
  const problems = websiteEnvProblems(process.env);
  if (problems.length) {
    throw new Error(
      `Website settings are incomplete:\n  - ${problems.join('\n  - ')}\n` +
        'See docs/ENVIRONMENT_AND_PRODUCTION_DEPLOYMENT_GUIDE.md (website).',
    );
  }
}
