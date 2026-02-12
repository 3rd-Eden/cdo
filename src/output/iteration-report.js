// @ts-check
import path from 'node:path';
import { validateProfile } from './profile.js';

/**
 * @param {unknown} value
 */
function isObject(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * @param {unknown} value
 */
function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * @param {unknown} value
 */
function isNonNegativeInteger(value) {
  return Number.isInteger(value) && isNonNegativeNumber(value);
}

/**
 * @param {unknown} report
 */
export function validateApplyReport(report) {
  if (!isObject(report)) {
    throw new Error('Invalid apply report: expected an object.');
  }

  const typed = /** @type {Record<string, unknown>} */ (report);
  if (typed.engine !== 'biome') {
    throw new Error(`Invalid apply report: engine must be "biome".`);
  }
  if (typeof typed.write !== 'boolean') {
    throw new Error('Invalid apply report: write must be a boolean.');
  }
  if (!isNonNegativeInteger(typed.filesScanned)) {
    throw new Error('Invalid apply report: filesScanned must be a non-negative integer.');
  }
  if (!isNonNegativeInteger(typed.filesChanged)) {
    throw new Error('Invalid apply report: filesChanged must be a non-negative integer.');
  }
  if (!Array.isArray(typed.diffs) || !typed.diffs.every((entry) => typeof entry === 'string')) {
    throw new Error('Invalid apply report: diffs must be an array of strings.');
  }
  if (!Array.isArray(typed.files)) {
    throw new Error('Invalid apply report: files must be an array.');
  }

  let changedCount = 0;
  for (const fileEntry of typed.files) {
    if (!isObject(fileEntry)) {
      throw new Error('Invalid apply report: each file entry must be an object.');
    }
    const file = /** @type {Record<string, unknown>} */ (fileEntry);
    if (typeof file.file !== 'string') {
      throw new Error('Invalid apply report: file entry `file` must be a string.');
    }
    if (typeof file.changed !== 'boolean') {
      throw new Error('Invalid apply report: file entry `changed` must be a boolean.');
    }
    if (!isNonNegativeInteger(file.additions) || !isNonNegativeInteger(file.deletions)) {
      throw new Error('Invalid apply report: file entry additions/deletions must be non-negative integers.');
    }
    if (file.changed) changedCount += 1;
  }

  if (typed.files.length !== typed.filesScanned) {
    throw new Error('Invalid apply report: filesScanned must match files.length.');
  }
  if (changedCount !== typed.filesChanged) {
    throw new Error('Invalid apply report: filesChanged must match changed file entries.');
  }
}

/**
 * @param {string} line
 */
function classifyLine(line) {
  if (/^\s*$/.test(line)) return 'blank-lines';
  if (/^\s*\/\//.test(line) || /^\s*\/\*/.test(line)) return 'comments';
  if (/^\s+\S/.test(line)) return 'indentation';
  if (/[ \t]+$/.test(line)) return 'trailing-whitespace';
  return 'other';
}

/**
 * @param {string[]} diffs
 */
function diffStats(diffs) {
  let additions = 0;
  let deletions = 0;
  /** @type {Record<string, number>} */
  const categories = {
    comments: 0,
    indentation: 0,
    'blank-lines': 0,
    'trailing-whitespace': 0,
    other: 0
  };

  for (const diff of diffs) {
    for (const line of diff.split('\n')) {
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@') || line.startsWith('Index:') || line.startsWith('===')) {
        continue;
      }

      if (line.startsWith('+')) {
        additions += 1;
        const category = classifyLine(line.slice(1));
        categories[category] = (categories[category] ?? 0) + 1;
      }

      if (line.startsWith('-')) {
        deletions += 1;
        const category = classifyLine(line.slice(1));
        categories[category] = (categories[category] ?? 0) + 1;
      }
    }
  }

  return {
    additions,
    deletions,
    categories
  };
}

/**
 * @param {import('../types.js').CdoProfileV1} profile
 * @param {import('../types.js').ApplyReport} applyReport
 * @param {import('../types.js').CdoProfileV1 | null} previousProfile
 */
export function generateIterationReport(profile, applyReport, previousProfile = null) {
  validateProfile(profile);
  if (previousProfile) validateProfile(previousProfile);
  validateApplyReport(applyReport);

  const summary = diffStats(applyReport.diffs);

  /** @type {Record<string, number>} */
  const changedByRepo = {};
  const roots = profile.sources.roots.map((root) => path.resolve(root));

  for (const entry of applyReport.files) {
    if (!entry.changed) continue;

    let matched = 'unknown';
    for (const root of roots) {
      if (path.resolve(entry.file).startsWith(root + path.sep) || path.resolve(entry.file) === root) {
        matched = root;
        break;
      }
    }

    changedByRepo[matched] = (changedByRepo[matched] ?? 0) + 1;
  }

  const byRule = profile.confidenceSummary.byRule;
  const previousByRule = previousProfile?.confidenceSummary.byRule ?? {};
  /** @type {Record<string, number>} */
  const deltaByRule = {};

  for (const [rule, value] of Object.entries(byRule)) {
    const previous = previousByRule[rule] ?? 0;
    deltaByRule[rule] = value - previous;
  }

  const confidenceDeltaOverall = previousProfile
    ? profile.confidenceSummary.overall - previousProfile.confidenceSummary.overall
    : null;

  const topChangedCategories = Object.entries(summary.categories)
    .sort((a, b) => b[1] - a[1])
    .filter((entry) => entry[1] > 0)
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  return {
    generatedAt: new Date().toISOString(),
    profileId: profile.profileId,
    schemaVersion: profile.schemaVersion,
    engine: applyReport.engine,
    confidence: {
      overall: profile.confidenceSummary.overall,
      byRule,
      deltaOverall: confidenceDeltaOverall,
      deltaByRule
    },
    diff: {
      filesScanned: applyReport.filesScanned,
      filesChanged: applyReport.filesChanged,
      additions: summary.additions,
      deletions: summary.deletions,
      changedByRepo,
      topChangedCategories
    }
  };
}
