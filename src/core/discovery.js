// @ts-check
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { git, isGitRepo } from '../util/git.js';

const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const IGNORED_SEGMENTS = new Set(['node_modules', 'dist', 'coverage', 'vendor']);

/**
 * @param {string} file
 */
function hasIgnoredSegment(file) {
  const segments = file.split(/[\\/]+/).filter(Boolean);
  return segments.some((segment) => IGNORED_SEGMENTS.has(segment));
}

/**
 * @param {string[]} repoPaths
 */
export async function resolveRepos(repoPaths) {
  const roots = [];
  const seen = new Set();

  for (const repoPath of repoPaths) {
    const root = path.resolve(repoPath);
    const info = await stat(root);
    if (!info.isDirectory()) {
      throw new Error(`Repository path is not a directory: ${root}`);
    }
    if (!(await isGitRepo(root))) {
      throw new Error(`Repository path is not a git repository: ${root}`);
    }
    if (!seen.has(root)) {
      roots.push(root);
      seen.add(root);
    }
  }

  if (!roots.length) {
    throw new Error('No repositories were provided.');
  }

  return roots;
}

/**
 * @param {string} root
 */
export async function listTrackedSourceFiles(root) {
  const stdout = await git(root, ['ls-files']);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) return false;
      if (hasIgnoredSegment(file)) return false;
      return true;
    });
}

/**
 * Parse git history into a map of file -> first seen recent timestamp.
 * @param {string} root
 */
export async function fileRecencyMap(root) {
  /** @type {Map<string, number>} */
  const recency = new Map();
  let stdout = '';
  try {
    stdout = await git(root, ['log', '--name-only', '--pretty=format:__CDO_COMMIT__%ct']);
  } catch {
    return recency;
  }

  let currentTimestamp = 0;
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    if (line.startsWith('__CDO_COMMIT__')) {
      const parsed = Number.parseInt(line.slice('__CDO_COMMIT__'.length), 10);
      currentTimestamp = Number.isFinite(parsed) ? parsed : 0;
      continue;
    }

    if (!recency.has(line)) {
      recency.set(line, currentTimestamp);
    }
  }

  return recency;
}
