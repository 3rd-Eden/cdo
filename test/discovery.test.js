// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { createRepo } from './support/helpers.js';
import { git } from './support/helpers.js';
import { listTrackedSourceFiles, fileRecencyMap } from '../src/core/discovery.js';

test('listTrackedSourceFiles excludes ignored directories at root and nested levels', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      { path: 'index.js', content: 'export const ok = 1;\n' },
      { path: 'src/app.ts', content: 'export const typed = 2;\n' },
      { path: 'src/legacy.JS', content: 'module.exports = 3;\n' },
      { path: 'dist/generated.js', content: 'export const generated = true;\n' },
      { path: 'coverage/report.js', content: 'export const coverage = true;\n' },
      { path: 'vendor/library.js', content: 'export const vendor = true;\n' },
      { path: 'src/vendor/internal.js', content: 'export const nestedVendor = true;\n' },
      { path: 'node_modules/pkg/index.js', content: 'module.exports = 1;\n' }
    ]
  });

  const files = await listTrackedSourceFiles(repo);

  assert.deepEqual(files.sort(), ['index.js', 'src/app.ts', 'src/legacy.JS']);
});

test('fileRecencyMap returns empty map for repos with no commits', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cdo-discovery-empty-'));
  await git(root, ['init']);
  const recency = await fileRecencyMap(root);
  assert.equal(recency.size, 0);
});
