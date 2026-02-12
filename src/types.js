// @ts-check

/**
 * @typedef {'deterministic' | 'llm-mcp'} InferenceMode
 */

/**
 * @typedef {'compact' | 'full'} LlmSamplingMode
 */

/**
 * @typedef {Object} LearnInput
 * @property {string[]} repoPaths
 * @property {string[]=} authorEmails
 * @property {number=} maxFilesPerRepo
 * @property {InferenceMode=} inferenceMode
 * @property {number=} minEvidence
 * @property {number=} minConfidence
 * @property {string=} llmAugmenterCommand
 * @property {LlmSamplingMode=} llmSamplingMode
 * @property {(input: { profile: CdoProfileV1, sampledFiles: Array<{ path: string, source: string }> }) => any=} llmAugmenter
 */

/**
 * @typedef {'enforced' | 'undetermined'} RuleStatus
 */

/**
 * @template T
 * @typedef {Object} InferredRule
 * @property {T|null} value
 * @property {RuleStatus} status
 * @property {number} confidence
 * @property {number} evidenceCount
 * @property {'deterministic' | 'llm_augmented'} provenance
 * @property {boolean} autoFixSafe
 */

/**
 * @typedef {Object} CdoProfileV1
 * @property {string} schemaVersion
 * @property {string} profileId
 * @property {string} createdAt
 * @property {{ mode: 'single-author' | 'all-authors', emails: string[] }} author
 * @property {{ maxFilesPerRepo: number, perRepo: Array<{ root: string, fileCount: number, sampledFiles: string[] }> }} sampleWindow
 * @property {{ roots: string[], filesAnalyzed: number }} sources
 * @property {{
 *   comments: {
 *     lineCommentSpacing: InferredRule<'space-after-slashes' | 'tight'>,
 *     preferJsdocForFunctions: InferredRule<boolean>,
 *     commentBlockFraming: InferredRule<'framed' | 'plain'>,
 *     trailingInlineCommentAlignment: InferredRule<'aligned' | 'single-space'>
 *   },
 *   naming: {
 *     functionWordCountPreference: InferredRule<'single-word' | 'multi-word'>,
 *     functionExpressionNamingPreference: InferredRule<'named' | 'allow-anonymous'>
 *   },
 *   controlFlow: {
 *     singleLineIfBraces: InferredRule<'omit' | 'require'>,
 *     guardClauses: InferredRule<'prefer' | 'neutral'>
 *   },
 *   syntax: {
 *     quotes: InferredRule<'single' | 'double'>,
 *     semicolons: InferredRule<'always' | 'never'>,
 *     trailingCommas: InferredRule<'always-multiline' | 'never'>,
 *     variableDeclarationCommaPlacement: InferredRule<'leading' | 'trailing'>,
 *     yodaConditions: InferredRule<'always' | 'never'>,
 *     multilineTernaryOperatorPlacement: InferredRule<'leading' | 'trailing'>,
 *     lineWidth: InferredRule<number>
 *   },
 *   whitespace: {
 *     indentationKind: InferredRule<'space' | 'tab'>,
 *     indentationSize: InferredRule<number>,
 *     switchCaseIndentation: InferredRule<'indent' | 'flat'>,
 *     switchCaseBreakIndentation: InferredRule<'match-case' | 'indent'>,
 *     memberExpressionIndentation: InferredRule<'aligned' | 'indented'>,
 *     multilineCallArgumentLayout: InferredRule<'compact' | 'expanded'>,
 *     blankLineDensity: InferredRule<'compact' | 'spacious'>,
 *     blankLineBeforeReturn: InferredRule<'always' | 'never'>,
 *     blankLineBeforeIf: InferredRule<'always' | 'never'>
 *   },
 *   imports: {
 *     ordering: InferredRule<'alphabetical' | 'none'>
 *   }
 * }} rules
 * @property {Record<string, number>} evidence
 * @property {{ overall: number, byRule: Record<string, number> }} confidenceSummary
 * @property {Array<{ rule: string, reason: string }>} nonFixablePreferences
 */

/**
 * @typedef {Object} ApplyInput
 * @property {CdoProfileV1 | string} profile
 * @property {string[]} repoPaths
 * @property {'biome'=} engine
 * @property {boolean=} write
 * @property {boolean=} safeOnly
 * @property {string=} reportPath
 */

/**
 * @typedef {Object} ApplyFileResult
 * @property {string} file
 * @property {boolean} changed
 * @property {number} additions
 * @property {number} deletions
 */

/**
 * @typedef {Object} ApplyReport
 * @property {'biome'} engine
 * @property {boolean} write
 * @property {number} filesScanned
 * @property {number} filesChanged
 * @property {string[]} diffs
 * @property {ApplyFileResult[]} files
 */

export {};
