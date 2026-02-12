// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { applyStyle } from '../src/apply/apply.js';
import { createRepo } from './support/helpers.js';
import { createProfileFixture } from './support/profile-fixture.js';

test('applyStyle biome write updates file content', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [{ path: 'index.js', content: 'const value = "x";\n' }]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];

  const report = await applyStyle({
    profile,
    repoPaths: [repo],
    engine: 'biome',
    write: true
  });

  assert.equal(report.engine, 'biome');
  assert.equal(report.write, true);
  assert.equal(report.filesChanged, 1);

  const updated = await readFile(path.join(repo, 'index.js'), 'utf8');
  assert.equal(updated, "const value = 'x';\n");
});

test('applyStyle rejects missing repo paths', async () => {
  const profile = createProfileFixture();
  await assert.rejects(
    async () => applyStyle({ profile, repoPaths: [] }),
    /requires repoPaths/
  );
});

test('applyStyle rejects unknown engine', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [{ path: 'index.js', content: 'const x = 1;\n' }]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];

  await assert.rejects(
    async () => applyStyle({ profile, repoPaths: [repo], engine: /** @type {any} */ ('weird') }),
    /Unknown apply engine/
  );
});

test('applyStyle safeOnly skips non-safe biome fixes', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [{ path: 'index.js', content: 'const value = "x";\n' }]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];

  await applyStyle({
    profile,
    repoPaths: [repo],
    engine: 'biome',
    write: true,
    safeOnly: true
  });

  const updated = await readFile(path.join(repo, 'index.js'), 'utf8');
  assert.equal(updated, 'const value = "x";\n');
});

test('applyStyle deduplicates repeated repository paths', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [{ path: 'index.js', content: 'const x = 1;\n' }]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];

  const report = await applyStyle({
    profile,
    repoPaths: [repo, repo],
    engine: 'biome',
    write: false
  });

  assert.equal(report.filesScanned, 1);
});

test('applyStyle preserves aligned trailing inline comments when profile enforces alignment', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `const shape = {\n  short: 1,                    // one\n  veryLongPropertyName: 2,     // two\n};\n`
      }
    ]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];

  await applyStyle({
    profile,
    repoPaths: [repo],
    engine: 'biome',
    write: true
  });

  const updated = await readFile(path.join(repo, 'index.js'), 'utf8');
  const commentColumns = updated
    .split('\n')
    .filter((line) => line.includes('//'))
    .map((line) => line.indexOf('//'));

  assert.equal(commentColumns.length, 2);
  assert.equal(commentColumns[0], commentColumns[1]);
});

test('applyStyle aligns trailing comments for object keys that match control-flow keywords', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `const votes = {\n  for: null,       // voted for\n  granted: 0       // granted votes\n};\n`
      }
    ]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];

  await applyStyle({
    profile,
    repoPaths: [repo],
    engine: 'biome',
    write: true
  });

  const updated = await readFile(path.join(repo, 'index.js'), 'utf8');
  const commentColumns = updated
    .split('\n')
    .filter((line) => line.includes('//'))
    .map((line) => line.indexOf('//'));

  assert.equal(commentColumns.length, 2);
  assert.equal(commentColumns[0], commentColumns[1]);
});

test('applyStyle restores compact single-line if statements when profile prefers omit braces', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `function update(packet, raft) {\n  if (packet.address !== raft.leader) raft.change({ leader: packet.address });\n}\n`
      }
    ]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];
  profile.rules.syntax.lineWidth = {
    ...profile.rules.syntax.lineWidth,
    value: 120
  };

  await applyStyle({
    profile,
    repoPaths: [repo],
    engine: 'biome',
    write: true
  });

  const updated = await readFile(path.join(repo, 'index.js'), 'utf8');
  assert.match(updated, /if \(packet\.address !== raft\.leader\) raft\.change\(\{ leader: packet\.address \}\);/);
});

test('applyStyle aligns switch breaks with case labels when profile enforces match-case', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `function run(value) {\n  switch (value) {\n    case 'a':\n      update();\n    break;\n  }\n}\n`
      }
    ]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];

  await applyStyle({
    profile,
    repoPaths: [repo],
    engine: 'biome',
    write: true
  });

  const updated = await readFile(path.join(repo, 'index.js'), 'utf8');
  const lines = updated.split('\n');
  const caseLine = lines.find((line) => line.includes("case 'a':"));
  const breakLine = lines.find((line) => line.trim() === 'break;');
  assert.ok(caseLine);
  assert.ok(breakLine);

  const caseIndent = caseLine.match(/^\s*/)?.[0].length ?? 0;
  const breakIndent = breakLine.match(/^\s*/)?.[0].length ?? 0;
  assert.equal(caseIndent, breakIndent);
});

test('applyStyle compacts multiline call argument layout when profile prefers compact style', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `function send(packet) {\n  raft.message(Raft.LEADER, await raft.packet('append ack', {\n    term: packet.term,\n    index: packet.index\n  }));\n}\n`
      }
    ]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];
  profile.rules.syntax.lineWidth = {
    ...profile.rules.syntax.lineWidth,
    value: 160
  };

  await applyStyle({
    profile,
    repoPaths: [repo],
    engine: 'biome',
    write: true
  });

  const updated = await readFile(path.join(repo, 'index.js'), 'utf8');
  assert.match(updated, /raft\.message\(Raft\.LEADER, await raft\.packet\('append ack', \{/);
  assert.match(updated, /\}\)\);/);
});

test('applyStyle compacts trailing callback arguments onto the callback close line', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `function bind(node, raft) {\n  node.once('end', function end() {\n    raft.leave(node);\n  },\n  raft);\n}\n`
      }
    ]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];

  await applyStyle({
    profile,
    repoPaths: [repo],
    engine: 'biome',
    write: true
  });

  const updated = await readFile(path.join(repo, 'index.js'), 'utf8');
  assert.match(
    updated,
    /node\.once\('end', function end\(\) \{\n {4}raft\.leave\(node\);\n {2}\}, raft\);/
  );
});

test('applyStyle preserves multiline member chains when profile enforces chain indentation', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `function schedule(raft) {\n  raft.timers\n    .clear('heartbeat, election')\n    .setTimeout('election', raft.promote, raft.timeout());\n}\n`
      }
    ]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];
  profile.rules.whitespace.memberExpressionIndentation = {
    ...profile.rules.whitespace.memberExpressionIndentation,
    value: 'indented'
  };

  await applyStyle({
    profile,
    repoPaths: [repo],
    engine: 'biome',
    write: true
  });

  const updated = await readFile(path.join(repo, 'index.js'), 'utf8');
  assert.match(
    updated,
    /raft\.timers\n {4}\.clear\('heartbeat, election'\)\n {4}\.setTimeout\('election', raft\.promote, raft\.timeout\(\)\);/
  );
});

test('applyStyle preserves leading-comma variable declarations when profile enforces it', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `function create(value) {\n  var uuid = value(),\n    raft = this;\n  return uuid || raft;\n}\n`
      }
    ]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];
  profile.rules.syntax.variableDeclarationCommaPlacement = {
    ...profile.rules.syntax.variableDeclarationCommaPlacement,
    value: 'leading'
  };

  await applyStyle({
    profile,
    repoPaths: [repo],
    engine: 'biome',
    write: true
  });

  const updated = await readFile(path.join(repo, 'index.js'), 'utf8');
  assert.match(updated, /var uuid = value\(\)\n\s+, raft = this;/);
});

test('applyStyle preserves multiline ternary operator-leading layout when profile enforces it', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `function origin(url) {\n  url.origin = url.protocol !== 'file:' && isSpecial(url.protocol) && url.host\n    ? url.protocol +'//'+ url.host\n    : 'null';\n}\n`
      }
    ]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];
  profile.rules.syntax.lineWidth = {
    ...profile.rules.syntax.lineWidth,
    value: 160
  };
  profile.rules.syntax.multilineTernaryOperatorPlacement = {
    ...profile.rules.syntax.multilineTernaryOperatorPlacement,
    value: 'leading'
  };

  await applyStyle({
    profile,
    repoPaths: [repo],
    engine: 'biome',
    write: true
  });

  const updated = await readFile(path.join(repo, 'index.js'), 'utf8');
  assert.match(updated, /url\.origin = url\.protocol !== 'file:' && isSpecial\(url\.protocol\) && url\.host\n\s+\? /);
  assert.match(updated, /\n\s+: 'null';/);
});

test('applyStyle preserves aligned trailing comments for array-style rule blocks', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `var rules = [\n  ['#', 'hash'],                        // Extract from the back.\n  ['?', 'query'],                       // Extract from the back.\n  function sanitize(address, url) {     // Sanitize what is left of the address\n    return isSpecial(url.protocol) ? address.replace(/\\\\/g, '/') : address;\n  },\n  ['/', 'pathname'],                    // Extract from the back.\n  ['@', 'auth', 1],                     // Extract from the front.\n  [NaN, 'host', undefined, 1, 1],       // Set left over value.\n  [/:(\\d*)$/, 'port', undefined, 1],    // RegExp the back.\n  [NaN, 'hostname', undefined, 1, 1]    // Set left over.\n];\n`
      }
    ]
  });

  const profile = createProfileFixture();
  profile.sources.roots = [repo];
  profile.rules.syntax.lineWidth = {
    ...profile.rules.syntax.lineWidth,
    value: 120
  };
  profile.rules.comments.trailingInlineCommentAlignment = {
    ...profile.rules.comments.trailingInlineCommentAlignment,
    value: 'aligned'
  };

  await applyStyle({
    profile,
    repoPaths: [repo],
    engine: 'biome',
    write: true
  });

  const updated = await readFile(path.join(repo, 'index.js'), 'utf8');
  const lines = updated.split('\n');
  const functionLine = lines.find((line) => line.includes('function sanitize(address, url)'));
  assert.ok(functionLine);
  assert.match(functionLine, /\/\/ Sanitize what is left of the address/);

  const commentColumns = lines
    .filter((line) => /Extract from the back|Extract from the front|Set left over|RegExp the back|Sanitize what is left/.test(line))
    .map((line) => line.indexOf('//'));

  assert.ok(commentColumns.length >= 6);
  assert.equal(new Set(commentColumns).size, 1);
});
