// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import { createRepo, runNode } from './support/helpers.js';
import pkg from '../package.json' with { type: 'json' };

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('cli learn/guide/config/apply flows end-to-end', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `/** test */\nfunction noop() {\n  if (true) return 'x';\n  //comment\n  return 'y';\n}\n`
      },
      {
        path: 'typed.ts',
        content: `export function typed(input: string): string {\n  return input;\n}\n`
      }
    ]
  });

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'cdo-out-'));
  const profilePath = path.join(tmp, 'profile.json');
  const guidePath = path.join(tmp, 'STYLEGUIDE.cdo.md');
  const configDir = path.join(tmp, '.cdo');
  const reportPath = path.join(tmp, 'apply-report.json');
  const iterationPath = path.join(tmp, 'iteration-report.json');

  await runNode(['./src/cli.js', 'learn', '--repos', repo, '--author', 'author@example.com', '--out', profilePath], ROOT);
  await access(profilePath);

  await runNode(['./src/cli.js', 'guide', '--profile', profilePath, '--out', guidePath], ROOT);
  await access(guidePath);

  await runNode(['./src/cli.js', 'config', '--profile', profilePath, '--out-dir', configDir], ROOT);
  await access(path.join(configDir, 'biome.json'));
  await access(path.join(tmp, 'AGENTS.md'));

  const apply = await runNode(
    ['./src/cli.js', 'apply', '--profile', profilePath, '--repos', repo, '--report', reportPath],
    ROOT
  );

  const report = JSON.parse(apply.stdout);
  assert.equal(report.engine, 'biome');
  assert.equal(report.write, false);
  assert.ok(report.filesScanned >= 1);

  const safeOnlyApply = await runNode(
    ['./src/cli.js', 'apply', '--safe-only', '--profile', profilePath, '--repos', repo],
    ROOT
  );
  const safeOnlyReport = JSON.parse(safeOnlyApply.stdout);
  assert.equal(safeOnlyReport.engine, 'biome');

  await runNode(
    ['./src/cli.js', 'report', '--profile', profilePath, '--apply-report', reportPath, '--out', iterationPath],
    ROOT
  );
  await access(iterationPath);

  const guide = await readFile(guidePath, 'utf8');
  assert.match(guide, /CDO Style Guide/);
});

test('cli learn validates numeric and enum flags', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [{ path: 'index.js', content: 'const value = 1;\n' }]
  });

  await assert.rejects(
    async () => runNode(['./src/cli.js', 'learn', '--repos', repo, '--min-confidence', '2'], ROOT),
    /Invalid --min-confidence/
  );

  await assert.rejects(
    async () => runNode(['./src/cli.js', 'learn', '--repos', repo, '--max-files', '0'], ROOT),
    /Invalid --max-files/
  );

  await assert.rejects(
    async () => runNode(['./src/cli.js', 'learn', '--repos', repo, '--inference', 'magic'], ROOT),
    /Invalid --inference value/
  );

  await assert.rejects(
    async () => runNode(['./src/cli.js', 'learn', '--repos', repo, '--llm-sample', 'everything'], ROOT),
    /Invalid --llm-sample value/
  );
});

test('cli exposes package version', async () => {
  const result = await runNode(['./src/cli.js', '--version'], ROOT);
  assert.equal(result.stdout.trim(), pkg.version);
});
