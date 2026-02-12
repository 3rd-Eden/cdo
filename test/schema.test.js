// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile } from '../src/output/profile.js';

test('profile schema validation accepts valid shape', () => {
  /** @type {import('../src/types.js').CdoProfileV1} */
  const profile = {
    schemaVersion: '1.0.0',
    profileId: 'abc',
    createdAt: new Date().toISOString(),
    author: { mode: 'single-author', emails: ['author@example.com'] },
    sampleWindow: {
      maxFilesPerRepo: 10,
      perRepo: [{ root: '/tmp/r', fileCount: 1, sampledFiles: ['/tmp/r/index.js'] }]
    },
    sources: { roots: ['/tmp/r'], filesAnalyzed: 1 },
    rules: {
      comments: {
        lineCommentSpacing: { value: 'space-after-slashes', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: true },
        preferJsdocForFunctions: { value: true, status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false },
        commentBlockFraming: { value: 'framed', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false },
        trailingInlineCommentAlignment: { value: 'aligned', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false }
      },
      naming: {
        functionWordCountPreference: { value: 'single-word', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false },
        functionExpressionNamingPreference: { value: 'named', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false }
      },
      controlFlow: {
        singleLineIfBraces: { value: 'omit', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false },
        guardClauses: { value: 'prefer', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false }
      },
      syntax: {
        quotes: { value: 'single', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false },
        semicolons: { value: 'always', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false },
        trailingCommas: { value: 'never', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false },
        variableDeclarationCommaPlacement: { value: 'leading', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false },
        yodaConditions: { value: 'never', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: true },
        multilineTernaryOperatorPlacement: { value: 'leading', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false },
        lineWidth: { value: 120, status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false }
      },
      whitespace: {
        indentationKind: { value: 'space', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: true },
        indentationSize: { value: 2, status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: true },
        switchCaseIndentation: { value: 'indent', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: true },
        switchCaseBreakIndentation: { value: 'match-case', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: true },
        memberExpressionIndentation: { value: 'aligned', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: true },
        multilineCallArgumentLayout: { value: 'compact', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false },
        blankLineDensity: { value: 'compact', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false },
        blankLineBeforeReturn: { value: 'always', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false },
        blankLineBeforeIf: { value: 'always', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false }
      },
      imports: {
        ordering: { value: 'alphabetical', status: 'enforced', confidence: 1, evidenceCount: 1, provenance: 'deterministic', autoFixSafe: false }
      }
    },
    evidence: { test: 1 },
    confidenceSummary: { overall: 1, byRule: { test: 1 } },
    nonFixablePreferences: [{ rule: 'x', reason: 'y' }]
  };

  assert.doesNotThrow(() => validateProfile(profile));
});
