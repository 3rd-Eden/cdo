// @ts-check
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * @param {string} filePath
 */
export async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * @param {string} filePath
 * @param {unknown} value
 */
export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * @param {string} filePath
 * @param {string} value
 */
export async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, 'utf8');
}
