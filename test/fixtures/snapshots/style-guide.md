# CDO Style Guide

Generated: <created-at>
Profile ID: <profile-id>
Schema: 1.0.0
Overall confidence: 0.50

## Hard Rules

- `comments.commentBlockFraming`: `plain` (confidence 100.0%, evidence 2)
- `naming.functionWordCountPreference`: `single-word` (confidence 66.7%, evidence 2)
- `controlFlow.singleLineIfBraces`: `omit` (confidence 100.0%, evidence 2)
- `controlFlow.guardClauses`: `prefer` (confidence 100.0%, evidence 3)
- `syntax.quotes`: `single` (confidence 66.7%, evidence 4)
- `syntax.semicolons`: `always` (confidence 75.0%, evidence 6)
- `syntax.lineWidth`: `80` (confidence 65.0%, evidence 24)
- `whitespace.indentationKind`: `space` (confidence 64.3%, evidence 9)
- `whitespace.indentationSize`: `2` (confidence 64.3%, evidence 9)
- `whitespace.blankLineBeforeReturn`: `never` (confidence 100.0%, evidence 3)
- `whitespace.blankLineBeforeIf`: `never` (confidence 100.0%, evidence 3)
- `whitespace.blankLineDensity`: `compact` (confidence 97.7%, evidence 28)

## Undetermined / Soft Preferences

- `comments.lineCommentSpacing`: undetermined (confidence 50.0%, evidence 1)
- `comments.preferJsdocForFunctions`: undetermined (confidence 0.0%, evidence 0)
- `comments.trailingInlineCommentAlignment`: undetermined (confidence 0.0%, evidence 0)
- `naming.functionExpressionNamingPreference`: undetermined (confidence 0.0%, evidence 0)
- `syntax.yodaConditions`: undetermined (confidence 100.0%, evidence 1)
- `syntax.trailingCommas`: undetermined (confidence 0.0%, evidence 0)
- `syntax.variableDeclarationCommaPlacement`: undetermined (confidence 0.0%, evidence 0)
- `syntax.multilineTernaryOperatorPlacement`: undetermined (confidence 0.0%, evidence 0)
- `whitespace.switchCaseIndentation`: undetermined (confidence 0.0%, evidence 0)
- `whitespace.switchCaseBreakIndentation`: undetermined (confidence 0.0%, evidence 0)
- `whitespace.memberExpressionIndentation`: undetermined (confidence 0.0%, evidence 0)
- `whitespace.multilineCallArgumentLayout`: undetermined (confidence 0.0%, evidence 0)
- `imports.ordering`: undetermined (confidence 100.0%, evidence 1)

## Non-fixable Preferences

- `naming.functionWordCountPreference`: Renaming functions can break public APIs and call sites.
- `naming.functionExpressionNamingPreference`: Converting anonymous functions to named forms can alter stack traces and callback semantics.
- `comments.preferJsdocForFunctions`: Automatically generating JSDoc content is lossy without semantic context.
- `controlFlow.guardClauses`: Guard-clause refactors can alter readability and control flow intent.
- `comments.commentBlockFraming`: Comment framing style is context-sensitive and should be reviewed before enforcement.
- `comments.trailingInlineCommentAlignment`: Aligning trailing inline comments is layout-sensitive and can conflict with line-length constraints.

## Source Repositories

- <repo>
