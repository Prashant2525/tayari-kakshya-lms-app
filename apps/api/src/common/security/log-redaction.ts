/** Query parameters whose values must not reach the logs: signed links, gateway payloads, tokens and codes. */
const SECRET_PARAMS = /^(sig|signature|token|data|pidx|code|otp|password|refreshtoken|mfatoken)$/i;

/**
 * A request URL fit for the logs: the path and parameter names stay (useful when debugging), the values of secret
 * parameters are replaced (a receipt's signed link, eSewa's signed payload, Khalti's pidx).
 */
export function redactUrl(url: string): string {
  const q = url.indexOf('?');
  if (q === -1) return url;
  const query = url
    .slice(q + 1)
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const name = eq === -1 ? pair : pair.slice(0, eq);
      let decoded = name;
      try {
        decoded = decodeURIComponent(name);
      } catch {
        // keep the raw name
      }
      return eq !== -1 && SECRET_PARAMS.test(decoded) ? `${name}=[redacted]` : pair;
    })
    .join('&');
  return `${url.slice(0, q)}?${query}`;
}
