// @ts-check
import { validateProfile } from './profile.js';

/**
 * @param {import('../types.js').CdoProfileV1} profile
 */
export function generateGuide(profile) {
  validateProfile(profile);

  /**
   * @param {import('../types.js').InferredRule<unknown> | undefined} rule
   * @returns {import('../types.js').InferredRule<unknown>}
   */
  function normalizeRule(rule) {
    if (rule) return rule;
    return {
      value: null,
      status: 'undetermined',
      confidence: 0,
      evidenceCount: 0,
      provenance: 'deterministic',
      autoFixSafe: false
    };
  }

  /** @type {Array<[string, import('../types.js').InferredRule<unknown>]>} */
  const entries = [
    ['comments.lineCommentSpacing', normalizeRule(profile.rules.comments.lineCommentSpacing)],
    ['comments.preferJsdocForFunctions', normalizeRule(profile.rules.comments.preferJsdocForFunctions)],
    ['comments.commentBlockFraming', normalizeRule(profile.rules.comments.commentBlockFraming)],
    ['comments.trailingInlineCommentAlignment', normalizeRule(profile.rules.comments.trailingInlineCommentAlignment)],
    ['naming.functionWordCountPreference', normalizeRule(profile.rules.naming.functionWordCountPreference)],
    ['naming.functionExpressionNamingPreference', normalizeRule(profile.rules.naming.functionExpressionNamingPreference)],
    ['controlFlow.singleLineIfBraces', normalizeRule(profile.rules.controlFlow.singleLineIfBraces)],
    ['controlFlow.guardClauses', normalizeRule(profile.rules.controlFlow.guardClauses)],
    ['syntax.quotes', normalizeRule(profile.rules.syntax.quotes)],
    ['syntax.semicolons', normalizeRule(profile.rules.syntax.semicolons)],
    ['syntax.yodaConditions', normalizeRule(profile.rules.syntax.yodaConditions)],
    ['syntax.trailingCommas', normalizeRule(profile.rules.syntax.trailingCommas)],
    ['syntax.variableDeclarationCommaPlacement', normalizeRule(profile.rules.syntax.variableDeclarationCommaPlacement)],
    ['syntax.multilineTernaryOperatorPlacement', normalizeRule(profile.rules.syntax.multilineTernaryOperatorPlacement)],
    ['syntax.lineWidth', normalizeRule(profile.rules.syntax.lineWidth)],
    ['whitespace.indentationKind', normalizeRule(profile.rules.whitespace.indentationKind)],
    ['whitespace.indentationSize', normalizeRule(profile.rules.whitespace.indentationSize)],
    ['whitespace.switchCaseIndentation', normalizeRule(profile.rules.whitespace.switchCaseIndentation)],
    ['whitespace.switchCaseBreakIndentation', normalizeRule(profile.rules.whitespace.switchCaseBreakIndentation)],
    ['whitespace.memberExpressionIndentation', normalizeRule(profile.rules.whitespace.memberExpressionIndentation)],
    ['whitespace.multilineCallArgumentLayout', normalizeRule(profile.rules.whitespace.multilineCallArgumentLayout)],
    ['whitespace.blankLineBeforeReturn', normalizeRule(profile.rules.whitespace.blankLineBeforeReturn)],
    ['whitespace.blankLineBeforeIf', normalizeRule(profile.rules.whitespace.blankLineBeforeIf)],
    ['whitespace.blankLineDensity', normalizeRule(profile.rules.whitespace.blankLineDensity)],
    ['imports.ordering', normalizeRule(profile.rules.imports.ordering)]
  ];

  const hardRules = entries.filter(([, rule]) => rule.status === 'enforced');
  const uncertain = entries.filter(([, rule]) => rule.status !== 'enforced');

  const lines = [
    '# CDO Style Guide',
    '',
    `Generated: ${profile.createdAt}`,
    `Profile ID: ${profile.profileId}`,
    `Schema: ${profile.schemaVersion}`,
    `Overall confidence: ${profile.confidenceSummary.overall.toFixed(2)}`,
    '',
    '## Hard Rules',
    ''
  ];

  for (const [name, rule] of hardRules) {
    lines.push(`- \`${name}\`: \`${String(rule.value)}\` (confidence ${(rule.confidence * 100).toFixed(1)}%, evidence ${rule.evidenceCount})`);
  }

  if (!hardRules.length) {
    lines.push('- No high-confidence enforced rules yet.');
  }

  lines.push('', '## Undetermined / Soft Preferences', '');

  for (const [name, rule] of uncertain) {
    lines.push(`- \`${name}\`: undetermined (confidence ${(rule.confidence * 100).toFixed(1)}%, evidence ${rule.evidenceCount})`);
  }

  if (!uncertain.length) {
    lines.push('- None.');
  }

  lines.push('', '## Non-fixable Preferences', '');
  for (const pref of profile.nonFixablePreferences) {
    lines.push(`- \`${pref.rule}\`: ${pref.reason}`);
  }

  lines.push('', '## Source Repositories', '');
  for (const root of profile.sources.roots) {
    lines.push(`- ${root}`);
  }

  return `${lines.join('\n')}\n`;
}
