// @ts-check
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * @param {string} cwd
 * @param {string[]} args
 */
export async function git(cwd, args) {
  await execFileAsync('git', ['-C', cwd, ...args]);
}

/**
 * @param {{ name?: string, email?: string, files: Array<{ path: string, content: string }> }} options
 */
export async function createRepo(options) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cdo-test-'));

  await git(root, ['init']);
  await git(root, ['config', 'user.name', options.name ?? 'Test Author']);
  await git(root, ['config', 'user.email', options.email ?? 'author@example.com']);

  for (const file of options.files) {
    const filePath = path.join(root, file.path);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, 'utf8');
  }

  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', 'initial']);

  return root;
}

/**
 * @param {string[]} args
 * @param {string} cwd
 */
export async function runNode(args, cwd) {
  const { stdout, stderr } = await execFileAsync(process.execPath, args, { cwd });
  return { stdout, stderr };
}
