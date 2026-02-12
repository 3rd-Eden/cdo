// @ts-check
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * @param {string} cwd
 * @param {string[]} args
 */
export async function git(cwd, args) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
      maxBuffer: 1024 * 1024 * 20
    });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${message}`);
  }
}

/**
 * @param {string} cwd
 */
export async function isGitRepo(cwd) {
  try {
    await git(cwd, ['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}
