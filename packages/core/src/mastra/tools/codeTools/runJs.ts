import * as vm from 'node:vm';

const normalizeCode = (code: string): string =>
  code
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .replace(/\bexport\s+(?=(?:const|let|var|async\s+function|function|class)\b)/g, '');

export const runJs = async (
  code: string,
  contextValues: Record<string, unknown>
): Promise<unknown> => {
  const source = `
    (async () => {
      'use strict';
      ${normalizeCode(code)}
      if (typeof run !== 'function') {
        throw new Error('Code snippet must export a run function');
      }
      return await run();
    })()
  `;
  const script = new vm.Script(source, { filename: 'code-snippet.js' });
  return await script.runInContext(vm.createContext(contextValues), { timeout: 1_000 });
};
