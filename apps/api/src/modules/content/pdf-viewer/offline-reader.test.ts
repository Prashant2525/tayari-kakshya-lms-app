import { describe, expect, it } from 'vitest';
import { inlineModule, offlineReader, offlineReaderHtml } from './offline-reader.js';

describe('offline PDF reader (D-067)', () => {
  it('turns a pdf.js module build into an inline script', () => {
    const code = 'const a=1;globalThis.pdfjsLib={a};const s="</script>";export{a as getDocument};\n';
    const inlined = inlineModule(code, 'pdfjsLib');
    expect(inlined).not.toContain('export{');
    expect(inlined).not.toContain('</script');
    expect(inlined).toContain('globalThis.pdfjsLib={a}');
    // A build that no longer sets the global (a pdf.js change) fails loudly instead of shipping a broken reader.
    expect(() => inlineModule('export{a};', 'pdfjsLib')).toThrow();
    expect(() => inlineModule('globalThis.pdfjsLib={};export{a};export{b};', 'pdfjsLib')).toThrow();
  });

  it('builds one page with no outside resources', async () => {
    const html = offlineReaderHtml(
      'globalThis.pdfjsLib={};export{x};',
      'globalThis.pdfjsWorker={};export{y};',
    );
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/\ssrc=|<link/);
    expect(html.indexOf('pdfjsWorker')).toBeLessThan(html.indexOf('pdfjsLib'));

    // The real pdf.js build: stable version for the same page.
    const [a, b] = await Promise.all([offlineReader(), offlineReader()]);
    expect(a.version).toBe(b.version);
    expect(a.html).not.toMatch(/(^|[;}\s])export\s*\{/);
  });
});
