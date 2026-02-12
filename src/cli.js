#!/usr/bin/env node
// @ts-check
import path from 'node:path';
import process from 'node:process';
import minimist from 'minimist';
import pkg from '../package.json' with { type: 'json' };
import { learnStyle, generateGuide, generateConfigs, applyStyle, startMcpServer } from './index.js';
import { writeProfile, validateProfile } from './output/profile.js';
import { readJson, writeText } from './util/fs.js';
import { cdoTools } from './mcp/server.js';
import { generateIterationReport } from './output/iteration-report.js';

function help() {
  return `cdo - Coding style learner\n\nCommands:\n  cdo learn --repos <a,b,...> [--author <email>] [--out cdo-profile.json]\n  cdo guide --profile <path> [--out STYLEGUIDE.cdo.md]\n  cdo config --profile <path> [--out-dir .cdo] [--no-oxc]\n  cdo apply --profile <path> --repos <a,b,...> [--engine biome] [--safe-only] [--write] [--report report.json]\n  cdo report --profile <path> --apply-report <path> [--previous-profile <path>] [--out iteration-report.json]\n  cdo mcp\n\nFlags:\n  --max-files <n>\n  --inference <deterministic|llm-mcp>\n  --llm-augmenter-cmd \"<command reading stdin json and writing json>\"\n  --llm-sample <compact|full>\n  --min-evidence <n>\n  --min-confidence <0-1>\n  --version\n`;
}

/**
 * @param {string | string[] | undefined} value
 */
function listArg(value) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * @param {string | undefined} raw
 * @param {string} flag
 */
function parsePositiveInteger(raw, flag) {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${flag}: ${raw}. Expected a positive integer.`);
  }
  return parsed;
}

/**
 * @param {string | undefined} raw
 * @param {string} flag
 */
function parseUnitInterval(raw, flag) {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Invalid ${flag}: ${raw}. Expected a number between 0 and 1.`);
  }
  return parsed;
}

/**
 * @param {string} mode
 */
function parseInferenceMode(mode) {
  if (mode === 'deterministic' || mode === 'llm-mcp') return mode;
  throw new Error(`Invalid --inference value: ${mode}. Use deterministic or llm-mcp.`);
}

/**
 * @param {string} mode
 */
function parseLlmSampleMode(mode) {
  if (mode === 'compact' || mode === 'full') return mode;
  throw new Error(`Invalid --llm-sample value: ${mode}. Use compact or full.`);
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    string: [
      'repos',
      'author',
      'out',
      'profile',
      'apply-report',
      'previous-profile',
      'out-dir',
      'report',
      'engine',
      'inference',
      'llm-augmenter-cmd',
      'llm-sample',
      'max-files',
      'min-evidence',
      'min-confidence'
    ],
    boolean: ['write', 'safe-only', 'help', 'oxc', 'self-test'],
    default: {
      write: false,
      'safe-only': false,
      oxc: true,
      engine: 'biome',
      inference: 'deterministic',
      'llm-sample': 'compact'
    },
    alias: {
      h: 'help',
      v: 'version'
    }
  });

  const [command = 'help'] = argv._;

  if (argv.version || command === 'version') {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  if (argv.help || command === 'help') {
    process.stdout.write(help());
    return;
  }

  if (command === 'learn') {
    const repoPaths = listArg(argv.repos).map((repo) => path.resolve(repo));
    const authors = listArg(argv.author);
    const maxFilesPerRepo = parsePositiveInteger(argv['max-files'], '--max-files');
    const minEvidence = parsePositiveInteger(argv['min-evidence'], '--min-evidence');
    const minConfidence = parseUnitInterval(argv['min-confidence'], '--min-confidence');
    const inferenceMode = parseInferenceMode(String(argv.inference));
    const llmSamplingMode = parseLlmSampleMode(String(argv['llm-sample']));
    const llmAugmenterCommand = argv['llm-augmenter-cmd']
      ? String(argv['llm-augmenter-cmd'])
      : undefined;

    const profile = await learnStyle({
      repoPaths,
      authorEmails: authors,
      maxFilesPerRepo,
      minEvidence,
      minConfidence,
      inferenceMode,
      llmAugmenterCommand,
      llmSamplingMode
    });

    const output = path.resolve(argv.out || 'cdo-profile.json');
    await writeProfile(profile, output);
    process.stdout.write(`${output}\n`);
    return;
  }

  if (command === 'guide') {
    if (!argv.profile) {
      throw new Error('guide requires --profile <path>');
    }

    const profile = await readJson(path.resolve(argv.profile));
    validateProfile(profile);
    const guide = generateGuide(profile);
    const output = path.resolve(argv.out || 'STYLEGUIDE.cdo.md');
    await writeText(output, guide);
    process.stdout.write(`${output}\n`);
    return;
  }

  if (command === 'config') {
    if (!argv.profile) {
      throw new Error('config requires --profile <path>');
    }

    const profile = await readJson(path.resolve(argv.profile));
    validateProfile(profile);

    const outputs = await generateConfigs(profile, {
      outDir: argv['out-dir'] || '.cdo',
      includeOxc: Boolean(argv.oxc)
    });
    process.stdout.write(`${JSON.stringify(outputs, null, 2)}\n`);
    return;
  }

  if (command === 'apply') {
    if (!argv.profile) {
      throw new Error('apply requires --profile <path>');
    }

    const repoPaths = listArg(argv.repos).map((repo) => path.resolve(repo));
    if (!repoPaths.length) {
      throw new Error('apply requires --repos <a,b,...>');
    }

    const report = await applyStyle({
      profile: path.resolve(argv.profile),
      repoPaths,
      engine: argv.engine,
      safeOnly: Boolean(argv['safe-only']),
      write: Boolean(argv.write),
      reportPath: argv.report ? path.resolve(argv.report) : undefined
    });

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  if (command === 'report') {
    if (!argv.profile) {
      throw new Error('report requires --profile <path>');
    }
    if (!argv['apply-report']) {
      throw new Error('report requires --apply-report <path>');
    }

    const profile = await readJson(path.resolve(argv.profile));
    validateProfile(profile);
    const applyReport = await readJson(path.resolve(argv['apply-report']));
    const previousProfile = argv['previous-profile']
      ? await readJson(path.resolve(argv['previous-profile']))
      : null;

    if (previousProfile) validateProfile(previousProfile);

    const iteration = generateIterationReport(profile, applyReport, previousProfile);
    const outFile = path.resolve(argv.out || 'iteration-report.json');
    await writeText(outFile, `${JSON.stringify(iteration, null, 2)}\n`);
    process.stdout.write(`${outFile}\n`);
    return;
  }

  if (command === 'mcp') {
    if (argv['self-test']) {
      process.stdout.write(`${JSON.stringify(cdoTools(), null, 2)}\n`);
      return;
    }

    await startMcpServer();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
