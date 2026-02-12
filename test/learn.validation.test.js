// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { learnStyle } from '../src/core/learn.js';
import { createRepo } from './support/helpers.js';
import { git } from './support/helpers.js';

test('learnStyle fails fast when author filters exclude all candidate files', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [{ path: 'index.js', content: 'const value = 1;\n' }]
  });

  await assert.rejects(
    async () => learnStyle({
      repoPaths: [repo],
      authorEmails: ['nobody@example.com']
    }),
    /No parsable source files were found/
  );
});

test('learnStyle validates numeric and enum options in API mode', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [{ path: 'index.js', content: 'const value = 1;\n' }]
  });

  await assert.rejects(
    async () => learnStyle({ repoPaths: [repo], maxFilesPerRepo: 0 }),
    /Invalid maxFilesPerRepo/
  );

  await assert.rejects(
    async () => learnStyle({ repoPaths: [repo], minEvidence: 0 }),
    /Invalid minEvidence/
  );

  await assert.rejects(
    async () => learnStyle({ repoPaths: [repo], minConfidence: 2 }),
    /Invalid minConfidence/
  );

  await assert.rejects(
    async () => learnStyle({
      repoPaths: [repo],
      inferenceMode: /** @type {any} */ ('magic')
    }),
    /Invalid inferenceMode/
  );

  await assert.rejects(
    async () => learnStyle({
      repoPaths: [repo],
      llmSamplingMode: /** @type {any} */ ('everything')
    }),
    /Invalid llmSamplingMode/
  );
});

test('learnStyle deduplicates repeated repository paths', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [{ path: 'index.js', content: 'const value = 1;\n' }]
  });

  const profile = await learnStyle({
    repoPaths: [repo, repo],
    authorEmails: ['author@example.com']
  });

  assert.equal(profile.sources.roots.length, 1);
  assert.equal(profile.sampleWindow.perRepo.length, 1);
});

test('learnStyle reports empty repositories without commits cleanly', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cdo-learn-empty-'));
  await git(root, ['init']);
  await assert.rejects(
    async () => learnStyle({ repoPaths: [root] }),
    /No parsable source files were found/
  );
});

test('learnStyle excludes test-like files when inferring function expression naming preference', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `const one = function run() {\n  return true;\n};\n\nconst two = function done() {\n  return one();\n};\n\nmodule.exports = two;\n`
      },
      {
        path: 'test.js',
        content: `describe('x', function () {\n  it('works', function () {\n    setTimeout(function () {\n      done();\n    }, 1);\n  });\n});\n`
      }
    ]
  });

  const profile = await learnStyle({
    repoPaths: [repo],
    authorEmails: ['author@example.com'],
    minEvidence: 1,
    minConfidence: 0.5
  });

  assert.equal(profile.rules.naming.functionExpressionNamingPreference.value, 'named');
});
