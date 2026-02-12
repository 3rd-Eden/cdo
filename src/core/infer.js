// @ts-check
import { randomUUID } from 'node:crypto';

/**
 * @typedef {import('../types.js').CdoProfileV1} CdoProfileV1
 */

/**
 * @template T
 * @param {{
 *   yes: number,
 *   no: number,
 *   yesValue: T,
 *   noValue: T,
 *   minEvidence: number,
 *   minConfidence: number,
 *   autoFixSafe?: boolean,
 *   provenance?: 'deterministic' | 'llm_augmented'
 * }} options
 * @returns {import('../types.js').InferredRule<T>}
 */
function binaryRule(options) {
  const {
    yes,
    no,
    yesValue,
    noValue,
    minEvidence,
    minConfidence,
    autoFixSafe = false,
    provenance = 'deterministic'
  } = options;

  const total = yes + no;
  if (total === 0) {
    return {
      value: null,
      status: 'undetermined',
      confidence: 0,
      evidenceCount: 0,
      provenance,
      autoFixSafe
    };
  }

  const winner = yes >= no ? yes : no;
  const value = yes >= no ? yesValue : noValue;
  const confidence = winner / total;
  const status = winner >= minEvidence && confidence >= minConfidence ? 'enforced' : 'undetermined';

  return {
    value: status === 'enforced' ? value : null,
    status,
    confidence,
    evidenceCount: winner,
    provenance,
    autoFixSafe
  };
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
}

/**
 * Infer indentation unit from observed leading-space widths.
 * @param {Record<string, number>} entries
 */
function inferIndentUnit(entries) {
  const values = Object.entries(entries)
    .map(([size, count]) => ({ size: Number.parseInt(size, 10), count }))
    .filter((entry) => Number.isFinite(entry.size) && entry.size > 0 && entry.count > 0);

  if (!values.length) return 2;

  let unit = values[0].size;
  for (const entry of values.slice(1)) {
    unit = gcd(unit, entry.size);
  }

  if (unit >= 2 && unit <= 8) return unit;

  const candidates = [2, 4, 8];
  let best = { value: 2, score: -1 };
  for (const candidate of candidates) {
    const score = values
      .filter((entry) => entry.size % candidate === 0)
      .reduce((sum, entry) => sum + entry.count, 0);
    if (score > best.score) best = { value: candidate, score };
  }

  if (best.score > 0) return best.value;

  return values.sort((a, b) => a.size - b.size)[0].size;
}

/**
 * @param {number} blankLines
 * @param {number} totalLines
 * @param {number} minEvidence
 * @param {number} minConfidence
 */
function densityRule(blankLines, totalLines, minEvidence, minConfidence) {
  if (totalLines === 0) {
    return {
      value: null,
      status: 'undetermined',
      confidence: 0,
      evidenceCount: 0,
      provenance: 'deterministic',
      autoFixSafe: false
    };
  }

  const density = blankLines / totalLines;
  const value = density <= 0.15 ? 'compact' : 'spacious';
  const confidence = 1 - Math.min(Math.abs(density - (value === 'compact' ? 0.12 : 0.25)), 0.2);
  const status = totalLines >= minEvidence && confidence >= minConfidence ? 'enforced' : 'undetermined';

  return {
    value: status === 'enforced' ? value : null,
    status,
    confidence,
    evidenceCount: totalLines,
    provenance: 'deterministic',
    autoFixSafe: false
  };
}

/**
 * @param {number} maxLineLength
 * @param {number} nonBlankLines
 * @param {number} minEvidence
 * @param {number} minConfidence
 */
function inferLineWidth(maxLineLength, nonBlankLines, minEvidence, minConfidence) {
  const evidenceCount = Math.max(0, nonBlankLines);
  if (maxLineLength <= 0 || evidenceCount === 0) {
    return {
      value: null,
      status: 'undetermined',
      confidence: 0,
      evidenceCount,
      provenance: 'deterministic',
      autoFixSafe: false
    };
  }

  const candidates = [80, 90, 100, 110, 120, 140, 160];
  const target = Math.max(80, Math.min(maxLineLength, 160));
  const value = candidates.find((candidate) => candidate >= target) ?? 160;
  const confidence = Math.max(0.5, Math.min(1, maxLineLength / value));
  const status =
    evidenceCount >= minEvidence && confidence >= minConfidence
      ? 'enforced'
      : 'undetermined';

  return {
    value: status === 'enforced' ? value : null,
    status,
    confidence,
    evidenceCount,
    provenance: 'deterministic',
    autoFixSafe: false
  };
}

/**
 * @param {{
 *   aggregate: import('./extractors/signals.js').FileSignals,
 *   roots: string[],
 *   perRepo: Array<{ root: string, files: string[] }>,
 *   filesAnalyzed: number,
 *   authorEmails: string[],
 *   maxFilesPerRepo: number,
 *   minEvidence: number,
 *   minConfidence: number,
 *   inferenceMode: 'deterministic' | 'llm-mcp'
 * }} input
 * @returns {CdoProfileV1}
 */
export function inferProfile(input) {
  const {
    aggregate,
    roots,
    perRepo,
    filesAnalyzed,
    authorEmails,
    maxFilesPerRepo,
    minEvidence,
    minConfidence,
    inferenceMode
  } = input;

  const provenance = 'deterministic';
  const sparseEvidence = Math.max(2, Math.floor(minEvidence / 3));
  const ultraSparseEvidence = Math.max(2, Math.floor(minEvidence / 5));

  const commentsLine = binaryRule({
    yes: aggregate.lineCommentSpace,
    no: aggregate.lineCommentTight,
    yesValue: 'space-after-slashes',
    noValue: 'tight',
    minEvidence,
    minConfidence,
    autoFixSafe: true,
    provenance
  });

  const jsdoc = binaryRule({
    yes: aggregate.functionsWithJsdoc,
    no: Math.max(aggregate.functionsTotal - aggregate.functionsWithJsdoc, 0),
    yesValue: true,
    noValue: false,
    minEvidence: sparseEvidence,
    minConfidence,
    provenance
  });

  const commentBlockFraming = binaryRule({
    yes: aggregate.commentFramedBlocks,
    no: aggregate.commentPlainBlocks,
    yesValue: 'framed',
    noValue: 'plain',
    minEvidence: sparseEvidence,
    minConfidence,
    provenance
  });

  const trailingInlineCommentAlignment = binaryRule({
    yes: aggregate.trailingInlineCommentAlignedPairs,
    no: aggregate.trailingInlineCommentUnalignedPairs,
    yesValue: 'aligned',
    noValue: 'single-space',
    minEvidence: ultraSparseEvidence,
    minConfidence,
    provenance
  });

  const fnWords = binaryRule({
    yes: aggregate.functionNamesSingle,
    no: aggregate.functionNamesMulti,
    yesValue: 'single-word',
    noValue: 'multi-word',
    minEvidence,
    minConfidence,
    provenance
  });

  const fnExpressionNaming = binaryRule({
    yes: aggregate.functionExprNamed,
    no: aggregate.functionExprAnonymous,
    yesValue: 'named',
    noValue: 'allow-anonymous',
    minEvidence: sparseEvidence,
    minConfidence,
    provenance
  });

  const braces = binaryRule({
    yes: aggregate.ifWithoutBraces,
    no: aggregate.ifWithBraces,
    yesValue: 'omit',
    noValue: 'require',
    minEvidence,
    minConfidence,
    provenance
  });

  const guardClauses = binaryRule({
    yes: aggregate.guardClauseFunctions,
    no: aggregate.nonGuardClauseFunctions,
    yesValue: 'prefer',
    noValue: 'neutral',
    minEvidence: sparseEvidence,
    minConfidence,
    provenance
  });

  const quotes = binaryRule({
    yes: aggregate.quotesSingle,
    no: aggregate.quotesDouble,
    yesValue: 'single',
    noValue: 'double',
    minEvidence,
    minConfidence,
    provenance
  });

  const semicolons = binaryRule({
    yes: aggregate.semicolonsYes,
    no: aggregate.semicolonsNo,
    yesValue: 'always',
    noValue: 'never',
    minEvidence,
    minConfidence,
    autoFixSafe: false,
    provenance
  });

  const trailingCommas = binaryRule({
    yes: aggregate.trailingCommaYes,
    no: aggregate.trailingCommaNo,
    yesValue: 'always-multiline',
    noValue: 'never',
    minEvidence,
    minConfidence,
    autoFixSafe: false,
    provenance
  });

  const variableDeclarationCommaPlacement = binaryRule({
    yes: aggregate.variableDeclarationCommaLeading,
    no: aggregate.variableDeclarationCommaTrailing,
    yesValue: 'leading',
    noValue: 'trailing',
    minEvidence: sparseEvidence,
    minConfidence,
    autoFixSafe: false,
    provenance
  });

  const yodaConditions = binaryRule({
    yes: aggregate.yodaConditionsYes,
    no: aggregate.yodaConditionsNo,
    yesValue: 'always',
    noValue: 'never',
    minEvidence: sparseEvidence,
    minConfidence,
    provenance
  });

  const multilineTernaryOperatorPlacement = binaryRule({
    yes: aggregate.ternaryMultilineLeading,
    no: aggregate.ternaryMultilineTrailing,
    yesValue: 'leading',
    noValue: 'trailing',
    minEvidence: Math.max(2, Math.floor(minEvidence / 10)),
    minConfidence,
    autoFixSafe: false,
    provenance
  });

  const indentationKind = binaryRule({
    yes: aggregate.indentSpaceLines,
    no: aggregate.indentTabLines,
    yesValue: 'space',
    noValue: 'tab',
    minEvidence,
    minConfidence,
    autoFixSafe: true,
    provenance
  });

  const indentationSize = {
    value: indentationKind.status === 'enforced' && indentationKind.value === 'space' ? inferIndentUnit(aggregate.indentSpaceSizes) : null,
    status:
      indentationKind.status === 'enforced' && indentationKind.value === 'space'
        ? 'enforced'
        : 'undetermined',
    confidence: indentationKind.confidence,
    evidenceCount: aggregate.indentSpaceLines,
    provenance,
    autoFixSafe: true
  };

  const switchCaseIndentation = binaryRule({
    yes: aggregate.switchCaseIndented,
    no: aggregate.switchCaseFlat,
    yesValue: 'indent',
    noValue: 'flat',
    minEvidence: Math.max(2, Math.floor(minEvidence / 4)),
    minConfidence,
    autoFixSafe: true,
    provenance
  });

  const switchCaseBreakIndentation = binaryRule({
    yes: aggregate.switchCaseBreakMatchCase,
    no: aggregate.switchCaseBreakIndented,
    yesValue: 'match-case',
    noValue: 'indent',
    minEvidence: Math.max(2, Math.floor(minEvidence / 4)),
    minConfidence: Math.max(0.55, minConfidence - 0.2),
    autoFixSafe: true,
    provenance
  });

  const multilineCallArgumentLayout = binaryRule({
    yes: aggregate.multilineCallArgumentCompact,
    no: aggregate.multilineCallArgumentExpanded,
    yesValue: 'compact',
    noValue: 'expanded',
    minEvidence: sparseEvidence,
    minConfidence,
    autoFixSafe: false,
    provenance
  });

  const memberExpressionFileVotes = aggregate.memberExprAlignedFiles + aggregate.memberExprIndentedFiles;
  const memberExpressionFileMinEvidence = minEvidence <= 2 ? 1 : 2;
  const memberAlignedEvidence = memberExpressionFileVotes > 0
    ? aggregate.memberExprAlignedFiles
    : aggregate.memberExprAligned;
  const memberIndentedEvidence = memberExpressionFileVotes > 0
    ? aggregate.memberExprIndentedFiles
    : aggregate.memberExprIndented;

  const memberExpressionIndentation = binaryRule({
    yes: memberAlignedEvidence,
    no: memberIndentedEvidence,
    yesValue: 'aligned',
    noValue: 'indented',
    minEvidence: memberExpressionFileVotes > 0 ? memberExpressionFileMinEvidence : Math.max(2, Math.floor(minEvidence / 4)),
    minConfidence: memberExpressionFileVotes > 0 ? Math.max(0.6, minConfidence - 0.15) : minConfidence,
    autoFixSafe: false,
    provenance
  });

  const blankLineDensity = densityRule(aggregate.blankLines, aggregate.totalLines, minEvidence, minConfidence);

  const blankLineBeforeReturn = binaryRule({
    yes: aggregate.blankLineBeforeReturnYes,
    no: aggregate.blankLineBeforeReturnNo,
    yesValue: 'always',
    noValue: 'never',
    minEvidence: sparseEvidence,
    minConfidence,
    autoFixSafe: false,
    provenance
  });

  const blankLineBeforeIf = binaryRule({
    yes: aggregate.blankLineBeforeIfYes,
    no: aggregate.blankLineBeforeIfNo,
    yesValue: 'always',
    noValue: 'never',
    minEvidence: sparseEvidence,
    minConfidence,
    autoFixSafe: false,
    provenance
  });

  const lineWidth = inferLineWidth(
    aggregate.lineLengthMax,
    aggregate.totalLines - aggregate.blankLines,
    minEvidence,
    minConfidence
  );

  const importsOrdering = binaryRule({
    yes: aggregate.importSortedGroups,
    no: aggregate.importUnsortedGroups,
    yesValue: 'alphabetical',
    noValue: 'none',
    minEvidence: Math.max(2, Math.floor(minEvidence / 4)),
    minConfidence,
    autoFixSafe: false,
    provenance
  });

  const byRule = {
    'comments.lineCommentSpacing': commentsLine.confidence,
    'comments.preferJsdocForFunctions': jsdoc.confidence,
    'comments.commentBlockFraming': commentBlockFraming.confidence,
    'comments.trailingInlineCommentAlignment': trailingInlineCommentAlignment.confidence,
    'naming.functionWordCountPreference': fnWords.confidence,
    'naming.functionExpressionNamingPreference': fnExpressionNaming.confidence,
    'controlFlow.singleLineIfBraces': braces.confidence,
    'controlFlow.guardClauses': guardClauses.confidence,
    'syntax.quotes': quotes.confidence,
    'syntax.semicolons': semicolons.confidence,
    'syntax.trailingCommas': trailingCommas.confidence,
    'syntax.variableDeclarationCommaPlacement': variableDeclarationCommaPlacement.confidence,
    'syntax.yodaConditions': yodaConditions.confidence,
    'syntax.multilineTernaryOperatorPlacement': multilineTernaryOperatorPlacement.confidence,
    'syntax.lineWidth': lineWidth.confidence,
    'whitespace.indentationKind': indentationKind.confidence,
    'whitespace.indentationSize': indentationSize.confidence,
    'whitespace.switchCaseIndentation': switchCaseIndentation.confidence,
    'whitespace.switchCaseBreakIndentation': switchCaseBreakIndentation.confidence,
    'whitespace.memberExpressionIndentation': memberExpressionIndentation.confidence,
    'whitespace.multilineCallArgumentLayout': multilineCallArgumentLayout.confidence,
    'whitespace.blankLineDensity': blankLineDensity.confidence,
    'whitespace.blankLineBeforeReturn': blankLineBeforeReturn.confidence,
    'whitespace.blankLineBeforeIf': blankLineBeforeIf.confidence,
    'imports.ordering': importsOrdering.confidence
  };

  const confidenceValues = Object.values(byRule).filter((value) => Number.isFinite(value));
  const overall = confidenceValues.length
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0;

  /** @type {CdoProfileV1} */
  const profile = {
    schemaVersion: '1.0.0',
    profileId: randomUUID(),
    createdAt: new Date().toISOString(),
    author: {
      mode: authorEmails.length ? 'single-author' : 'all-authors',
      emails: authorEmails
    },
    sampleWindow: {
      maxFilesPerRepo,
      perRepo: perRepo.map((entry) => ({
        root: entry.root,
        fileCount: entry.files.length,
        sampledFiles: entry.files
      }))
    },
    sources: {
      roots,
      filesAnalyzed
    },
    rules: {
      comments: {
        lineCommentSpacing: /** @type {any} */ (commentsLine),
        preferJsdocForFunctions: /** @type {any} */ (jsdoc),
        commentBlockFraming: /** @type {any} */ (commentBlockFraming),
        trailingInlineCommentAlignment: /** @type {any} */ (trailingInlineCommentAlignment)
      },
      naming: {
        functionWordCountPreference: /** @type {any} */ (fnWords),
        functionExpressionNamingPreference: /** @type {any} */ (fnExpressionNaming)
      },
      controlFlow: {
        singleLineIfBraces: /** @type {any} */ (braces),
        guardClauses: /** @type {any} */ (guardClauses)
      },
      syntax: {
        quotes: /** @type {any} */ (quotes),
        semicolons: /** @type {any} */ (semicolons),
        trailingCommas: /** @type {any} */ (trailingCommas),
        variableDeclarationCommaPlacement: /** @type {any} */ (variableDeclarationCommaPlacement),
        yodaConditions: /** @type {any} */ (yodaConditions),
        multilineTernaryOperatorPlacement: /** @type {any} */ (multilineTernaryOperatorPlacement),
        lineWidth: /** @type {any} */ (lineWidth)
      },
      whitespace: {
        indentationKind: /** @type {any} */ (indentationKind),
        indentationSize: /** @type {any} */ (indentationSize),
        switchCaseIndentation: /** @type {any} */ (switchCaseIndentation),
        switchCaseBreakIndentation: /** @type {any} */ (switchCaseBreakIndentation),
        memberExpressionIndentation: /** @type {any} */ (memberExpressionIndentation),
        multilineCallArgumentLayout: /** @type {any} */ (multilineCallArgumentLayout),
        blankLineDensity: /** @type {any} */ (blankLineDensity),
        blankLineBeforeReturn: /** @type {any} */ (blankLineBeforeReturn),
        blankLineBeforeIf: /** @type {any} */ (blankLineBeforeIf)
      },
      imports: {
        ordering: /** @type {any} */ (importsOrdering)
      }
    },
    evidence: {
      lineComments: aggregate.lineCommentSpace + aggregate.lineCommentTight,
      functions: aggregate.functionsTotal,
      functionNames: aggregate.functionNamesSingle + aggregate.functionNamesMulti,
      functionExpressions: aggregate.functionExprNamed + aggregate.functionExprAnonymous,
      ifStatements: aggregate.ifWithBraces + aggregate.ifWithoutBraces,
      yodaComparisons: aggregate.yodaConditionsYes + aggregate.yodaConditionsNo,
      multilineTernaries: aggregate.ternaryMultilineLeading + aggregate.ternaryMultilineTrailing,
      guardClauseFunctions: aggregate.guardClauseFunctions + aggregate.nonGuardClauseFunctions,
      commentBlocks: aggregate.commentFramedBlocks + aggregate.commentPlainBlocks,
      trailingInlineCommentPairs: aggregate.trailingInlineCommentAlignedPairs + aggregate.trailingInlineCommentUnalignedPairs,
      strings: aggregate.quotesSingle + aggregate.quotesDouble,
      semicolonStatements: aggregate.semicolonsYes + aggregate.semicolonsNo,
      trailingCommaSites: aggregate.trailingCommaYes + aggregate.trailingCommaNo,
      variableDeclarationCommaPlacements:
        aggregate.variableDeclarationCommaLeading + aggregate.variableDeclarationCommaTrailing,
      indentationLines: aggregate.indentSpaceLines + aggregate.indentTabLines,
      blankLineBeforeReturnSites: aggregate.blankLineBeforeReturnYes + aggregate.blankLineBeforeReturnNo,
      blankLineBeforeIfSites: aggregate.blankLineBeforeIfYes + aggregate.blankLineBeforeIfNo,
      switchCaseLabels: aggregate.switchCaseIndented + aggregate.switchCaseFlat,
      switchCaseBreaks: aggregate.switchCaseBreakMatchCase + aggregate.switchCaseBreakIndented,
      memberExpressionChains: aggregate.memberExprAligned + aggregate.memberExprIndented,
      multilineCalls: aggregate.multilineCallArgumentCompact + aggregate.multilineCallArgumentExpanded,
      maxLineLength: aggregate.lineLengthMax,
      importGroups: aggregate.importSortedGroups + aggregate.importUnsortedGroups
    },
    confidenceSummary: {
      overall,
      byRule
    },
    nonFixablePreferences: [
      {
        rule: 'naming.functionWordCountPreference',
        reason: 'Renaming functions can break public APIs and call sites.'
      },
      {
        rule: 'naming.functionExpressionNamingPreference',
        reason: 'Converting anonymous functions to named forms can alter stack traces and callback semantics.'
      },
      {
        rule: 'comments.preferJsdocForFunctions',
        reason: 'Automatically generating JSDoc content is lossy without semantic context.'
      },
      {
        rule: 'controlFlow.guardClauses',
        reason: 'Guard-clause refactors can alter readability and control flow intent.'
      },
      {
        rule: 'comments.commentBlockFraming',
        reason: 'Comment framing style is context-sensitive and should be reviewed before enforcement.'
      },
      {
        rule: 'comments.trailingInlineCommentAlignment',
        reason: 'Aligning trailing inline comments is layout-sensitive and can conflict with line-length constraints.'
      }
    ]
  };

  return profile;
}
