#!/usr/bin/env node
// @ts-check
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, capture?: boolean }} [options]
 */
function run(command, args, options = {}) {
  const capture = options.capture ?? false;
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? PROJECT_ROOT,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: capture ? 'utf8' : undefined
  });

  if (result.status !== 0) {
    const stderr = capture ? String(result.stderr ?? '').trim() : '';
    const detail = stderr ? `\n${stderr}` : '';
    throw new Error(`Command failed: ${command} ${args.join(' ')}${detail}`);
  }

  return capture ? String(result.stdout ?? '') : '';
}

async function main() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'cdo-release-smoke-'));
  const installRoot = path.join(workspace, 'install');
  /** @type {string | null} */
  let tarballPath = null;

  try {
    await mkdir(installRoot, { recursive: true });
    const tarball = run('npm', ['pack', '--silent'], { cwd: PROJECT_ROOT, capture: true }).trim();
    if (!tarball.endsWith('.tgz')) {
      throw new Error(`Unexpected npm pack output: ${tarball}`);
    }

    tarballPath = path.resolve(PROJECT_ROOT, tarball);
    run('npm', ['init', '-y'], { cwd: installRoot, capture: true });
    run('npm', ['install', '--silent', tarballPath], { cwd: installRoot, capture: true });

    const cliVersion = run(
      'node',
      ['-e', "const { execSync } = require('node:child_process');process.stdout.write(execSync('./node_modules/.bin/cdo --version',{encoding:'utf8'}));"],
      { cwd: installRoot, capture: true }
    ).trim();

    if (cliVersion !== pkg.version) {
      throw new Error(`CLI version mismatch. Expected ${pkg.version}, got ${cliVersion}`);
    }

    const apiProbe = run(
      'node',
      [
        '-e',
        "import('cdo').then((mod)=>{const required=['learnStyle','generateGuide','generateConfigs','applyStyle','startMcpServer'];for(const key of required){if(typeof mod[key] !== 'function') throw new Error('Missing export: '+key);}process.stdout.write('ok');}).catch((err)=>{console.error(err);process.exit(1);});"
      ],
      { cwd: installRoot, capture: true }
    ).trim();

    if (apiProbe !== 'ok') {
      throw new Error(`Unexpected API probe result: ${apiProbe}`);
    }

    process.stdout.write(`release-smoke: ok (${tarball})\n`);
  } finally {
    await rm(installRoot, { recursive: true, force: true });
    if (tarballPath) {
      await rm(tarballPath, { force: true });
    }
    await rm(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
