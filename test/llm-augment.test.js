// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnStyle } from '../src/core/learn.js';
import { createRepo } from './support/helpers.js';

test('learnStyle llm-mcp can augment low-confidence rules via callback', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `function run(a, b) {\n  if (a) return b;\n  return a;\n}\n`
      }
    ]
  });

  const profile = await learnStyle({
    repoPaths: [repo],
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 50,
    minEvidence: 2,
    minConfidence: 0.75,
    inferenceMode: 'llm-mcp',
    llmAugmenter: () => ({
      rules: {
        'syntax.yodaConditions': { value: 'always', confidence: 0.9, evidenceCount: 3 },
        'whitespace.blankLineBeforeReturn': { value: 'always', confidence: 0.92, evidenceCount: 3 },
        'comments.trailingInlineCommentAlignment': { value: 'aligned', confidence: 0.95, evidenceCount: 4 }
      }
    })
  });

  assert.equal(profile.rules.syntax.yodaConditions.value, 'always');
  assert.equal(profile.rules.syntax.yodaConditions.provenance, 'llm_augmented');
  assert.equal(profile.rules.whitespace.blankLineBeforeReturn.value, 'always');
  assert.equal(profile.rules.whitespace.blankLineBeforeReturn.provenance, 'llm_augmented');
  assert.equal(profile.rules.comments.trailingInlineCommentAlignment.value, 'aligned');
  assert.equal(profile.rules.comments.trailingInlineCommentAlignment.provenance, 'llm_augmented');
  assert.equal(profile.evidence.llmRuleSuggestionsApplied, 3);
});

test('learnStyle llm-mcp does not replace stronger enforced deterministic rules', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `const one = 'a';\nconst two = 'b';\nconst three = 'c';\n`
      }
    ]
  });

  const profile = await learnStyle({
    repoPaths: [repo],
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 50,
    minEvidence: 1,
    minConfidence: 0.5,
    inferenceMode: 'llm-mcp',
    llmAugmenter: () => ({
      rules: {
        'syntax.quotes': { value: 'double', confidence: 0.7, evidenceCount: 3 }
      }
    })
  });

  assert.equal(profile.rules.syntax.quotes.value, 'single');
  assert.equal(profile.rules.syntax.quotes.provenance, 'deterministic');
});

test('learnStyle llm-mcp defaults to compact sampled payload', async () => {
  const longLiteral = 'x'.repeat(5200);
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      { path: 'a-long.js', content: `const longValue = '${longLiteral}';\n` },
      { path: 'b0.js', content: 'export const b0 = 0;\n' },
      { path: 'b1.js', content: 'export const b1 = 1;\n' },
      { path: 'b2.js', content: 'export const b2 = 2;\n' },
      { path: 'b3.js', content: 'export const b3 = 3;\n' },
      { path: 'b4.js', content: 'export const b4 = 4;\n' },
      { path: 'b5.js', content: 'export const b5 = 5;\n' },
      { path: 'b6.js', content: 'export const b6 = 6;\n' },
      { path: 'b7.js', content: 'export const b7 = 7;\n' },
      { path: 'b8.js', content: 'export const b8 = 8;\n' },
      { path: 'b9.js', content: 'export const b9 = 9;\n' },
      { path: 'c0.js', content: 'export const c0 = 10;\n' },
      { path: 'd0.js', content: 'export const d0 = 11;\n' }
    ]
  });

  /** @type {Array<{ path: string, source: string }>} */
  let captured = [];

  await learnStyle({
    repoPaths: [repo],
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 30,
    minEvidence: 1,
    minConfidence: 0.5,
    inferenceMode: 'llm-mcp',
    llmAugmenter: ({ sampledFiles }) => {
      captured = sampledFiles;
      return {};
    }
  });

  assert.equal(captured.length, 12);
  const longFile = captured.find((entry) => entry.path.endsWith('a-long.js'));
  assert.ok(longFile);
  assert.match(longFile.source, /truncated/);
});

test('learnStyle llm-mcp supports full sampled payload when enabled', async () => {
  const longLiteral = 'y'.repeat(5200);
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      { path: 'a-long.js', content: `const longValue = '${longLiteral}';\n` },
      { path: 'b0.js', content: 'export const b0 = 0;\n' },
      { path: 'b1.js', content: 'export const b1 = 1;\n' },
      { path: 'b2.js', content: 'export const b2 = 2;\n' },
      { path: 'b3.js', content: 'export const b3 = 3;\n' },
      { path: 'b4.js', content: 'export const b4 = 4;\n' },
      { path: 'b5.js', content: 'export const b5 = 5;\n' },
      { path: 'b6.js', content: 'export const b6 = 6;\n' },
      { path: 'b7.js', content: 'export const b7 = 7;\n' },
      { path: 'b8.js', content: 'export const b8 = 8;\n' },
      { path: 'b9.js', content: 'export const b9 = 9;\n' },
      { path: 'c0.js', content: 'export const c0 = 10;\n' },
      { path: 'd0.js', content: 'export const d0 = 11;\n' }
    ]
  });

  /** @type {Array<{ path: string, source: string }>} */
  let captured = [];

  await learnStyle({
    repoPaths: [repo],
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 30,
    minEvidence: 1,
    minConfidence: 0.5,
    inferenceMode: 'llm-mcp',
    llmSamplingMode: 'full',
    llmAugmenter: ({ sampledFiles }) => {
      captured = sampledFiles;
      return {};
    }
  });

  assert.equal(captured.length, 13);
  const longFile = captured.find((entry) => entry.path.endsWith('a-long.js'));
  assert.ok(longFile);
  assert.ok(longFile.source.length > 5000);
  assert.doesNotMatch(longFile.source, /truncated/);
});
