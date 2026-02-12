// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { writeBiomeConfig } from '../src/output/config-biome.js';
import { createProfileFixture } from './support/profile-fixture.js';

test('biome config includes formatter/linter/plugin wiring from enforced rules', async () => {
  const profile = createProfileFixture();
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'cdo-biome-config-'));
  const { configPath, pluginPath, pluginPaths } = await writeBiomeConfig(profile, outDir);
  assert.ok(pluginPath);
  assert.equal(pluginPaths.length, 5);

  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const plugins = await Promise.all(pluginPaths.map(async (entry) => readFile(entry, 'utf8')));
  const plugin = plugins.join('\n');

  assert.equal(config.formatter.indentStyle, 'space');
  assert.equal(config.formatter.indentWidth, 2);
  assert.equal(config.javascript.formatter.quoteStyle, 'single');
  assert.equal(config.javascript.formatter.semicolons, 'always');
  assert.equal(config.javascript.formatter.trailingCommas, 'none');
  assert.equal(config.javascript.formatter.lineWidth, 120);
  assert.equal(config.linter.rules.style.noYodaExpression, 'error');
  assert.equal(config.assist.actions.source.organizeImports, 'on');
  assert.deepEqual(config.plugins, [
    './biome/plugins/function-name-single-word.grit',
    './biome/plugins/function-expression-named.grit',
    './biome/plugins/function-jsdoc-preference.grit',
    './biome/plugins/single-line-if-omit-braces.grit',
    './biome/plugins/guard-clause-preference.grit'
  ]);

  assert.match(plugin, /prefers single-word function names/);
  assert.match(plugin, /prefers named function expressions/);
  assert.match(plugin, /prefers JSDoc on functions/);
  assert.match(plugin, /prefers omitting braces/);
  assert.match(plugin, /prefers guard clauses/);
});

test('biome config omits undetermined style preferences', async () => {
  const profile = createProfileFixture();
  profile.rules.syntax.quotes = {
    ...profile.rules.syntax.quotes,
    value: null,
    status: 'undetermined'
  };
  profile.rules.syntax.semicolons = {
    ...profile.rules.syntax.semicolons,
    value: null,
    status: 'undetermined'
  };
  profile.rules.imports.ordering = {
    ...profile.rules.imports.ordering,
    value: null,
    status: 'undetermined'
  };
  profile.rules.syntax.yodaConditions = {
    ...profile.rules.syntax.yodaConditions,
    value: null,
    status: 'undetermined'
  };

  const outDir = await mkdtemp(path.join(os.tmpdir(), 'cdo-biome-config-undetermined-'));
  const { configPath } = await writeBiomeConfig(profile, outDir);
  const config = JSON.parse(await readFile(configPath, 'utf8'));

  assert.equal(config.assist.actions.source.organizeImports, 'off');
  assert.equal(config.javascript.formatter.quoteStyle, undefined);
  assert.equal(config.javascript.formatter.semicolons, undefined);
  assert.equal(config.javascript.formatter.lineWidth, 120);
  assert.equal(config.linter.rules.style, undefined);
});

test('biome config triggers diagnostic for anonymous function expressions when profile prefers named', async () => {
  const profile = createProfileFixture();
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'cdo-biome-config-anon-'));
  const fixtureFile = path.resolve(outDir, 'fixture.js');
  await writeFile(
    fixtureFile,
    "const handler = function () {\n  return 1;\n};\n",
    'utf8'
  );

  const { configPath } = await writeBiomeConfig(profile, outDir, { disableFormatter: true });
  const require = createRequire(import.meta.url);
  const biomeBin = require.resolve('@biomejs/biome/bin/biome');

  const result = spawnSync(
    process.execPath,
    [biomeBin, 'check', '--config-path', configPath, fixtureFile],
    { encoding: 'utf8' }
  );

  const output = `${String(result.stdout ?? '')}\n${String(result.stderr ?? '')}`;
  assert.match(output, /prefers named function expressions/);
});
