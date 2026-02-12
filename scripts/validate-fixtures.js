#!/usr/bin/env node
// @ts-check
import path from 'node:path';
import { stat, copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

const DEFAULT_REPO_NAMES = ['liferaft', 'url-parse', 'recovery'];

/**
 * @param {string | undefined} value
 */
function listArg(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * @param {string} filePath
 */
async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string[]} args
 */
function runCli(args) {
  const result = spawnSync(process.execPath, ['./src/cli.js', ...args], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`cdo ${args.join(' ')} failed`);
  }
}

/**
 * @param {unknown} value
 * @param {boolean} fallback
 */
function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

/**
 * @param {string} applyReportPath
 */
async function readApplyReport(applyReportPath) {
  const raw = await readFile(applyReportPath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    string: [
      'root',
      'author',
      'engine',
      'max-changed-files',
      'max-changed-lines',
      'summary-out',
      'repos',
      'min-confidence',
      'min-evidence'
    ],
    boolean: ['safe-only'],
    default: {
      engine: 'biome',
      author: 'info@3rd-Eden.com',
      'safe-only': true
    }
  });

  const fixtureRoot = path.resolve(
    argv.root || process.env.CDO_FIXTURE_ROOT || path.join(PROJECT_ROOT, '.fixtures', 'style-fixtures')
  );

  const repoNames = listArg(argv.repos || process.env.CDO_FIXTURE_REPO_NAMES);
  const names = repoNames.length ? repoNames : DEFAULT_REPO_NAMES;
  const repoPaths = names.map((name) => path.resolve(fixtureRoot, name));
  const safeOnly = parseBoolean(process.env.CDO_FIXTURE_SAFE_ONLY, Boolean(argv['safe-only']));

  const profilePath = path.resolve(fixtureRoot, 'cdo-profile.json');
  const previousProfilePath = path.resolve(fixtureRoot, 'cdo-profile.previous.json');
  const guidePath = path.resolve(fixtureRoot, 'STYLEGUIDE.cdo.md');
  const applyReportPath = path.resolve(fixtureRoot, 'cdo-apply-report.json');
  const iterationReportPath = path.resolve(fixtureRoot, 'cdo-iteration-report.json');
  const configDir = path.resolve(fixtureRoot, '.cdo');
  const summaryOut = argv['summary-out'] ?? process.env.CDO_FIXTURE_SUMMARY_OUT ?? null;

  for (const repoPath of repoPaths) {
    if (!(await exists(path.resolve(repoPath, '.git')))) {
      throw new Error(`Missing fixture repo at ${repoPath}. Run: npm run fixtures:setup`);
    }
  }

  if (await exists(profilePath)) {
    await copyFile(profilePath, previousProfilePath);
  }

  const minConfidenceRaw = argv['min-confidence'] ?? process.env.CDO_MIN_CONFIDENCE;
  const minEvidenceRaw = argv['min-evidence'] ?? process.env.CDO_MIN_EVIDENCE;

  /** @type {string[]} */
  const learnArgs = [
    'learn',
    '--repos',
    repoPaths.join(','),
    '--author',
    argv.author,
    '--out',
    profilePath
  ];

  if (minConfidenceRaw !== undefined && minConfidenceRaw !== null && minConfidenceRaw !== '') {
    const minConfidence = Number(minConfidenceRaw);
    if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
      throw new Error(`Invalid min-confidence value: ${minConfidenceRaw}`);
    }
    learnArgs.push('--min-confidence', String(minConfidence));
  }

  if (minEvidenceRaw !== undefined && minEvidenceRaw !== null && minEvidenceRaw !== '') {
    const minEvidence = Number(minEvidenceRaw);
    if (!Number.isInteger(minEvidence) || minEvidence < 1) {
      throw new Error(`Invalid min-evidence value: ${minEvidenceRaw}`);
    }
    learnArgs.push('--min-evidence', String(minEvidence));
  }

  runCli(learnArgs);

  runCli(['guide', '--profile', profilePath, '--out', guidePath]);
  runCli(['config', '--profile', profilePath, '--out-dir', configDir]);

  /** @type {string[]} */
  const applyArgs = [
    'apply',
    '--engine',
    argv.engine,
    '--profile',
    profilePath,
    '--repos',
    repoPaths.join(','),
    '--report',
    applyReportPath
  ];
  if (safeOnly) {
    applyArgs.push('--safe-only');
  }
  runCli(applyArgs);

  /** @type {string[]} */
  const reportArgs = ['report', '--profile', profilePath, '--apply-report', applyReportPath];
  if (await exists(previousProfilePath)) {
    reportArgs.push('--previous-profile', previousProfilePath);
  }
  reportArgs.push('--out', iterationReportPath);
  runCli(reportArgs);

  const applyReport = await readApplyReport(applyReportPath);
  const maxChangedRaw = argv['max-changed-files'] ?? process.env.CDO_MAX_CHANGED_FILES;
  const maxChanged = maxChangedRaw ? Number(maxChangedRaw) : null;
  const maxChangedLinesRaw = argv['max-changed-lines'] ?? process.env.CDO_MAX_CHANGED_LINES;
  const maxChangedLines = maxChangedLinesRaw ? Number(maxChangedLinesRaw) : null;
  const totalChangedLines = applyReport.files.reduce((sum, file) => sum + file.additions + file.deletions, 0);

  process.stdout.write(`Fixture validation complete:\n`);
  process.stdout.write(`- Profile: ${profilePath}\n`);
  process.stdout.write(`- Guide: ${guidePath}\n`);
  process.stdout.write(`- Config dir: ${configDir}\n`);
  process.stdout.write(`- Apply report: ${applyReportPath}\n`);
  process.stdout.write(`- Iteration report: ${iterationReportPath}\n`);
  process.stdout.write(`- Apply engine: ${applyReport.engine}\n`);
  process.stdout.write(`- Safe-only: ${safeOnly}\n`);
  process.stdout.write(`- Files changed: ${applyReport.filesChanged}/${applyReport.filesScanned}\n`);
  process.stdout.write(`- Total changed lines: ${totalChangedLines}\n`);

  if (maxChanged !== null) {
    if (!Number.isFinite(maxChanged) || maxChanged < 0) {
      throw new Error(`Invalid max-changed-files value: ${maxChangedRaw}`);
    }

    if (applyReport.filesChanged > maxChanged) {
      throw new Error(
        `Fixture diff threshold exceeded: ${applyReport.filesChanged} changed files > max ${maxChanged}`
      );
    }

    process.stdout.write(`- Threshold: pass (<= ${maxChanged})\n`);
  }

  if (maxChangedLines !== null) {
    if (!Number.isFinite(maxChangedLines) || maxChangedLines < 0) {
      throw new Error(`Invalid max-changed-lines value: ${maxChangedLinesRaw}`);
    }

    if (totalChangedLines > maxChangedLines) {
      throw new Error(
        `Fixture changed-line threshold exceeded: ${totalChangedLines} > max ${maxChangedLines}`
      );
    }

    process.stdout.write(`- Line threshold: pass (<= ${maxChangedLines})\n`);
  }

  if (summaryOut) {
    const summaryPath = path.resolve(summaryOut);
    const thresholdFilePass = maxChanged === null ? null : applyReport.filesChanged <= maxChanged;
    const thresholdLinePass = maxChangedLines === null ? null : totalChangedLines <= maxChangedLines;
    const overallPass = [thresholdFilePass, thresholdLinePass].every((value) => value !== false);

    const summary = {
      generatedAt: new Date().toISOString(),
      fixtureRoot,
      profilePath,
      guidePath,
      configDir,
      applyReportPath,
      iterationReportPath,
      engine: applyReport.engine,
      safeOnly,
      filesScanned: applyReport.filesScanned,
      filesChanged: applyReport.filesChanged,
      totalChangedLines,
      thresholds: {
        maxChangedFiles: maxChanged,
        maxChangedLines,
        fileThresholdPass: thresholdFilePass,
        lineThresholdPass: thresholdLinePass
      },
      pass: overallPass
    };

    await mkdir(path.dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    process.stdout.write(`- Summary: ${summaryPath}\n`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
