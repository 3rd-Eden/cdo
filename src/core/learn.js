// @ts-check
import { resolveRepos, listTrackedSourceFiles, fileRecencyMap } from './discovery.js';
import { sampleFiles } from './filter.js';
import { parseSourceFile } from './parse.js';
import { extractFileSignals } from './extractors/index.js';
import { aggregateSignals } from './aggregate.js';
import { inferProfile } from './infer.js';
import { maybeAugmentProfileWithLlm } from './llm-augment.js';

const DEFAULT_MAX_FILES_PER_REPO = 400;
const DEFAULT_MIN_EVIDENCE = 30;
const DEFAULT_MIN_CONFIDENCE = 0.75;
const VALID_INFERENCE_MODES = new Set(['deterministic', 'llm-mcp']);
const VALID_LLM_SAMPLING_MODES = new Set(['compact', 'full']);

/**
 * Keep author-style inference centered on primary source files.
 * Test/example/demo files often use intentionally short anonymous callbacks.
 * @param {string} filePath
 */
function isTestLikePath(filePath) {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase();
  const base = normalized.split('/').pop() ?? '';

  if (/(^|\/)test(s)?(\/|$)/.test(normalized)) return true;
  if (/(^|\/)example(s)?(\/|$)/.test(normalized)) return true;
  if (/(^|\/)fixtures?(\/|$)/.test(normalized)) return true;
  if (/(^|\/)bench(mark)?(\/|$)/.test(normalized)) return true;
  if (/(^|\/)__tests__(\/|$)/.test(normalized)) return true;
  if (/(^|\/)__mocks__(\/|$)/.test(normalized)) return true;
  if (/(^|\/)__fixtures__(\/|$)/.test(normalized)) return true;
  if (/(^|\/)spec(s)?(\/|$)/.test(normalized)) return true;
  if (/(^|\/)demo(s)?(\/|$)/.test(normalized)) return true;
  if (/(^|\/)samples?(\/|$)/.test(normalized)) return true;
  if (/(^|\/)scripts?(\/|$)/.test(normalized)) return true;
  if (/(^|\/)docs?(\/|$)/.test(normalized)) return true;
  if (/(^|\/)dist(\/|$)/.test(normalized)) return true;

  if (/^test(\.|-)/.test(base)) return true;
  if (/\.test\.[^.]+$/.test(base)) return true;
  if (/\.spec\.[^.]+$/.test(base)) return true;
  if (/^example(\.|-)/.test(base)) return true;
  if (/^bench(\.|-)/.test(base)) return true;

  return false;
}

/**
 * @param {import('../types.js').LearnInput} input
 */
export async function learnStyle(input) {
  if (!input.repoPaths?.length) {
    throw new Error('learnStyle requires at least one repository path.');
  }

  const maxFilesPerRepo = input.maxFilesPerRepo ?? DEFAULT_MAX_FILES_PER_REPO;
  const minEvidence = input.minEvidence ?? DEFAULT_MIN_EVIDENCE;
  const minConfidence = input.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const inferenceMode = input.inferenceMode ?? 'deterministic';
  const llmSamplingMode = input.llmSamplingMode ?? 'compact';

  if (!Number.isInteger(maxFilesPerRepo) || maxFilesPerRepo < 1) {
    throw new Error(`Invalid maxFilesPerRepo: ${maxFilesPerRepo}. Expected a positive integer.`);
  }
  if (!Number.isInteger(minEvidence) || minEvidence < 1) {
    throw new Error(`Invalid minEvidence: ${minEvidence}. Expected a positive integer.`);
  }
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    throw new Error(`Invalid minConfidence: ${minConfidence}. Expected a number between 0 and 1.`);
  }
  if (!VALID_INFERENCE_MODES.has(inferenceMode)) {
    throw new Error(`Invalid inferenceMode: ${inferenceMode}. Use deterministic or llm-mcp.`);
  }
  if (!VALID_LLM_SAMPLING_MODES.has(llmSamplingMode)) {
    throw new Error(`Invalid llmSamplingMode: ${llmSamplingMode}. Use compact or full.`);
  }

  const roots = await resolveRepos(input.repoPaths);

  /** @type {Array<{root: string, files: string[]}>} */
  const sampledPerRepo = [];
  /** @type {Set<string>} */
  const authorEmails = new Set(input.authorEmails ?? []);
  /** @type {import('./extractors/signals.js').FileSignals[]} */
  const fileSignals = [];
  /** @type {Array<{ path: string, source: string }>} */
  const sampledSources = [];

  for (const root of roots) {
    const trackedFiles = await listTrackedSourceFiles(root);
    const recency = await fileRecencyMap(root);
    const sampled = await sampleFiles({
      root,
      trackedFiles,
      recency,
      authorEmails: input.authorEmails,
      maxFilesPerRepo
    });

    sampledPerRepo.push({
      root,
      files: sampled.files
    });
    for (const email of sampled.emails) authorEmails.add(email);

    for (const file of sampled.files) {
      try {
        const parsed = await parseSourceFile(file);
        const signals = extractFileSignals(parsed.source, parsed.ast);
        if (isTestLikePath(file)) {
          signals.functionExprNamed = 0;
          signals.functionExprAnonymous = 0;
        }
        fileSignals.push(signals);
        sampledSources.push({ path: file, source: parsed.source });
      } catch {
        // Skip parse failures. We only rely on successfully parsed files.
      }
    }
  }

  if (!fileSignals.length) {
    const authorHint = input.authorEmails?.length
      ? ` for author(s): ${input.authorEmails.join(', ')}`
      : '';
    throw new Error(
      `No parsable source files were found after sampling${authorHint}. ` +
      'Check repo paths, author filters, and file extensions.'
    );
  }

  const aggregate = aggregateSignals(fileSignals);
  const profile = inferProfile({
    aggregate,
    roots,
    perRepo: sampledPerRepo,
    filesAnalyzed: fileSignals.length,
    authorEmails: [...authorEmails],
    maxFilesPerRepo,
    minEvidence,
    minConfidence,
    inferenceMode
  });

  if (inferenceMode === 'llm-mcp') {
    return maybeAugmentProfileWithLlm({
      profile,
      sampledFiles: sampledSources,
      minEvidence,
      minConfidence,
      llmAugmenter: input.llmAugmenter,
      llmAugmenterCommand: input.llmAugmenterCommand,
      llmSamplingMode
    });
  }

  return profile;
}
