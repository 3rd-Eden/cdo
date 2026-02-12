# CDO generated Grit pack

This pack captures structural style habits that are weakly enforced or non-autofixable in formatter-only pipelines.

- Generated recipes: 4

## How to use

1. Start with dry-run or preview mode in your Grit environment.
2. Apply one recipe category at a time.
3. Re-run `cdo apply --dry-run` and inspect diffs before write mode.

## Generated recipes

### 1. `single-line-if-omit-braces`

- Title: Omit braces for one-statement if blocks
- Mode: `rewrite`
- Risk: `medium`
- Why: Profile prefers concise single-line if statements without braces.

```grit
`if ($condition) { $statement }` => `if ($condition) $statement`
```

### 2. `prefer-guard-clauses`

- Title: Promote guard clauses
- Mode: `query`
- Risk: `high`
- Why: Profile tends to short-circuit early before main logic.

```grit
`if ($condition) { $...body } else { $...rest }`
```

### 3. `single-word-function-name-candidates`

- Title: Flag likely multi-word function names
- Mode: `query`
- Risk: `medium`
- Why: Profile prefers single-word naming for functions.

```grit
`function $name($...args) { $...body }` where $name <: r"[_-]|[a-z][A-Z]"
```

### 4. `plain-line-comment-blocks`

- Title: Detect framed // comment blocks
- Mode: `query`
- Risk: `low`
- Why: Profile prefers plain comment groups without empty frame lines.

```grit
`//\n// $content\n//`
```
