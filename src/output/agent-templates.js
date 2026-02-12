// @ts-check
import path from 'node:path';
import { writeText } from '../util/fs.js';

/**
 * @param {import('../types.js').CdoProfileV1} profile
 */
function ruleSummary(profile) {
  return [
    `- Quotes: ${profile.rules.syntax.quotes.value ?? 'undetermined'}`,
    `- Semicolons: ${profile.rules.syntax.semicolons.value ?? 'undetermined'}`,
    `- Var declaration comma placement: ${profile.rules.syntax.variableDeclarationCommaPlacement?.value ?? 'undetermined'}`,
    `- Multiline ternary operators: ${profile.rules.syntax.multilineTernaryOperatorPlacement?.value ?? 'undetermined'}`,
    `- JS line width: ${profile.rules.syntax.lineWidth?.value ?? 'undetermined'}`,
    `- Line comments: ${profile.rules.comments.lineCommentSpacing.value ?? 'undetermined'}`,
    `- Inline trailing comments: ${profile.rules.comments.trailingInlineCommentAlignment?.value ?? 'undetermined'}`,
    `- Single-line if braces: ${profile.rules.controlFlow.singleLineIfBraces.value ?? 'undetermined'}`,
    `- Switch break indentation: ${profile.rules.whitespace.switchCaseBreakIndentation?.value ?? 'undetermined'}`,
    `- Multiline call argument layout: ${profile.rules.whitespace.multilineCallArgumentLayout?.value ?? 'undetermined'}`,
    `- Function naming: ${profile.rules.naming.functionWordCountPreference?.value ?? 'undetermined'}`,
    `- Function expression naming: ${profile.rules.naming.functionExpressionNamingPreference?.value ?? 'undetermined'}`
  ].join('\n');
}

/**
 * @param {import('../types.js').CdoProfileV1} profile
 * @param {string} outDir
 */
export async function writeAgentTemplates(profile, outDir) {
  const root = path.resolve(outDir, 'agents');
  const summary = ruleSummary(profile);

  const codex = `# AGENTS.md\n\nUse /absolute/path/to/cdo-profile.json as the style source.\n\nApply the following hard preferences unless conflicting with repository standards:\n${summary}\n\nWhen uncertain, preserve existing local style and mark decisions explicitly.\n`;

  const cursor = `---\ndescription: CDO generated style guidance\n---\nUse CDO profile schema ${profile.schemaVersion} and enforce:\n${summary}\n`;

  const claude = `# CLAUDE.md\n\nStyle authority: /absolute/path/to/cdo-profile.json\n\nPreferred style:\n${summary}\n\nIf a rule is undetermined, avoid rewriting that dimension.\n`;

  const codexPath = path.resolve(root, 'codex', 'AGENTS.md');
  const cursorPath = path.resolve(root, 'cursor', 'cdo-style.mdc');
  const claudePath = path.resolve(root, 'claude', 'CLAUDE.md');

  await writeText(codexPath, codex);
  await writeText(cursorPath, cursor);
  await writeText(claudePath, claude);

  return {
    codexPath,
    cursorPath,
    claudePath
  };
}
