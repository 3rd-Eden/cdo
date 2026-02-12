// @ts-check

/**
 * @returns {import('../../src/types.js').CdoProfileV1}
 */
export function createProfileFixture() {
  return {
    schemaVersion: '1.0.0',
    profileId: 'fixture-profile',
    createdAt: new Date().toISOString(),
    author: { mode: 'single-author', emails: ['author@example.com'] },
    sampleWindow: {
      maxFilesPerRepo: 50,
      perRepo: [{ root: '/tmp/repo', fileCount: 1, sampledFiles: ['/tmp/repo/index.js'] }]
    },
    sources: { roots: ['/tmp/repo'], filesAnalyzed: 1 },
    rules: {
      comments: {
        lineCommentSpacing: { value: 'space-after-slashes', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: true },
        preferJsdocForFunctions: { value: true, status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false },
        commentBlockFraming: { value: 'framed', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false },
        trailingInlineCommentAlignment: { value: 'aligned', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false }
      },
      naming: {
        functionWordCountPreference: { value: 'single-word', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false },
        functionExpressionNamingPreference: { value: 'named', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false }
      },
      controlFlow: {
        singleLineIfBraces: { value: 'omit', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false },
        guardClauses: { value: 'prefer', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false }
      },
      syntax: {
        quotes: { value: 'single', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false },
        semicolons: { value: 'always', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false },
        trailingCommas: { value: 'never', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false },
        variableDeclarationCommaPlacement: { value: 'leading', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false },
        yodaConditions: { value: 'never', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: true },
        multilineTernaryOperatorPlacement: { value: 'leading', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false },
        lineWidth: { value: 120, status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false }
      },
      whitespace: {
        indentationKind: { value: 'space', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: true },
        indentationSize: { value: 2, status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: true },
        switchCaseIndentation: { value: 'indent', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: true },
        switchCaseBreakIndentation: { value: 'match-case', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: true },
        memberExpressionIndentation: { value: 'aligned', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: true },
        multilineCallArgumentLayout: { value: 'compact', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false },
        blankLineDensity: { value: 'compact', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false },
        blankLineBeforeReturn: { value: 'always', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false },
        blankLineBeforeIf: { value: 'always', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false }
      },
      imports: {
        ordering: { value: 'alphabetical', status: 'enforced', confidence: 1, evidenceCount: 10, provenance: 'deterministic', autoFixSafe: false }
      }
    },
    evidence: { test: 1 },
    confidenceSummary: {
      overall: 0.95,
      byRule: {
        'comments.lineCommentSpacing': 1,
        'comments.preferJsdocForFunctions': 1,
        'comments.commentBlockFraming': 1,
        'comments.trailingInlineCommentAlignment': 1,
        'naming.functionWordCountPreference': 1,
        'naming.functionExpressionNamingPreference': 1,
        'controlFlow.singleLineIfBraces': 1,
        'controlFlow.guardClauses': 1,
        'syntax.quotes': 1,
        'syntax.semicolons': 1,
        'syntax.trailingCommas': 1,
        'syntax.variableDeclarationCommaPlacement': 1,
        'syntax.yodaConditions': 1,
        'syntax.multilineTernaryOperatorPlacement': 1,
        'syntax.lineWidth': 1,
        'whitespace.indentationKind': 1,
        'whitespace.indentationSize': 1,
        'whitespace.switchCaseIndentation': 1,
        'whitespace.switchCaseBreakIndentation': 1,
        'whitespace.memberExpressionIndentation': 1,
        'whitespace.multilineCallArgumentLayout': 1,
        'whitespace.blankLineDensity': 1,
        'whitespace.blankLineBeforeReturn': 1,
        'whitespace.blankLineBeforeIf': 1,
        'imports.ordering': 1
      }
    },
    nonFixablePreferences: []
  };
}
