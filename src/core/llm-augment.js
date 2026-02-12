// @ts-check
import { spawnSync } from 'node:child_process';

/**
 * @typedef {{
 *   value?: unknown,
 *   confidence?: number,
 *   evidenceCount?: number
 * }} LlmRuleSuggestion
 */

const KNOWN_RULES = {
  'comments.lineCommentSpacing': {
    values: ['space-after-slashes', 'tight'],
    autoFixSafe: true
  },
  'comments.preferJsdocForFunctions': {
    values: [true, false],
    autoFixSafe: false
  },
  'comments.commentBlockFraming': {
    values: ['framed', 'plain'],
    autoFixSafe: false
  },
  'comments.trailingInlineCommentAlignment': {
    values: ['aligned', 'single-space'],
    autoFixSafe: false
  },
  'naming.functionWordCountPreference': {
    values: ['single-word', 'multi-word'],
    autoFixSafe: false
  },
  'naming.functionExpressionNamingPreference': {
    values: ['named', 'allow-anonymous'],
    autoFixSafe: false
  },
  'controlFlow.singleLineIfBraces': {
    values: ['omit', 'require'],
    autoFixSafe: false
  },
  'controlFlow.guardClauses': {
    values: ['prefer', 'neutral'],
    autoFixSafe: false
  },
  'syntax.quotes': {
    values: ['single', 'double'],
    autoFixSafe: false
  },
  'syntax.semicolons': {
    values: ['always', 'never'],
    autoFixSafe: false
  },
  'syntax.trailingCommas': {
    values: ['always-multiline', 'never'],
    autoFixSafe: false
  },
  'syntax.variableDeclarationCommaPlacement': {
    values: ['leading', 'trailing'],
    autoFixSafe: false
  },
  'syntax.yodaConditions': {
    values: ['always', 'never'],
    autoFixSafe: true
  },
  'syntax.multilineTernaryOperatorPlacement': {
    values: ['leading', 'trailing'],
    autoFixSafe: false
  },
  'syntax.lineWidth': {
    values: [],
    autoFixSafe: false
  },
  'whitespace.indentationKind': {
    values: ['space', 'tab'],
    autoFixSafe: true
  },
  'whitespace.indentationSize': {
    values: [],
    autoFixSafe: true
  },
  'whitespace.switchCaseIndentation': {
    values: ['indent', 'flat'],
    autoFixSafe: true
  },
  'whitespace.switchCaseBreakIndentation': {
    values: ['match-case', 'indent'],
    autoFixSafe: true
  },
  'whitespace.memberExpressionIndentation': {
    values: ['aligned', 'indented'],
    autoFixSafe: false
  },
  'whitespace.multilineCallArgumentLayout': {
    values: ['compact', 'expanded'],
    autoFixSafe: false
  },
  'whitespace.blankLineDensity': {
    values: ['compact', 'spacious'],
    autoFixSafe: false
  },
  'whitespace.blankLineBeforeReturn': {
    values: ['always', 'never'],
    autoFixSafe: false
  },
  'whitespace.blankLineBeforeIf': {
    values: ['always', 'never'],
    autoFixSafe: false
  },
  'imports.ordering': {
    values: ['alphabetical', 'none'],
    autoFixSafe: false
  }
};
const MAX_COMPACT_FILES = 12;
const MAX_COMPACT_CHARS = 5000;

/**
 * @param {number} value
 */
function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * @param {unknown} value
 */
function normalizeRulesMap(value) {
  if (!value || typeof value !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (record.rules && typeof record.rules === 'object') {
    return /** @type {Record<string, unknown>} */ (record.rules);
  }
  return record;
}

/**
 * @param {string} path
 * @param {import('../types.js').CdoProfileV1} profile
 */
function readRule(path, profile) {
  const [section, name] = path.split('.');
  if (!section || !name) return null;
  const sectionValue = /** @type {Record<string, any>} */ (profile.rules)[section];
  if (!sectionValue || typeof sectionValue !== 'object') return null;
  return sectionValue[name] ?? null;
}

/**
 * @param {string} path
 * @param {import('../types.js').CdoProfileV1} profile
 * @param {import('../types.js').InferredRule<any>} rule
 */
function writeRule(path, profile, rule) {
  const [section, name] = path.split('.');
  if (!section || !name) return;

  const rules = /** @type {Record<string, any>} */ (profile.rules);
  const sectionValue = rules[section];
  if (!sectionValue || typeof sectionValue !== 'object') return;

  sectionValue[name] = rule;
}

/**
 * @param {import('../types.js').InferredRule<any> | null} existing
 * @param {import('../types.js').InferredRule<any>} next
 */
function shouldReplace(existing, next) {
  if (!existing) return true;
  if (existing.status !== 'enforced' && next.status === 'enforced') return true;
  if (existing.status === next.status && next.confidence >= existing.confidence + 0.05) return true;
  return false;
}

/**
 * @param {unknown} value
 * @param {{ values: unknown[] }} descriptor
 */
function normalizeValue(value, descriptor) {
  if (descriptor.values.length === 0) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.round(value));
    }
    return null;
  }

  return descriptor.values.includes(value) ? value : null;
}

/**
 * @param {{
 *   profile: import('../types.js').CdoProfileV1,
 *   sampledFiles: Array<{ path: string, source: string }>,
 *   minEvidence: number,
 *   minConfidence: number,
 *   llmAugmenter?: (input: { profile: import('../types.js').CdoProfileV1, sampledFiles: Array<{ path: string, source: string }> }) => any,
 *   llmAugmenterCommand?: string,
 *   llmSamplingMode?: import('../types.js').LlmSamplingMode
 * }} input
 */
export async function maybeAugmentProfileWithLlm(input) {
  const { profile, sampledFiles, minEvidence, minConfidence } = input;
  if (!sampledFiles.length) return profile;

  const response = await callAugmenter(input);
  const suggestions = normalizeRulesMap(response);
  if (!suggestions) return profile;

  let applied = 0;
  for (const [rulePath, rawSuggestion] of Object.entries(suggestions)) {
    const descriptor = /** @type {typeof KNOWN_RULES[keyof typeof KNOWN_RULES] | undefined} */ (KNOWN_RULES[rulePath]);
    if (!descriptor) continue;
    if (!rawSuggestion || typeof rawSuggestion !== 'object') continue;

    const suggestion = /** @type {LlmRuleSuggestion} */ (rawSuggestion);
    const normalizedValue = normalizeValue(suggestion.value, descriptor);
    if (normalizedValue === null) continue;

    const confidence = clamp01(Number(suggestion.confidence ?? 0));
    const evidenceCount = Number.isInteger(suggestion.evidenceCount)
      ? Math.max(0, Number(suggestion.evidenceCount))
      : sampledFiles.length;
    const status =
      evidenceCount >= minEvidence && confidence >= minConfidence
        ? 'enforced'
        : 'undetermined';

    /** @type {import('../types.js').InferredRule<any>} */
    const nextRule = {
      value: status === 'enforced' ? normalizedValue : null,
      status,
      confidence,
      evidenceCount,
      provenance: 'llm_augmented',
      autoFixSafe: descriptor.autoFixSafe
    };

    const current = readRule(rulePath, profile);
    if (!shouldReplace(current, nextRule)) continue;

    writeRule(rulePath, profile, nextRule);
    applied += 1;
  }

  if (applied > 0) {
    profile.evidence.llmRuleSuggestionsApplied = applied;
  }

  return profile;
}

/**
 * @param {{
 *   profile: import('../types.js').CdoProfileV1,
 *   sampledFiles: Array<{ path: string, source: string }>,
 *   llmAugmenter?: (input: { profile: import('../types.js').CdoProfileV1, sampledFiles: Array<{ path: string, source: string }> }) => any,
 *   llmAugmenterCommand?: string,
 *   llmSamplingMode?: import('../types.js').LlmSamplingMode
 * }} input
 */
async function callAugmenter(input) {
  const sampledFiles = selectSampledFiles(input.sampledFiles, input.llmSamplingMode ?? 'compact');

  if (input.llmAugmenter) {
    return input.llmAugmenter({
      profile: input.profile,
      sampledFiles
    });
  }

  const command = input.llmAugmenterCommand || process.env.CDO_LLM_AUGMENTER_CMD;
  if (!command) return null;

  const payload = JSON.stringify({
    profile: input.profile,
    sampledFiles
  });

  const result = spawnSync(command, {
    shell: true,
    input: payload,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim();
    const detail = stderr ? `: ${stderr}` : '';
    throw new Error(`LLM augmenter command failed${detail}`);
  }

  const stdout = String(result.stdout ?? '').trim();
  if (!stdout) return null;
  return JSON.parse(stdout);
}

/**
 * @param {Array<{ path: string, source: string }>} files
 * @param {import('../types.js').LlmSamplingMode} mode
 */
function selectSampledFiles(files, mode) {
  if (mode === 'full') {
    return files.map((file) => ({
      path: file.path,
      source: file.source
    }));
  }

  return compactSampledFiles(files);
}

/**
 * @param {Array<{ path: string, source: string }>} files
 */
function compactSampledFiles(files) {
  return files.slice(0, MAX_COMPACT_FILES).map((file) => ({
    path: file.path,
    source: file.source.length > MAX_COMPACT_CHARS
      ? `${file.source.slice(0, MAX_COMPACT_CHARS)}\n/* ...truncated... */\n`
      : file.source
  }));
}
