# cdo

CDO learns coding style from one or more JavaScript/TypeScript repositories and turns that into reusable artifacts for:

- humans (`STYLEGUIDE.cdo.md`)
- tooling (`biome.json` + Grit assets)
- coding agents via root `AGENTS.md` ([agents.md](https://agents.md/))

The goal is simple: infer how an author actually writes code, then reuse that style safely in other repos.

CDO is pure ESM JavaScript (`"type": "module"`) with JSDoc + `// @ts-check` and no runtime TypeScript compilation requirement.

## Table of Contents

- [What CDO Produces](#what-cdo-produces)
- [Style Signals CDO Detects](#style-signals-cdo-detects)
- [How Inference Works](#how-inference-works)
- [How Enforcement Works (Biome + Grit)](#how-enforcement-works-biome--grit)
- [Requirements](#requirements)
- [Install](#install)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [Node API Reference](#node-api-reference)
- [MCP Server Reference](#mcp-server-reference)
- [MCP Setup (Codex, Cursor, Claude)](#mcp-setup-codex-cursor-claude)
- [LLM Augmentation Contract](#llm-augmentation-contract)
- [Fixture Validation Loop (Your 3 Repos)](#fixture-validation-loop-your-3-repos)
- [Testing and Coverage](#testing-and-coverage)
- [Repository Layout](#repository-layout)
- [mcp-layer Integration](#mcp-layer-integration)
- [Troubleshooting and Debugging](#troubleshooting-and-debugging)
- [Publish Readiness](#publish-readiness)
- [Limitations](#limitations)
- [License](#license)

## What CDO Produces

A standard run produces:

1. `cdo-profile.json`
- schema-versioned machine profile (`schemaVersion: "1.0.0"`)
- inferred rules, confidence, evidence, provenance

2. `STYLEGUIDE.cdo.md`
- human-readable guide derived from `cdo-profile.json`

3. `.cdo/` generated tooling artifacts
- `biome.json`
- `biome/plugins/*.grit` (only when profile has unsupported enforced preferences)
- `grit/cdo.grit`
- `grit/README.md`
- `grit/recipes.json`
- `oxfmt.json` (optional compatibility artifact)
- `AGENTS.md` (root-level, [agents.md](https://agents.md/) format)

4. apply/report artifacts
- `cdo-apply-report.json`
- `cdo-iteration-report.json`

## Style Signals CDO Detects

CDO v1 infers these rule families:

1. Comments
- line comment spacing: `//comment` vs `// comment`
- function JSDoc tendency
- comment block framing: framed (`//` blank top/bottom) vs plain
- trailing inline comment alignment (`//` column behavior on assignments/object members/array entries/function lines)

2. Naming
- function name word count tendency: single-word vs multi-word
- function expression naming tendency: named vs anonymous

3. Control flow
- one-statement `if` style: braces omitted vs required
- guard-clause tendency at function start

4. Syntax
- quote style: single vs double
- semicolon usage: always vs never
- trailing comma usage: multiline vs never
- variable declaration comma placement: leading vs trailing
- yoda conditions: `if (3 === value)` vs `if (value === 3)`
- multiline ternary operator placement: leading (`?`/`:` at line start) vs trailing
- preferred JS line width (for formatter wrapping behavior)

5. Whitespace/layout
- indentation kind: spaces vs tabs
- indentation size (space-based projects)
- `switch/case` indentation tendency
- `switch` `break` indentation tendency: match-case vs indented
- member-expression continuation indentation tendency
- multiline call-argument layout tendency: compact first-line vs expanded
- blank-line density: compact vs spacious
- blank-line-before-`return` tendency
- blank-line-before-`if` tendency

6. Imports
- ordering tendency for ESM imports and CJS requires: alphabetical vs none

Important extraction notes:

- directive/separator comments are excluded from comment-spacing inference (`//# sourceMappingURL`, `// eslint-disable...`, divider lines)
- trailing inline comment alignment detection is gap-tolerant within the same block to preserve aligned comment columns
- one-line `if` brace rule only considers true one-statement single-line `if` forms
- `switch` `break` indentation only counts direct `break;` statements in `case` blocks
- member-expression indentation uses dot-leading continuation lines and file-level majority voting
- multiline call layout only evaluates call expressions that span multiple lines
- import ordering is weighted by group size to avoid tiny groups dominating results

## How Inference Works

Inference pipeline:

1. discover tracked JS/TS files from each repo
2. optionally filter by author email(s)
3. recency-sort and sample files per repo (`maxFilesPerRepo`)
4. parse AST and extract raw signals
5. aggregate signals across all sampled repos
6. infer winner per rule with threshold gating

A rule is enforced only when both thresholds pass:

- `evidenceCount >= minEvidence`
- `confidence >= minConfidence`

Otherwise it is marked `undetermined`.

Default thresholds:

- `minEvidence = 30`
- `minConfidence = 0.75`

## How Enforcement Works (Biome + Grit)

CDO is Biome-only for apply. There is no ESLint/native apply engine.

Enforcement model:

1. Biome formatter/linter/assist (`biome.json`)
- strongest coverage for formatting-level rules
- applied by `cdo apply` through `biome check --write`

2. Biome Grit plugins (`.cdo/biome/plugins/*.grit`)
- query diagnostics for profile preferences not fully expressed in base Biome rules
- generated only when needed

3. Grit pack (`.cdo/grit/*`)
- structural/query recipes for manual review or extra automation outside Biome apply flow

`cdo apply` defaults to dry-run. Use `--write` to mutate files.

`--safe-only` suppresses rules not marked `autoFixSafe` before generating Biome config.
In safe-only mode, CDO also disables Biome formatter rewrites to keep diffs low-noise.

## Requirements

- Node.js `>=20`
- `git` available on `PATH`
- local git repositories as input

Supported source extensions:

- `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`

Default ignored directories (any depth):

- `node_modules`, `dist`, `coverage`, `vendor`

## Install

From npm:

```bash
npm install cdo
```

Local development:

```bash
npm install
```

## Quick Start

### 1. Learn profile from multiple repos

```bash
cdo learn \
  --repos ./repo-a,./repo-b,./repo-c \
  --author me@example.com \
  --out cdo-profile.json
```

### 2. Generate readable guide

```bash
cdo guide --profile cdo-profile.json --out STYLEGUIDE.cdo.md
```

### 3. Generate tooling configs

```bash
cdo config --profile cdo-profile.json --out-dir .cdo
```

### 4. Run apply in dry-run first

```bash
cdo apply \
  --profile cdo-profile.json \
  --repos ./target-repo \
  --engine biome \
  --safe-only \
  --report cdo-apply-report.json
```

### 5. Generate iteration report

```bash
cdo report \
  --profile cdo-profile.json \
  --apply-report cdo-apply-report.json \
  --out cdo-iteration-report.json
```

When diff noise is acceptable, enable write mode:

```bash
cdo apply \
  --profile cdo-profile.json \
  --repos ./target-repo \
  --engine biome \
  --write \
  --report cdo-apply-write-report.json
```

## CLI Reference

### `cdo learn`

```bash
cdo learn --repos <a,b,...> [--author <email>] [--out cdo-profile.json]
```

Flags:

- `--repos` (required): comma-separated repo paths
- `--author`: repeatable or comma-separated author emails
- `--out`: output file (default `cdo-profile.json`)
- `--max-files`: max sampled files per repo (default `400`)
- `--min-evidence`: evidence threshold (default `30`)
- `--min-confidence`: confidence threshold `[0,1]` (default `0.75`)
- `--inference`: `deterministic|llm-mcp` (default `deterministic`)
- `--llm-augmenter-cmd`: external augmenter command (only used in `llm-mcp`)
- `--llm-sample`: `compact|full` payload mode (default `compact`)
- `CDO_LLM_AUGMENTER_CMD`: env alternative to `--llm-augmenter-cmd`

### `cdo guide`

```bash
cdo guide --profile <path> [--out STYLEGUIDE.cdo.md]
```

### `cdo config`

```bash
cdo config --profile <path> [--out-dir .cdo] [--no-oxc]
```

### `cdo apply`

```bash
cdo apply --profile <path> --repos <a,b,...> [--engine biome] [--safe-only] [--write] [--report report.json]
```

Notes:

- engine is Biome-only (`biome`)
- dry-run is default (omit `--write`)
- `--safe-only` excludes non-safe rules

### `cdo report`

```bash
cdo report --profile <path> --apply-report <path> [--previous-profile <path>] [--out iteration-report.json]
```

### `cdo mcp`

```bash
cdo mcp
```

Self-test tool listing:

```bash
cdo mcp --self-test
```

### Global

```bash
cdo --help
cdo --version
```

## Node API Reference

```js
import {
  learnStyle,
  generateGuide,
  generateConfigs,
  applyStyle,
  generateIterationReport,
  startMcpServer
} from 'cdo';
```

### `learnStyle(input)`

Input:

- `repoPaths: string[]` (required)
- `authorEmails?: string[]`
- `maxFilesPerRepo?: number`
- `minEvidence?: number`
- `minConfidence?: number`
- `inferenceMode?: 'deterministic' | 'llm-mcp'`
- `llmAugmenterCommand?: string`
- `llmSamplingMode?: 'compact' | 'full'`
- `llmAugmenter?: (input) => { rules: Record<string, { value, confidence?, evidenceCount? }> }`

Returns: `Promise<CdoProfileV1>`

### `generateGuide(profile)`

Returns markdown string.

### `generateConfigs(profile, options?)`

Options:

- `outDir?: string`
- `includeOxc?: boolean`

Returns output paths for Biome/Grit/agent artifacts.

### `applyStyle(input)`

Input:

- `profile: CdoProfileV1 | string`
- `repoPaths: string[]`
- `engine?: 'biome'`
- `write?: boolean`
- `safeOnly?: boolean`
- `reportPath?: string`

Returns: `Promise<ApplyReport>`

### `generateIterationReport(profile, applyReport, previousProfile?)`

Returns confidence deltas, changed categories, and repo-level diff stats.

### `startMcpServer(options?)`

Starts stdio MCP server.

## MCP Server Reference

Tools exposed:

- `cdo.learn_style`
- `cdo.generate_style_guide`
- `cdo.generate_agent_templates`
- `cdo.generate_iteration_report`
- `cdo.apply_style`

### Sampling controls in MCP

`cdo.learn_style` supports:

- `maxFilesPerRepo`
- `sampleSize` (alias of `maxFilesPerRepo`)
- `authorEmails`
- `inferenceMode: deterministic|llm-mcp`
- `llmSamplingMode: compact|full`
- `sampleContent` (alias of `llmSamplingMode`)
- `llmAugmenterCommand`

Sampling behavior:

1. tracked JS/TS files are discovered
2. author filter (if provided)
3. files are recency-sorted by commit date
4. top `maxFilesPerRepo` selected per repo

Example tool payload:

```json
{
  "repoPaths": ["/path/repo-a", "/path/repo-b"],
  "authorEmails": ["you@example.com"],
  "sampleSize": 200,
  "inferenceMode": "llm-mcp",
  "llmSamplingMode": "full",
  "llmAugmenterCommand": "node /abs/path/augmenter.mjs",
  "minEvidence": 20,
  "minConfidence": 0.7
}
```

## MCP Setup (Codex, Cursor, Claude)

### Verify server locally first

```bash
cdo mcp --self-test
```

You should see all `cdo.*` tools listed.

### Codex config (`~/.codex/config.toml` or `$CODEX_HOME/config.toml`)

```toml
[mcp_servers.cdo]
command = "cdo"
args = ["mcp"]
```

Local repo checkout alternative:

```toml
[mcp_servers.cdo]
command = "node"
args = ["/absolute/path/to/cdo/src/cli.js", "mcp"]
```

### Cursor config (`.cursor/mcp.json` or global Cursor MCP config)

```json
{
  "mcpServers": {
    "cdo": {
      "command": "cdo",
      "args": ["mcp"]
    }
  }
}
```

### Claude Code config (`.mcp.json` or `~/.mcp.json`)

```json
{
  "mcpServers": {
    "cdo": {
      "command": "cdo",
      "args": ["mcp"]
    }
  }
}
```

Host-side validation flow:

1. list tools
2. call `cdo.generate_style_guide` first
3. call `cdo.apply_style` with `write: false` before any write mode

## LLM Augmentation Contract

`llm-mcp` mode allows an external command/function to suggest rule values for low-confidence areas.

Command contract:

- stdin: JSON `{ profile, sampledFiles }`
- stdout: JSON response with `rules`
- non-zero exit code: treated as error

Response format:

```json
{
  "rules": {
    "syntax.yodaConditions": {
      "value": "always",
      "confidence": 0.87,
      "evidenceCount": 18
    },
    "comments.commentBlockFraming": {
      "value": "framed",
      "confidence": 0.82,
      "evidenceCount": 12
    }
  }
}
```

Behavior rules:

- only known rule paths are accepted
- invalid values are ignored
- deterministic strong enforced rules are not replaced unless LLM suggestion is materially stronger
- applied LLM rules are marked with `provenance: "llm_augmented"`
- compact sampling defaults to up to `12` files with `5000` chars per file

## Fixture Validation Loop (Your 3 Repos)

Built-in fixture loop targets:

- `https://github.com/unshiftio/liferaft.git`
- `https://github.com/unshiftio/url-parse.git`
- `https://github.com/unshiftio/recovery.git`

### Setup fixture repos

```bash
npm run fixtures:setup
```

Clones/updates into `.fixtures/style-fixtures/` (gitignored).

### Run validation

```bash
npm run validate:fixtures
```

This runs:

1. `learn`
2. `guide`
3. `config`
4. `apply --engine biome --safe-only` (dry-run)
5. `report`

### Strict validation

```bash
npm run validate:fixtures:strict
```

Current strict thresholds:

- `max-changed-files = 6`
- `max-changed-lines = 80`

### Fixture options

`fixtures:setup` supports:

- `--root <path>` or `CDO_FIXTURE_ROOT`
- `--repos <url1,url2,...>` or `CDO_FIXTURE_REPOS`

`validate-fixtures.js` supports:

- `--root <path>` or `CDO_FIXTURE_ROOT`
- `--repos <name1,name2,...>` or `CDO_FIXTURE_REPO_NAMES`
- `--author <email>`
- `--engine <biome>`
- `--safe-only` or `CDO_FIXTURE_SAFE_ONLY`
- `--min-confidence <0-1>` or `CDO_MIN_CONFIDENCE`
- `--min-evidence <n>` or `CDO_MIN_EVIDENCE`
- `--max-changed-files <n>` or `CDO_MAX_CHANGED_FILES`
- `--max-changed-lines <n>` or `CDO_MAX_CHANGED_LINES`
- `--summary-out <path>` or `CDO_FIXTURE_SUMMARY_OUT`

## Testing and Coverage

`npm test` is the full confidence gate.

```bash
npm test
```

It runs:

1. coverage-gated test suite (`npm run coverage`)
2. type checking (`npm run typecheck`)
3. strict fixture validation against the 3 fixture repos (`npm run validate:fixtures:strict`)

Coverage thresholds:

- statements: `>= 90%`
- lines: `>= 90%`
- branches: `>= 70%`

Why there are multiple test scripts:

- `test:run`: executes all `test/*.test.js` (unit + integration + snapshot)
- `coverage`: wraps `test:run` in `c8` with thresholds
- `typecheck`: runs static type checks on the JSDoc-typed codebase
- `test`: single full gate (`coverage + typecheck + strict fixture loop`)
- `snapshots:test`: only snapshot suite
- `snapshots:update`: regenerate golden snapshots after intentional behavior changes

## Repository Layout

Key directories:

- `src/` runtime implementation
- `test/` all tests
- `test/fixtures/` fixture inputs + golden snapshots
- `test/support/` test helpers
- `scripts/` developer scripts (fixtures, release smoke, snapshot updater)
- `.fixtures/` external cloned repos for validation (gitignored)

There is one canonical test tree (`test/`). Snapshot fixtures are intentionally inside `test/fixtures/` so they are versioned with tests.

## mcp-layer Integration

CDO and `mcp-layer` are complementary:

- CDO provides domain logic (learn/apply/report)
- `mcp-layer` provides generic MCP interface surfaces (CLI/REST/GraphQL/OpenAPI)

Example config in this repo:

- `examples/mcp-layer/cdo-mcp.json`

List CDO tools through `mcp-layer`:

```bash
npx -y @mcp-layer/cli@1.2.0 tools list --config ./examples/mcp-layer/cdo-mcp.json --server cdo --format json --no-spinner
```

Call a tool through `mcp-layer`:

```bash
npx -y @mcp-layer/cli@1.2.0 tools cdo.learn_style \
  --config ./examples/mcp-layer/cdo-mcp.json \
  --server cdo \
  --json '{"repoPaths":["/path/to/repo"],"authorEmails":["you@example.com"]}' \
  --raw
```

## Troubleshooting and Debugging

### Discovery/sampling problems

Symptom: `Repository path is not a git repository`

Check:

```bash
git -C /path/to/repo rev-parse --is-inside-work-tree
```

Fix:

- pass valid local git repos to `--repos`

Symptom: `No parsable source files were found after sampling`

Likely causes:

- author filter does not match commit history
- unsupported or excluded file layout
- repos are empty or have no tracked JS/TS files

Actions:

1. retry without `--author`
2. inspect commit emails (`git log --format='%ae' | sort | uniq`)
3. raise `--max-files`

### Profile validation problems

Symptom: `Profile schema validation failed`

Actions:

1. regenerate profile with `cdo learn`
2. verify `schemaVersion` is `1.0.0`
3. avoid manual edits to required fields

### Biome apply issues

Symptom: `Unknown apply engine`

Fix:

- use `--engine biome`

Symptom: `Biome check failed: ... loading of plugins`

Likely cause:

- invalid generated plugin file or stale generated artifacts

Actions:

1. regenerate config artifacts: `cdo config --profile cdo-profile.json --out-dir .cdo`
2. inspect generated plugin files under `.cdo/biome/plugins/`
3. run biome directly for details:

```bash
node $(node -e "console.log(require.resolve('@biomejs/biome/bin/biome'))") check --config-path ./.cdo/biome.json /path/to/file.js
```

Symptom: `filesChanged` is always `0`

Interpretation:

- target already matches enforced rules, or
- too many rules are `undetermined`

Actions:

1. inspect `cdo-profile.json` enforced rules
2. lower thresholds for exploration
3. add more representative source repos

### Diff quality issues

Symptom: dry-run diffs are too noisy

Actions:

1. tighten author filter
2. increase `--min-evidence` / `--min-confidence`
3. keep `--safe-only` enabled
4. inspect `cdo-iteration-report.json` top changed categories

### Fixture loop failures

Symptom: missing fixture repo error

Fix:

```bash
npm run fixtures:setup
npm run validate:fixtures
```

### MCP issues

Checks:

```bash
cdo mcp --self-test
node ./src/cli.js mcp --self-test
```

If tools are missing in host app:

1. confirm host points to correct `cdo` binary/path
2. restart/reload MCP host
3. verify no older global install shadows current package

## Publish Readiness

Quality gates:

```bash
npm run publish:ready
```

Runs:

1. `npm test`
2. `npm run release:check`
3. `npm run release:smoke`

Manual publish checklist:

1. `npm whoami`
2. `npm run publish:ready`
3. `npm publish`

## Limitations

Current v1 boundaries:

- input sources are local repo paths
- extraction targets JS/TS codebases
- structural rewrites remain conservative
- auto-renaming APIs is intentionally out of scope

## License

MIT
