// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '@babel/parser';
import { extractFileSignals } from '../src/core/extractors/index.js';
import { aggregateSignals } from '../src/core/aggregate.js';
import { inferProfile } from '../src/core/infer.js';

test('extractors and inference identify key style signals', () => {
  const source = `/**\n * Add numbers\n */\nfunction add(a, b) {\n  if (a) return a + b;\n  // comment\n  switch (a) {\n    case 1:\n      return Promise.resolve(a)\n      .then((value) => value + b)\n      .catch(() => b);\n    default:\n      return 'ok';\n  }\n}\n\n/**\n * Multiply numbers\n */\nfunction multiply(a, b) {\n  return a * b;\n}\n`;

  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript'],
    ranges: true,
    tokens: true
  });

  const signals = extractFileSignals(source, ast);
  const aggregate = aggregateSignals([signals]);

  const profile = inferProfile({
    aggregate,
    roots: ['/tmp/example'],
    perRepo: [{ root: '/tmp/example', files: ['/tmp/example/index.js'] }],
    filesAnalyzed: 1,
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 400,
    minEvidence: 1,
    minConfidence: 0.5,
    inferenceMode: 'deterministic'
  });

  assert.equal(profile.rules.comments.lineCommentSpacing.value, 'space-after-slashes');
  assert.equal(profile.rules.comments.preferJsdocForFunctions.value, true);
  assert.equal(profile.rules.controlFlow.singleLineIfBraces.value, 'omit');
  assert.equal(profile.rules.syntax.quotes.value, 'single');
  assert.equal(profile.rules.syntax.semicolons.value, 'always');
  assert.equal(profile.rules.syntax.lineWidth.value, 80);
  assert.equal(profile.rules.whitespace.switchCaseIndentation.value, 'indent');
  assert.equal(profile.rules.whitespace.memberExpressionIndentation.value, 'aligned');
});

test('extractors focus if-brace inference on one-statement ifs and include CJS require ordering', () => {
  const source = `import a from 'a';\nimport b from 'b';\nconst alpha = require('alpha');\nconst beta = require('beta');\n\nfunction run(x, ok) {\n  if (x) {\n    doA();\n    doB();\n  }\n\n  if (ok) doA();\n}\n`;

  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript'],
    ranges: true,
    tokens: true
  });

  const signals = extractFileSignals(source, ast);
  const aggregate = aggregateSignals([signals]);

  assert.equal(aggregate.ifWithBraces, 0);
  assert.equal(aggregate.ifWithoutBraces, 1);

  const profile = inferProfile({
    aggregate,
    roots: ['/tmp/example'],
    perRepo: [{ root: '/tmp/example', files: ['/tmp/example/index.js'] }],
    filesAnalyzed: 1,
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 400,
    minEvidence: 1,
    minConfidence: 0.5,
    inferenceMode: 'deterministic'
  });

  assert.equal(profile.rules.controlFlow.singleLineIfBraces.value, 'omit');
  assert.equal(profile.rules.imports.ordering.value, 'alphabetical');
});

test('extractors ignore directive and separator comments for spacing inference', () => {
  const source = `//# sourceMappingURL=index.js.map\n// eslint-disable-next-line no-console\n//\n// -----\n//tight\n// spaced\nconsole.log('ok');\n`;
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript'],
    ranges: true,
    tokens: true
  });

  const signals = extractFileSignals(source, ast);
  assert.equal(signals.lineCommentTight, 1);
  assert.equal(signals.lineCommentSpace, 1);
});

test('extractors detect yoda conditions, guard clauses, comment framing, and inline comment alignment', () => {
  const source = `//\n// section title\n//\nfunction fn(input) {\n  if (!input) return 0;\n\n  const raft = {};\n  raft.term = 0;         // current term\n  raft.leader = '';      // current leader\n  raft.state = 'ready';  // current state\n  const state = {};\n  state.id = 1; // identifier\n  state.identifier = 2; // long identifier\n\n  if (3 === input) {\n    return input;\n  }\n\n  return 1;\n}\n`;
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript'],
    ranges: true,
    tokens: true
  });

  const signals = extractFileSignals(source, ast);
  assert.equal(signals.commentFramedBlocks, 1);
  assert.equal(signals.guardClauseFunctions, 1);
  assert.equal(signals.yodaConditionsYes, 1);
  assert.equal(signals.trailingInlineCommentAlignedPairs, 2);
  assert.equal(signals.trailingInlineCommentUnalignedPairs, 2);
  assert.equal(signals.blankLineBeforeReturnYes > 0, true);

  const profile = inferProfile({
    aggregate: aggregateSignals([signals]),
    roots: ['/tmp/example'],
    perRepo: [{ root: '/tmp/example', files: ['/tmp/example/index.js'] }],
    filesAnalyzed: 1,
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 400,
    minEvidence: 1,
    minConfidence: 0.5,
    inferenceMode: 'deterministic'
  });

  assert.equal(profile.rules.comments.trailingInlineCommentAlignment.value, 'aligned');
});

test('import ordering inference weights larger unsorted groups over tiny sorted groups', () => {
  const source = `const one = require('zeta');\nconst two = require('alpha');\nconst three = require('beta');\nconst four = require('delta');\n`;
  const sortedSource = `const a = require('alpha');\nconst b = require('beta');\n`;
  const astA = parse(source, {
    sourceType: 'module',
    plugins: ['typescript'],
    ranges: true,
    tokens: true
  });
  const astB = parse(sortedSource, {
    sourceType: 'module',
    plugins: ['typescript'],
    ranges: true,
    tokens: true
  });

  const aggregate = aggregateSignals([
    extractFileSignals(source, astA),
    extractFileSignals(sortedSource, astB)
  ]);

  const profile = inferProfile({
    aggregate,
    roots: ['/tmp/example'],
    perRepo: [{ root: '/tmp/example', files: ['/tmp/example/a.js', '/tmp/example/b.js'] }],
    filesAnalyzed: 2,
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 400,
    minEvidence: 1,
    minConfidence: 0.75,
    inferenceMode: 'deterministic'
  });

  assert.equal(profile.rules.imports.ordering.value, 'none');
});

test('member expression indentation only counts dot-leading continuation lines', () => {
  const base = `function chain(factory) {\n  factory()\n    .on('ready', noop)\n    .on('done', noop);\n\n  return factory()\n    .run()\n    .set(1);\n}\n`;
  const withInline = `${base}\nnew Promise((resolve) => {\n  resolve();\n}).then(() => noop());\n`;

  const baseAst = parse(base, {
    sourceType: 'module',
    plugins: ['typescript'],
    ranges: true,
    tokens: true
  });
  const inlineAst = parse(withInline, {
    sourceType: 'module',
    plugins: ['typescript'],
    ranges: true,
    tokens: true
  });

  const baseSignals = extractFileSignals(base, baseAst);
  const inlineSignals = extractFileSignals(withInline, inlineAst);
  assert.equal(inlineSignals.memberExprAligned, baseSignals.memberExprAligned);
  assert.equal(inlineSignals.memberExprIndented, baseSignals.memberExprIndented);
});

test('extractors detect switch break indentation and multiline call argument layout', () => {
  const source = `function run(input) {\n  switch (input) {\n    case 'a':\n      notify(\n        one,\n        two\n      );\n    break;\n\n    case 'b':\n      notify(one,\n        two\n      );\n      break;\n\n    case 'c':\n      notify(two,\n        three\n      );\n    break;\n\n    default:\n    break;\n  }\n}\n`;
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript'],
    ranges: true,
    tokens: true
  });

  const signals = extractFileSignals(source, ast);
  assert.equal(signals.switchCaseBreakMatchCase, 3);
  assert.equal(signals.switchCaseBreakIndented, 1);
  assert.equal(signals.multilineCallArgumentCompact, 2);
  assert.equal(signals.multilineCallArgumentExpanded, 1);

  const profile = inferProfile({
    aggregate: aggregateSignals([signals]),
    roots: ['/tmp/example'],
    perRepo: [{ root: '/tmp/example', files: ['/tmp/example/index.js'] }],
    filesAnalyzed: 1,
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 400,
    minEvidence: 1,
    minConfidence: 0.5,
    inferenceMode: 'deterministic'
  });

  assert.equal(profile.rules.whitespace.switchCaseBreakIndentation.value, 'match-case');
  assert.equal(profile.rules.whitespace.multilineCallArgumentLayout.value, 'compact');
});

test('extractors detect variable declaration comma placement preference', () => {
  const source = `function run() {\n  var uuid = create()\n    , raft = this;\n  var one = 1,\n    two = 2;\n  return uuid || raft || one || two;\n}\n`;
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript'],
    ranges: true,
    tokens: true
  });

  const signals = extractFileSignals(source, ast);
  assert.equal(signals.variableDeclarationCommaLeading, 1);
  assert.equal(signals.variableDeclarationCommaTrailing, 1);

  const profile = inferProfile({
    aggregate: aggregateSignals([signals, signals]),
    roots: ['/tmp/example'],
    perRepo: [{ root: '/tmp/example', files: ['/tmp/example/index.js'] }],
    filesAnalyzed: 1,
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 400,
    minEvidence: 1,
    minConfidence: 0.5,
    inferenceMode: 'deterministic'
  });

  assert.equal(profile.rules.syntax.variableDeclarationCommaPlacement.value, 'leading');
});

test('extractors detect function expression naming preference', () => {
  const source = `const a = function alpha() {\n  return 1;\n};\nconst b = function beta() {\n  return 2;\n};\nconst c = function () {\n  return 3;\n};\n`;
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript'],
    ranges: true,
    tokens: true
  });

  const signals = extractFileSignals(source, ast);
  assert.equal(signals.functionExprNamed, 2);
  assert.equal(signals.functionExprAnonymous, 1);

  const profile = inferProfile({
    aggregate: aggregateSignals([signals]),
    roots: ['/tmp/example'],
    perRepo: [{ root: '/tmp/example', files: ['/tmp/example/index.js'] }],
    filesAnalyzed: 1,
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 400,
    minEvidence: 1,
    minConfidence: 0.5,
    inferenceMode: 'deterministic'
  });

  assert.equal(profile.rules.naming.functionExpressionNamingPreference.value, 'named');
});

test('extractors detect multiline ternary operator placement preference', () => {
  const source = `function map(input) {\n  const first = input.enabled\n    ? input.value\n    : input.fallback;\n\n  const second = input.ready\n    ? input.next\n    : input.prev;\n\n  const third = input.ok ?\n    input.current :\n    input.other;\n\n  return first || second || third;\n}\n`;
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript'],
    ranges: true,
    tokens: true
  });

  const signals = extractFileSignals(source, ast);
  assert.equal(signals.ternaryMultilineLeading, 2);
  assert.equal(signals.ternaryMultilineTrailing, 1);

  const profile = inferProfile({
    aggregate: aggregateSignals([signals]),
    roots: ['/tmp/example'],
    perRepo: [{ root: '/tmp/example', files: ['/tmp/example/index.js'] }],
    filesAnalyzed: 1,
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 400,
    minEvidence: 1,
    minConfidence: 0.5,
    inferenceMode: 'deterministic'
  });

  assert.equal(profile.rules.syntax.multilineTernaryOperatorPlacement.value, 'leading');
});

test('extractors detect aligned inline comments for array-element style blocks', () => {
  const source = `var rules = [\n  ['#', 'hash'],                        // Extract from the back.\n  ['?', 'query'],                       // Extract from the back.\n  function sanitize(address, url) {     // Sanitize what is left of the address\n    return isSpecial(url.protocol) ? address.replace(/\\\\/g, '/') : address;\n  },\n  ['/', 'pathname'],                    // Extract from the back.\n  ['@', 'auth', 1],                     // Extract from the front.\n  [NaN, 'host', undefined, 1, 1],       // Set left over value.\n  [/:(\\d*)$/, 'port', undefined, 1],    // RegExp the back.\n  [NaN, 'hostname', undefined, 1, 1]    // Set left over.\n];\n`;
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript'],
    ranges: true,
    tokens: true
  });

  const signals = extractFileSignals(source, ast);
  assert.equal(signals.trailingInlineCommentAlignedPairs, 7);
  assert.equal(signals.trailingInlineCommentUnalignedPairs, 0);
});
