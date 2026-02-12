// @ts-check

/**
 * @typedef {Object} FileSignals
 * @property {number} lineCommentSpace
 * @property {number} lineCommentTight
 * @property {number} functionsTotal
 * @property {number} functionsWithJsdoc
 * @property {number} functionNamesSingle
 * @property {number} functionNamesMulti
 * @property {number} functionExprNamed
 * @property {number} functionExprAnonymous
 * @property {number} ifWithBraces
 * @property {number} ifWithoutBraces
 * @property {number} quotesSingle
 * @property {number} quotesDouble
 * @property {number} semicolonsYes
 * @property {number} semicolonsNo
 * @property {number} trailingCommaYes
 * @property {number} trailingCommaNo
 * @property {number} variableDeclarationCommaLeading
 * @property {number} variableDeclarationCommaTrailing
 * @property {number} indentSpaceLines
 * @property {number} indentTabLines
 * @property {Record<string, number>} indentSpaceSizes
 * @property {number} switchCaseIndented
 * @property {number} switchCaseFlat
 * @property {number} switchCaseBreakMatchCase
 * @property {number} switchCaseBreakIndented
 * @property {number} memberExprAligned
 * @property {number} memberExprIndented
 * @property {number} memberExprAlignedFiles
 * @property {number} memberExprIndentedFiles
 * @property {number} yodaConditionsYes
 * @property {number} yodaConditionsNo
 * @property {number} ternaryMultilineLeading
 * @property {number} ternaryMultilineTrailing
 * @property {number} guardClauseFunctions
 * @property {number} nonGuardClauseFunctions
 * @property {number} blankLineBeforeReturnYes
 * @property {number} blankLineBeforeReturnNo
 * @property {number} blankLineBeforeIfYes
 * @property {number} blankLineBeforeIfNo
 * @property {number} commentFramedBlocks
 * @property {number} commentPlainBlocks
 * @property {number} trailingInlineCommentAlignedPairs
 * @property {number} trailingInlineCommentUnalignedPairs
 * @property {number} multilineCallArgumentCompact
 * @property {number} multilineCallArgumentExpanded
 * @property {number} lineLengthMax
 * @property {number} blankLines
 * @property {number} totalLines
 * @property {number} importSortedGroups
 * @property {number} importUnsortedGroups
 */

/**
 * @returns {FileSignals}
 */
export function createSignals() {
  return {
    lineCommentSpace: 0,
    lineCommentTight: 0,
    functionsTotal: 0,
    functionsWithJsdoc: 0,
    functionNamesSingle: 0,
    functionNamesMulti: 0,
    functionExprNamed: 0,
    functionExprAnonymous: 0,
    ifWithBraces: 0,
    ifWithoutBraces: 0,
    quotesSingle: 0,
    quotesDouble: 0,
    semicolonsYes: 0,
    semicolonsNo: 0,
    trailingCommaYes: 0,
    trailingCommaNo: 0,
    variableDeclarationCommaLeading: 0,
    variableDeclarationCommaTrailing: 0,
    indentSpaceLines: 0,
    indentTabLines: 0,
    indentSpaceSizes: {},
    switchCaseIndented: 0,
    switchCaseFlat: 0,
    switchCaseBreakMatchCase: 0,
    switchCaseBreakIndented: 0,
    memberExprAligned: 0,
    memberExprIndented: 0,
    memberExprAlignedFiles: 0,
    memberExprIndentedFiles: 0,
    yodaConditionsYes: 0,
    yodaConditionsNo: 0,
    ternaryMultilineLeading: 0,
    ternaryMultilineTrailing: 0,
    guardClauseFunctions: 0,
    nonGuardClauseFunctions: 0,
    blankLineBeforeReturnYes: 0,
    blankLineBeforeReturnNo: 0,
    blankLineBeforeIfYes: 0,
    blankLineBeforeIfNo: 0,
    commentFramedBlocks: 0,
    commentPlainBlocks: 0,
    trailingInlineCommentAlignedPairs: 0,
    trailingInlineCommentUnalignedPairs: 0,
    multilineCallArgumentCompact: 0,
    multilineCallArgumentExpanded: 0,
    lineLengthMax: 0,
    blankLines: 0,
    totalLines: 0,
    importSortedGroups: 0,
    importUnsortedGroups: 0
  };
}

/** @type {Array<Exclude<keyof FileSignals, 'indentSpaceSizes'>>} */
const NUMERIC_SIGNAL_KEYS = [
  'lineCommentSpace',
  'lineCommentTight',
  'functionsTotal',
  'functionsWithJsdoc',
  'functionNamesSingle',
  'functionNamesMulti',
  'functionExprNamed',
  'functionExprAnonymous',
  'ifWithBraces',
  'ifWithoutBraces',
  'quotesSingle',
  'quotesDouble',
  'semicolonsYes',
  'semicolonsNo',
  'trailingCommaYes',
  'trailingCommaNo',
  'variableDeclarationCommaLeading',
  'variableDeclarationCommaTrailing',
  'indentSpaceLines',
  'indentTabLines',
  'switchCaseIndented',
  'switchCaseFlat',
  'switchCaseBreakMatchCase',
  'switchCaseBreakIndented',
  'memberExprAligned',
  'memberExprIndented',
  'memberExprAlignedFiles',
  'memberExprIndentedFiles',
  'yodaConditionsYes',
  'yodaConditionsNo',
  'ternaryMultilineLeading',
  'ternaryMultilineTrailing',
  'guardClauseFunctions',
  'nonGuardClauseFunctions',
  'blankLineBeforeReturnYes',
  'blankLineBeforeReturnNo',
  'blankLineBeforeIfYes',
  'blankLineBeforeIfNo',
  'commentFramedBlocks',
  'commentPlainBlocks',
  'trailingInlineCommentAlignedPairs',
  'trailingInlineCommentUnalignedPairs',
  'multilineCallArgumentCompact',
  'multilineCallArgumentExpanded',
  'blankLines',
  'totalLines',
  'importSortedGroups',
  'importUnsortedGroups'
];

/**
 * @param {FileSignals} target
 * @param {FileSignals} source
 */
export function addSignalCounts(target, source) {
  for (const key of NUMERIC_SIGNAL_KEYS) {
    target[key] += source[key];
  }

  target.lineLengthMax = Math.max(target.lineLengthMax, source.lineLengthMax);

  for (const [key, value] of Object.entries(source.indentSpaceSizes)) {
    target.indentSpaceSizes[key] = (target.indentSpaceSizes[key] ?? 0) + value;
  }
}

/**
 * @param {FileSignals} signals
 */
export function finalizeMemberExpressionVotes(signals) {
  const comparable = signals.memberExprAligned + signals.memberExprIndented;
  if (comparable < 2) return;

  if (signals.memberExprAligned > signals.memberExprIndented) {
    signals.memberExprAlignedFiles += 1;
  } else if (signals.memberExprIndented > signals.memberExprAligned) {
    signals.memberExprIndentedFiles += 1;
  }
}
