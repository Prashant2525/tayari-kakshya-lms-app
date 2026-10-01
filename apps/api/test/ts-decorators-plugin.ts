import ts from 'typescript';
import type { Plugin } from 'vite';

/**
 * Transpiles TypeScript with the official compiler so NestJS decorator metadata is emitted in tests.
 * (Vite's default transform does not emit `design:paramtypes`; native SWC is blocked on some dev machines.)
 */
export function tsDecorators(): Plugin {
  return {
    name: 'tk-ts-decorators',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!id.endsWith('.ts') || id.includes('node_modules')) return null;
      const out = ts.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.ESNext,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          useDefineForClassFields: false,
          sourceMap: true,
          inlineSources: true,
        },
      });
      return { code: out.outputText, map: out.sourceMapText ?? null };
    },
  };
}
