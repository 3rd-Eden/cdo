// @ts-check
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createTwoFilesPatch } from 'diff';
import { listTrackedSourceFiles } from '../core/discovery.js';
import { readJson, writeJson } from '../util/fs.js';
import { validateProfile } from '../output/profile.js';
import { writeBiomeConfig } from '../output/config-biome.js';
import { applyInlineCommentStyle } from './comment-alignment.js';
import {
  applyMemberExpressionIndentation,
  applyMultilineCallArgumentLayout,
  applySingleLineIfStyle,
  applySwitchCaseBreakIndentation,
  applyTernaryLayout,
  applyVariableDeclarationCommaPlacement
} from './style-normalization.js';

/**
 * @param {string[]} repoPaths
 */
async function collectFiles(repoPaths) {
  /** @type {Set<string>} */
  const allFiles = new Set();

  for (const repo of repoPaths) {
    const root = path.resolve(repo);
    const tracked = await listTrackedSourceFiles(root);
    for (const file of tracked) {
      allFiles.add(path.join(root, file));
    }
  }

  return [...allFiles];
}

/**
 * @param {string} patch
 */
function countPatchStats(patch) {
  let additions = 0;
  let deletions = 0;

  for (const line of patch.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue;
    if (line.startsWith('+')) additions += 1;
    if (line.startsWith('-')) deletions += 1;
  }

  return { additions, deletions };
}

/**
 * @param {boolean} write
 * @param {string[]} allFiles
 * @param {import('../types.js').ApplyFileResult[]} fileResults
 * @param {string[]} diffs
 * @returns {import('../types.js').ApplyReport}
 */
function buildReport(write, allFiles, fileResults, diffs) {
  return {
    engine: 'biome',
    write,
    filesScanned: allFiles.length,
    filesChanged: fileResults.filter((entry) => entry.changed).length,
    diffs,
    files: fileResults
  };
}

/**
 * Keep only rules marked auto-fix safe by converting unsafe rules to undetermined.
 * @param {import('../types.js').CdoProfileV1} profile
 */
function safeOnlyProfile(profile) {
  /** @type {import('../types.js').CdoProfileV1} */
  const copy = structuredClone(profile);

  /**
   * @param {unknown} node
   */
  function visit(node) {
    if (!node || typeof node !== 'object') return;

    const rule = /** @type {Record<string, unknown>} */ (node);
    if ('autoFixSafe' in rule && 'status' in rule && 'value' in rule) {
      if (rule.autoFixSafe !== true) {
        rule.status = 'undetermined';
        rule.value = null;
      }
      return;
    }

    for (const value of Object.values(rule)) {
      visit(value);
    }
  }

  visit(copy.rules);
  return copy;
}

/**
 * @param {string} configPath
 * @param {string[]} files
 * @param {boolean} includeUnsafe
 */
function runBiomeCheck(configPath, files, includeUnsafe) {
  if (!files.length) return;

  const require = createRequire(import.meta.url);
  const biomeBin = require.resolve('@biomejs/biome/bin/biome');

  /** @type {string[]} */
  const args = [
    biomeBin,
    'check',
    '--write',
    '--config-path',
    configPath
  ];
  if (includeUnsafe) {
    args.push('--unsafe');
  }
  args.push(...files);

  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.status === 0) return;

  const stdout = String(result.stdout ?? '').trim();
  const stderr = String(result.stderr ?? '').trim();
  const combined = `${stdout}\n${stderr}`;
  const fatalPatterns = [
    /Configuration/i,
    /unknown (?:option|flag|argument)/i,
    /internal error/i,
    /panic/i,
    /plugin.+error/i,
    /loading of plugins/i,
    /failed to compile the grit plugin/i,
    /cannot find/i
  ];

  if (fatalPatterns.some((pattern) => pattern.test(combined))) {
    const detail = stderr || stdout || 'unknown error';
    throw new Error(`Biome check failed: ${detail}`);
  }
}

/**
 * @param {import('../types.js').CdoProfileV1} profile
 * @param {string[]} allFiles
 * @param {boolean} write
 * @param {boolean} includeUnsafe
 * @param {boolean} safeMode
 */
async function applyBiome(profile, allFiles, write, includeUnsafe, safeMode) {
  const configRoot = await mkdtemp(path.join(os.tmpdir(), 'cdo-biome-config-'));
  const scratchRoot = write ? null : await mkdtemp(path.join(os.tmpdir(), 'cdo-biome-dry-run-'));
  try {
    const { configPath } = await writeBiomeConfig(profile, configRoot, {
      disableFormatter: safeMode
    });

    /** @type {Map<string, string>} */
    const beforeByFile = new Map();
    /** @type {Map<string, string>} */
    const afterByFile = new Map();
    for (const file of allFiles) {
      beforeByFile.set(file, await readFile(file, 'utf8'));
    }

    const inlineCommentRule = profile.rules.comments.trailingInlineCommentAlignment;
    const inlineCommentStyle =
      inlineCommentRule.status === 'enforced'
        ? inlineCommentRule.value
        : null;
    const singleLineIfRule = profile.rules.controlFlow.singleLineIfBraces;
    const singleLineIfStyle =
      singleLineIfRule.status === 'enforced'
        ? singleLineIfRule.value
        : null;
    const switchBreakRule = profile.rules.whitespace.switchCaseBreakIndentation;
    const switchBreakStyle =
      switchBreakRule?.status === 'enforced'
        ? switchBreakRule.value
        : null;
    const multilineCallRule = profile.rules.whitespace.multilineCallArgumentLayout;
    const multilineCallLayout =
      multilineCallRule?.status === 'enforced'
        ? multilineCallRule.value
        : null;
    const ternaryPlacementRule = profile.rules.syntax.multilineTernaryOperatorPlacement;
    const ternaryPlacement =
      ternaryPlacementRule?.status === 'enforced'
        ? ternaryPlacementRule.value
        : null;
    const memberExpressionRule = profile.rules.whitespace.memberExpressionIndentation;
    const memberExpressionStyle =
      memberExpressionRule?.status === 'enforced'
        ? memberExpressionRule.value
        : null;
    const variableDeclarationCommaRule = profile.rules.syntax.variableDeclarationCommaPlacement;
    const variableDeclarationCommaPlacement =
      variableDeclarationCommaRule?.status === 'enforced'
        ? variableDeclarationCommaRule.value
        : null;
    const indentKindRule = profile.rules.whitespace.indentationKind;
    const indentKind =
      indentKindRule.status === 'enforced' && indentKindRule.value
        ? indentKindRule.value
        : 'space';
    const indentSizeRule = profile.rules.whitespace.indentationSize;
    const indentSize =
      indentSizeRule.status === 'enforced' &&
      typeof indentSizeRule.value === 'number'
        ? indentSizeRule.value
        : 2;

    if (write) {
      runBiomeCheck(configPath, allFiles, includeUnsafe);
      for (const file of allFiles) {
        const before = /** @type {string} */ (beforeByFile.get(file));
        const next = await readFile(file, 'utf8');
        let normalized = applySingleLineIfStyle(next, singleLineIfStyle);
        normalized = applyTernaryLayout(
          normalized,
          ternaryPlacement,
          indentKind,
          indentSize,
          before
        );
        normalized = applyMultilineCallArgumentLayout(normalized, multilineCallLayout);
        normalized = applyMemberExpressionIndentation(
          normalized,
          memberExpressionStyle,
          indentKind,
          indentSize,
          before
        );
        normalized = applyVariableDeclarationCommaPlacement(
          normalized,
          variableDeclarationCommaPlacement
        );
        normalized = applySwitchCaseBreakIndentation(
          normalized,
          switchBreakStyle,
          indentKind,
          indentSize
        );
        normalized = applyInlineCommentStyle(normalized, inlineCommentStyle, before);
        if (normalized !== next) {
          await writeFile(file, normalized, 'utf8');
        }
        afterByFile.set(file, normalized);
      }
    } else {
      const copyTargets = await Promise.all(
        allFiles.map(async (file) => {
          const target = path.join(scratchRoot, path.relative(path.sep, path.resolve(file)));
          await mkdir(path.dirname(target), { recursive: true });
          await copyFile(file, target);
          return { source: file, temp: target };
        })
      );

      runBiomeCheck(
        configPath,
        copyTargets.map((entry) => entry.temp),
        includeUnsafe
      );

      for (const entry of copyTargets) {
        const before = /** @type {string} */ (beforeByFile.get(entry.source));
        const next = await readFile(entry.temp, 'utf8');
        let normalized = applySingleLineIfStyle(next, singleLineIfStyle);
        normalized = applyTernaryLayout(
          normalized,
          ternaryPlacement,
          indentKind,
          indentSize,
          before
        );
        normalized = applyMultilineCallArgumentLayout(normalized, multilineCallLayout);
        normalized = applyMemberExpressionIndentation(
          normalized,
          memberExpressionStyle,
          indentKind,
          indentSize,
          before
        );
        normalized = applyVariableDeclarationCommaPlacement(
          normalized,
          variableDeclarationCommaPlacement
        );
        normalized = applySwitchCaseBreakIndentation(
          normalized,
          switchBreakStyle,
          indentKind,
          indentSize
        );
        normalized = applyInlineCommentStyle(normalized, inlineCommentStyle, before);
        afterByFile.set(entry.source, normalized);
      }
    }

    /** @type {import('../types.js').ApplyFileResult[]} */
    const fileResults = [];
    /** @type {string[]} */
    const diffs = [];

    for (const file of allFiles) {
      const before = /** @type {string} */ (beforeByFile.get(file));
      const after = /** @type {string} */ (afterByFile.get(file) ?? before);
      const changed = before !== after;

      if (!changed) {
        fileResults.push({ file, changed: false, additions: 0, deletions: 0 });
        continue;
      }

      const patch = createTwoFilesPatch(file, file, before, after, 'before', write ? 'after(write)' : 'after(dry-run)');
      const stats = countPatchStats(patch);
      diffs.push(patch);

      fileResults.push({
        file,
        changed: true,
        additions: stats.additions,
        deletions: stats.deletions
      });
    }

    return buildReport(write, allFiles, fileResults, diffs);
  } finally {
    await rm(configRoot, { recursive: true, force: true });
    if (scratchRoot) {
      await rm(scratchRoot, { recursive: true, force: true });
    }
  }
}

/**
 * @param {import('../types.js').ApplyInput} input
 * @returns {Promise<import('../types.js').ApplyReport>}
 */
export async function applyStyle(input) {
  const write = Boolean(input.write);
  if (!input.repoPaths?.length) {
    throw new Error('applyStyle requires repoPaths.');
  }

  const profile = typeof input.profile === 'string'
    ? /** @type {import('../types.js').CdoProfileV1} */ (await readJson(path.resolve(input.profile)))
    : input.profile;

  validateProfile(profile);
  const effectiveProfile = input.safeOnly ? safeOnlyProfile(profile) : profile;
  const allFiles = await collectFiles(input.repoPaths);
  const engine = input.engine ?? 'biome';

  if (engine !== 'biome') {
    throw new Error(`Unknown apply engine: ${engine}. Use biome.`);
  }

  const safeMode = Boolean(input.safeOnly);
  const report = await applyBiome(effectiveProfile, allFiles, write, !safeMode, safeMode);

  if (input.reportPath) {
    await writeJson(path.resolve(input.reportPath), report);
  }

  return report;
}
