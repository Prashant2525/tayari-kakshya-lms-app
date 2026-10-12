/**
 * Production start-up check for the website's server settings (deployment guide §10). Without it a missing value
 * silently falls back to http://localhost (src/lib/env.ts) and the site fails only when visitors arrive.
 * Messages name the variable, never its value.
 */
export function websiteEnvProblems(env: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  const url = (name: string, opts: { https?: boolean; required?: boolean }) => {
    const value = env[name]?.trim();
    if (!value) {
      if (opts.required) problems.push(`${name} is required`);
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      problems.push(`${name} is not a valid address`);
      return;
    }
    // A production build tried out on this computer (browser tests, `next start`) may use http://localhost.
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (opts.https && parsed.protocol !== 'https:' && !loopback)
      problems.push(`${name} must start with https://`);
  };
  // How this server reaches the API (an internal address such as http://api:4000 is fine).
  url('API_BASE_URL', { required: true });
  // The site's own public address: Secure cookies, canonical links and payment returns depend on it.
  url('PUBLIC_WEB_URL', { required: true, https: true });
  // What students' browsers use for receipt links; empty = API_BASE_URL, which must then be public.
  url('API_PUBLIC_URL', { https: true });
  return problems;
}
