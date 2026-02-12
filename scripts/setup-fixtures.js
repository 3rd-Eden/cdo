#!/usr/bin/env node
// @ts-check
import path from 'node:path';
import { stat, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

const DEFAULT_REPOS = [
  { name: 'liferaft', url: 'https://github.com/unshiftio/liferaft.git' },
  { name: 'url-parse', url: 'https://github.com/unshiftio/url-parse.git' },
  { name: 'recovery', url: 'https://github.com/unshiftio/recovery.git' }
];

/**
 * @param {string | undefined} value
 */
function listArg(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * @param {string[]} urls
 */
function reposFromUrls(urls) {
  if (!urls.length) return DEFAULT_REPOS;

  return urls.map((url) => {
    const base = url.split('/').pop() ?? 'repo';
    const name = base.endsWith('.git') ? base.slice(0, -4) : base;
    return { name, url };
  });
}

/**
 * @param {string} filePath
 */
async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, capture?: boolean }} [options]
 */
function run(command, args, options = {}) {
  const capture = options.capture ?? false;

  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: capture ? 'utf8' : undefined
  });

  if (result.status !== 0) {
    const stderr = capture && typeof result.stderr === 'string' ? result.stderr.trim() : '';
    const detail = stderr ? `: ${stderr}` : '';
    throw new Error(`${command} ${args.join(' ')} failed${detail}`);
  }

  return capture ? String(result.stdout ?? '') : '';
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string }} [options]
 */
function tryRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8'
  });

  return {
    ok: result.status === 0,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? '')
  };
}

/**
 * @param {{ name: string, url: string }} repo
 * @param {string} fixtureRoot
 */
async function ensureRepo(repo, fixtureRoot) {
  const target = path.resolve(fixtureRoot, repo.name);
  const gitDir = path.join(target, '.git');

  if (!(await exists(gitDir))) {
    run('git', ['clone', repo.url, target]);
    return { repo: repo.name, action: 'cloned', target };
  }

  const origin = run('git', ['-C', target, 'remote', 'get-url', 'origin'], { capture: true }).trim();
  if (origin !== repo.url) {
    run('git', ['-C', target, 'remote', 'set-url', 'origin', repo.url]);
  }

  run('git', ['-C', target, 'fetch', 'origin', '--tags', '--prune']);
  const dirty = run('git', ['-C', target, 'status', '--porcelain'], { capture: true }).trim();
  if (!dirty) {
    const upstream = tryRun('git', ['-C', target, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    const originHead = tryRun('git', ['-C', target, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    const localHead = run('git', ['-C', target, 'rev-parse', '--abbrev-ref', 'HEAD'], { capture: true }).trim();

    const upstreamRef = upstream.ok ? upstream.stdout.trim() : '';
    const originHeadRef = originHead.ok ? originHead.stdout.trim() : '';
    const fallbackRef =
      originHeadRef ||
      (localHead && localHead !== 'HEAD' ? `origin/${localHead}` : 'origin/master');

    run('git', ['-C', target, 'merge', '--ff-only', upstreamRef || fallbackRef]);
    return { repo: repo.name, action: 'updated', target };
  }

  return { repo: repo.name, action: 'skipped-dirty', target };
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    string: ['root', 'repos']
  });

  const fixtureRoot = path.resolve(
    argv.root || process.env.CDO_FIXTURE_ROOT || path.join(PROJECT_ROOT, '.fixtures', 'style-fixtures')
  );

  const repos = reposFromUrls(listArg(argv.repos || process.env.CDO_FIXTURE_REPOS));
  await mkdir(fixtureRoot, { recursive: true });

  /** @type {Array<{ repo: string, action: string, target: string }>} */
  const summary = [];

  for (const repo of repos) {
    const result = await ensureRepo(repo, fixtureRoot);
    summary.push(result);
  }

  process.stdout.write(`Fixture root: ${fixtureRoot}\n`);
  for (const item of summary) {
    process.stdout.write(`- ${item.repo}: ${item.action} (${item.target})\n`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
