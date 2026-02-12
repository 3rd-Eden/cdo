// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { applyStyle, generateConfigs, generateGuide, generateIterationReport, learnStyle } from '../src/index.js';
import { createRepo } from './support/helpers.js';

const FIXTURE_REPO_TEMPLATE = path.resolve(new URL('./fixtures/repo-template/files.json', import.meta.url).pathname);
const SNAPSHOT_DIR = path.resolve(new URL('./fixtures/snapshots', import.meta.url).pathname);
const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === '1';

/**
 * @param {string} value
 */
function normalizeSlashes(value) {
  return value.replace(/\\/g, '/');
}

/**
 * @param {string} value
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} input
 * @param {Record<string, string>} replacements
 */
function replaceAll(input, replacements) {
  let output = normalizeSlashes(input);
  for (const [from, to] of Object.entries(replacements)) {
    const pattern = new RegExp(escapeRegex(normalizeSlashes(from)), 'g');
    output = output.replace(pattern, to);
  }
  return output;
}

/**
 * @param {string} name
 * @param {string} actual
 */
async function assertSnapshot(name, actual) {
  const snapshotPath = path.resolve(SNAPSHOT_DIR, name);

  if (UPDATE_SNAPSHOTS) {
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, actual, 'utf8');
    return;
  }

  let expected = '';
  try {
    expected = await readFile(snapshotPath, 'utf8');
  } catch {
    assert.fail(`Missing snapshot file: ${snapshotPath}. Run: npm run snapshots:update`);
  }

  assert.equal(actual, expected, `Snapshot mismatch for ${name}. Run: npm run snapshots:update`);
}

/**
 * @param {import('../src/types.js').CdoProfileV1} profile
 * @param {Record<string, string>} replacements
 */
function normalizeProfile(profile, replacements) {
  const copy = structuredClone(profile);
  copy.profileId = '<profile-id>';
  copy.createdAt = '<created-at>';
  copy.sources.roots = copy.sources.roots.map((root) => replaceAll(root, replacements));
  copy.sampleWindow.perRepo = copy.sampleWindow.perRepo.map((entry) => ({
    ...entry,
    root: replaceAll(entry.root, replacements),
    sampledFiles: entry.sampledFiles.map((file) => replaceAll(file, replacements))
  }));
  return copy;
}

/**
 * @param {import('../src/types.js').ApplyReport} report
 * @param {Record<string, string>} replacements
 */
function normalizeApplyReport(report, replacements) {
  const copy = structuredClone(report);
  copy.files = copy.files.map((entry) => ({
    ...entry,
    file: replaceAll(entry.file, replacements)
  }));
  copy.diffs = copy.diffs.map((diff) => replaceAll(diff, replacements));
  return copy;
}

/**
 * @param {ReturnType<typeof generateIterationReport>} report
 * @param {Record<string, string>} replacements
 */
function normalizeIterationReport(report, replacements) {
  const copy = structuredClone(report);
  copy.generatedAt = '<generated-at>';
  copy.profileId = '<profile-id>';

  /** @type {Record<string, number>} */
  const changedByRepo = {};
  for (const [repo, count] of Object.entries(copy.diff.changedByRepo)) {
    changedByRepo[replaceAll(repo, replacements)] = count;
  }
  copy.diff.changedByRepo = changedByRepo;
  return copy;
}

/**
 * @param {{ pluginPath?: string | null, pluginPaths?: string[] }} biome
 */
async function serializeBiomePlugins(biome) {
  const pluginPaths = Array.isArray(biome.pluginPaths)
    ? [...biome.pluginPaths]
    : (biome.pluginPath ? [biome.pluginPath] : []);

  if (!pluginPaths.length) return '';
  pluginPaths.sort((a, b) => a.localeCompare(b));

  /** @type {string[]} */
  const blocks = [];
  for (const pluginPath of pluginPaths) {
    const content = await readFile(pluginPath, 'utf8');
    blocks.push(`### ${path.basename(pluginPath)}\n${content.trimEnd()}`);
  }

  return `${blocks.join('\n\n')}\n`;
}

test('snapshot fixtures for learn/config/apply/report output remain stable', async () => {
  const files = /** @type {Array<{ path: string, content: string }>} */ (
    JSON.parse(await readFile(FIXTURE_REPO_TEMPLATE, 'utf8'))
  );
  const repo = await createRepo({
    name: 'Snapshot Author',
    email: 'snapshot@example.com',
    files
  });

  const profile = await learnStyle({
    repoPaths: [repo],
    authorEmails: ['snapshot@example.com'],
    maxFilesPerRepo: 200,
    minEvidence: 2,
    minConfidence: 0.55,
    inferenceMode: 'deterministic'
  });

  const guide = generateGuide(profile);
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'cdo-snapshot-config-'));
  const configs = await generateConfigs(profile, { outDir });
  const applyReport = await applyStyle({
    profile,
    repoPaths: [repo],
    engine: 'biome',
    safeOnly: false,
    write: false
  });
  const iteration = generateIterationReport(profile, applyReport, null);

  const replacements = {
    [repo]: '<repo>',
    [outDir]: '<config-dir>'
  };

  const normalizedProfile = normalizeProfile(profile, replacements);
  const normalizedGuide = replaceAll(
    guide
      .replace(/^Generated: .+$/m, 'Generated: <created-at>')
      .replace(/^Profile ID: .+$/m, 'Profile ID: <profile-id>'),
    replacements
  );
  const normalizedApplyReport = normalizeApplyReport(applyReport, replacements);
  const normalizedIteration = normalizeIterationReport(iteration, replacements);

  await assertSnapshot('profile.json', `${JSON.stringify(normalizedProfile, null, 2)}\n`);
  await assertSnapshot('style-guide.md', normalizedGuide);
  await assertSnapshot('apply-report.json', `${JSON.stringify(normalizedApplyReport, null, 2)}\n`);
  await assertSnapshot('iteration-report.json', `${JSON.stringify(normalizedIteration, null, 2)}\n`);
  await assertSnapshot('biome.json', await readFile(configs.biome.configPath, 'utf8'));
  await assertSnapshot('biome-plugin.grit', await serializeBiomePlugins(configs.biome));
  await assertSnapshot('grit-readme.md', await readFile(configs.grit.readmePath, 'utf8'));
  await assertSnapshot('grit-rules.grit', await readFile(configs.grit.rulesPath, 'utf8'));
  await assertSnapshot('grit-recipes.json', await readFile(configs.grit.recipesPath, 'utf8'));
  await assertSnapshot('oxfmt.json', configs.oxc ? await readFile(configs.oxc.configPath, 'utf8') : '');
  await assertSnapshot('agent-codex.md', await readFile(configs.agents.codexPath, 'utf8'));
  await assertSnapshot('agent-cursor.mdc', await readFile(configs.agents.cursorPath, 'utf8'));
  await assertSnapshot('agent-claude.md', await readFile(configs.agents.claudePath, 'utf8'));
});
