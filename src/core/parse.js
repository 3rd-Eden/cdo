// @ts-check
import { readFile } from 'node:fs/promises';
import { parse } from '@babel/parser';

/**
 * @param {string} file
 */
export async function parseSourceFile(file) {
  const source = await readFile(file, 'utf8');

  const ast = parse(source, {
    sourceType: 'unambiguous',
    plugins: [
      'jsx',
      'typescript',
      'classProperties',
      'objectRestSpread',
      'optionalChaining',
      'nullishCoalescingOperator',
      'dynamicImport',
      'decorators-legacy'
    ],
    errorRecovery: true,
    allowReturnOutsideFunction: true,
    ranges: true,
    tokens: true
  });

  return { source, ast };
}
