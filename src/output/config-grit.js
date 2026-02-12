// @ts-check
import path from 'node:path';
import { writeText } from '../util/fs.js';

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   reason: string,
 *   mode: 'rewrite' | 'query',
 *   risk: 'low' | 'medium' | 'high',
 *   snippet: string
 * }} GritRecipe
 */

/**
 * @param {import('../types.js').InferredRule<any> | undefined} rule
 */
function isEnforced(rule) {
  return Boolean(rule && rule.status === 'enforced' && rule.value !== null);
}

/**
 * @param {import('../types.js').CdoProfileV1} profile
 * @returns {GritRecipe[]}
 */
function buildRecipes(profile) {
  /** @type {GritRecipe[]} */
  const recipes = [];

  const ifBraces = profile.rules.controlFlow.singleLineIfBraces;
  if (isEnforced(ifBraces) && ifBraces.value === 'require') {
    recipes.push({
      id: 'single-line-if-require-braces',
      title: 'Require braces for single-line if statements',
      reason: 'Profile prefers braces even for one-statement if blocks.',
      mode: 'rewrite',
      risk: 'low',
      snippet: "`if ($condition) $statement` => `if ($condition) { $statement }`"
    });
  }
  if (isEnforced(ifBraces) && ifBraces.value === 'omit') {
    recipes.push({
      id: 'single-line-if-omit-braces',
      title: 'Omit braces for one-statement if blocks',
      reason: 'Profile prefers concise single-line if statements without braces.',
      mode: 'rewrite',
      risk: 'medium',
      snippet: "`if ($condition) { $statement }` => `if ($condition) $statement`"
    });
  }

  const guardClauses = profile.rules.controlFlow.guardClauses;
  if (isEnforced(guardClauses) && guardClauses.value === 'prefer') {
    recipes.push({
      id: 'prefer-guard-clauses',
      title: 'Promote guard clauses',
      reason: 'Profile tends to short-circuit early before main logic.',
      mode: 'query',
      risk: 'high',
      snippet: "`if ($condition) { $...body } else { $...rest }`"
    });
  }

  const ternaryPlacement = profile.rules.syntax.multilineTernaryOperatorPlacement;
  if (isEnforced(ternaryPlacement) && ternaryPlacement.value === 'leading') {
    recipes.push({
      id: 'multiline-ternary-operator-leading',
      title: 'Flag ternary expressions for operator-leading multiline layout review',
      reason: 'Profile prefers multiline ternary expressions with leading ? and : operators.',
      mode: 'query',
      risk: 'low',
      snippet: "`$test ? $consequent : $alternate`"
    });
  }

  const jsdoc = profile.rules.comments.preferJsdocForFunctions;
  if (isEnforced(jsdoc) && jsdoc.value === true) {
    recipes.push({
      id: 'jsdoc-candidates',
      title: 'Find function declarations missing JSDoc',
      reason: 'Profile prefers JSDoc comments for function-level documentation.',
      mode: 'query',
      risk: 'medium',
      snippet: "`function $name($...args) { $...body }`"
    });
  }

  const naming = profile.rules.naming.functionWordCountPreference;
  if (isEnforced(naming) && naming.value === 'single-word') {
    recipes.push({
      id: 'single-word-function-name-candidates',
      title: 'Flag likely multi-word function names',
      reason: 'Profile prefers single-word naming for functions.',
      mode: 'query',
      risk: 'medium',
      snippet: "`function $name($...args) { $...body }` where $name <: r\"[_-]|[a-z][A-Z]\""
    });
  }
  if (isEnforced(naming) && naming.value === 'multi-word') {
    recipes.push({
      id: 'multi-word-function-name-candidates',
      title: 'Flag likely single-word function names',
      reason: 'Profile prefers descriptive multi-word function names.',
      mode: 'query',
      risk: 'medium',
      snippet: "`function $name($...args) { $...body }` where $name <: r\"^[a-z]+$\""
    });
  }

  const functionExpressionNaming = profile.rules.naming.functionExpressionNamingPreference;
  if (isEnforced(functionExpressionNaming) && functionExpressionNaming.value === 'named') {
    recipes.push({
      id: 'named-function-expression-candidates',
      title: 'Flag anonymous function expressions',
      reason: 'Profile prefers naming function expressions for stack traces and readability.',
      mode: 'query',
      risk: 'low',
      snippet: "`function($...args) { $statement; $...rest }`"
    });
  }

  const framing = profile.rules.comments.commentBlockFraming;
  if (isEnforced(framing) && framing.value === 'framed') {
    recipes.push({
      id: 'framed-line-comment-blocks',
      title: 'Detect unframed multi-line // comment blocks',
      reason: 'Profile prefers blank // lines framing multi-line comment groups.',
      mode: 'query',
      risk: 'medium',
      snippet: "`// $first\\n// $second`"
    });
  }
  if (isEnforced(framing) && framing.value === 'plain') {
    recipes.push({
      id: 'plain-line-comment-blocks',
      title: 'Detect framed // comment blocks',
      reason: 'Profile prefers plain comment groups without empty frame lines.',
      mode: 'query',
      risk: 'low',
      snippet: "`//\\n// $content\\n//`"
    });
  }

  const trailingInline = profile.rules.comments.trailingInlineCommentAlignment;
  if (isEnforced(trailingInline) && trailingInline.value === 'aligned') {
    recipes.push({
      id: 'aligned-inline-comments',
      title: 'Detect non-aligned trailing inline comments',
      reason: 'Profile aligns trailing assignment comments by column.',
      mode: 'query',
      risk: 'medium',
      snippet: "`$lhs = $rhs; // $comment`"
    });
  }
  if (isEnforced(trailingInline) && trailingInline.value === 'single-space') {
    recipes.push({
      id: 'single-space-inline-comments',
      title: 'Detect column-aligned trailing inline comments',
      reason: 'Profile prefers exactly one space before trailing comments.',
      mode: 'query',
      risk: 'low',
      snippet: "`$lhs = $rhs;  // $comment`"
    });
  }

  const blankBeforeReturn = profile.rules.whitespace.blankLineBeforeReturn;
  if (isEnforced(blankBeforeReturn) && blankBeforeReturn.value === 'always') {
    recipes.push({
      id: 'blank-line-before-return',
      title: 'Detect return statements without a separating blank line',
      reason: 'Profile visually groups logic by adding separation before return.',
      mode: 'query',
      risk: 'low',
      snippet: "`$statement\\nreturn $value`"
    });
  }

  const blankBeforeIf = profile.rules.whitespace.blankLineBeforeIf;
  if (isEnforced(blankBeforeIf) && blankBeforeIf.value === 'always') {
    recipes.push({
      id: 'blank-line-before-if',
      title: 'Detect if statements without a separating blank line',
      reason: 'Profile visually separates conditional sections with blank lines.',
      mode: 'query',
      risk: 'low',
      snippet: "`$statement\\nif ($condition) $body`"
    });
  }

  return recipes;
}

/**
 * @param {GritRecipe[]} recipes
 */
function renderGritRules(recipes) {
  if (!recipes.length) {
    return `engine marzano(0.1)\nlanguage js\n\n# No structural gaps required Grit recipes for this profile.\n# Biome output already covers enforced rules.\n`;
  }

  const sections = recipes.map((recipe) => [
    `# recipe: cdo.${recipe.id}`,
    `# mode: ${recipe.mode}`,
    `# risk: ${recipe.risk}`,
    `# reason: ${recipe.reason}`,
    recipe.snippet,
    ''
  ].join('\n'));

  return [
    'engine marzano(0.1)',
    'language js',
    '',
    '# Generated structural style recipes.',
    '# Review each recipe in dry-run mode before applying with writes.',
    '',
    sections.join('\n')
  ].join('\n');
}

/**
 * @param {GritRecipe[]} recipes
 */
function renderGritReadme(recipes) {
  const header = [
    '# CDO generated Grit pack',
    '',
    'This pack captures structural style habits that are weakly enforced or non-autofixable in formatter-only pipelines.',
    '',
    `- Generated recipes: ${recipes.length}`,
    '',
    '## How to use',
    '',
    '1. Start with dry-run or preview mode in your Grit environment.',
    '2. Apply one recipe category at a time.',
    '3. Re-run `cdo apply --dry-run` and inspect diffs before write mode.',
    '',
    '## Generated recipes',
    ''
  ];

  if (!recipes.length) {
    return `${header.join('\n')}\nNo recipe candidates were required for this profile.\n`;
  }

  const body = recipes.map((recipe, index) => [
    `### ${index + 1}. \`${recipe.id}\``,
    '',
    `- Title: ${recipe.title}`,
    `- Mode: \`${recipe.mode}\``,
    `- Risk: \`${recipe.risk}\``,
    `- Why: ${recipe.reason}`,
    '',
    '```grit',
    recipe.snippet,
    '```',
    ''
  ].join('\n'));

  return `${header.join('\n')}\n${body.join('\n')}`;
}

/**
 * @param {import('../types.js').CdoProfileV1} profile
 * @param {string} outDir
 */
export async function writeGritPack(profile, outDir) {
  const gritDir = path.resolve(outDir, 'grit');
  const recipes = buildRecipes(profile);
  const recipe = renderGritReadme(recipes);
  const rules = renderGritRules(recipes);
  const recipeJson = `${JSON.stringify({ recipes }, null, 2)}\n`;

  const readmePath = path.resolve(gritDir, 'README.md');
  const rulesPath = path.resolve(gritDir, 'cdo.grit');
  const recipesPath = path.resolve(gritDir, 'recipes.json');

  await writeText(readmePath, recipe);
  await writeText(rulesPath, rules);
  await writeText(recipesPath, recipeJson);

  return { readmePath, rulesPath, recipesPath, recipeCount: recipes.length };
}
