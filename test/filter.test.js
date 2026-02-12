// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { git } from './support/helpers.js';
import { filesTouchedByAuthors, topAuthorEmail } from '../src/core/filter.js';

test('filesTouchedByAuthors handles regex-like characters in author emails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cdo-filter-'));
  await git(root, ['init']);

  await git(root, ['config', 'user.name', 'Plus Author']);
  await git(root, ['config', 'user.email', 'dev+style@example.com']);
  await writeFile(path.join(root, 'plus.js'), 'export const plus = true;\n', 'utf8');
  await git(root, ['add', 'plus.js']);
  await git(root, ['commit', '-m', 'plus']);

  await git(root, ['config', 'user.name', 'Base Author']);
  await git(root, ['config', 'user.email', 'devstyle@example.com']);
  await writeFile(path.join(root, 'base.js'), 'export const base = true;\n', 'utf8');
  await git(root, ['add', 'base.js']);
  await git(root, ['commit', '-m', 'base']);

  const touched = await filesTouchedByAuthors(root, ['dev+style@example.com']);
  assert.deepEqual([...touched].sort(), ['plus.js']);
});

test('topAuthorEmail returns null for repositories with no commits', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cdo-filter-empty-'));
  await git(root, ['init']);
  await git(root, ['config', 'user.name', 'No Commit']);
  await git(root, ['config', 'user.email', 'none@example.com']);

  const email = await topAuthorEmail(root);
  assert.equal(email, null);
});
