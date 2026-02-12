// @ts-check
import path from 'node:path';
import { writeText } from '../util/fs.js';

/**
 * @param {import('../types.js').InferredRule<any>} rule
 */
function enforced(rule) {
  return Boolean(rule && rule.status === 'enforced' && rule.value !== null);
}

/**
 * @param {import('../types.js').CdoProfileV1} profile
 * @param {Array<{ fileName: string, source: string }>} pluginEntries
 * @param {{ disableFormatter?: boolean }} [options]
 */
function biomeConfigObject(profile, pluginEntries, options = {}) {
  const formatterEnabled = !options.disableFormatter;
  /** @type {Record<string, unknown>} */
  const formatter = {
    enabled: formatterEnabled
  };

  const indentKind = profile.rules.whitespace.indentationKind;
  if (enforced(indentKind)) {
    formatter.indentStyle = indentKind.value;
  }

  const indentSize = profile.rules.whitespace.indentationSize;
  if (enforced(indentSize)) {
    formatter.indentWidth = Number(indentSize.value);
  }

  /** @type {Record<string, unknown>} */
  const jsFormatter = {};
  const quotes = profile.rules.syntax.quotes;
  if (enforced(quotes)) {
    jsFormatter.quoteStyle = quotes.value;
  }

  const semicolons = profile.rules.syntax.semicolons;
  if (enforced(semicolons)) {
    jsFormatter.semicolons = semicolons.value === 'always' ? 'always' : 'asNeeded';
  }

  const trailingCommas = profile.rules.syntax.trailingCommas;
  if (enforced(trailingCommas)) {
    jsFormatter.trailingCommas = trailingCommas.value === 'always-multiline' ? 'all' : 'none';
  }

  const lineWidth = profile.rules.syntax.lineWidth;
  if (enforced(lineWidth)) {
    jsFormatter.lineWidth = Number(lineWidth.value);
  }

  /** @type {Record<string, unknown>} */
  const styleRules = {};
  const braces = profile.rules.controlFlow.singleLineIfBraces;
  if (enforced(braces) && braces.value === 'require') {
    styleRules.useBlockStatements = 'error';
  }

  const yoda = profile.rules.syntax.yodaConditions;
  if (enforced(yoda) && yoda.value === 'never') {
    styleRules.noYodaExpression = 'error';
  }

  /** @type {Record<string, unknown>} */
  const config = {
    $schema: 'https://biomejs.dev/schemas/2.3.14/schema.json',
    files: {
      ignoreUnknown: true
    },
    formatter,
    linter: {
      enabled: true,
      rules: {
        recommended: false,
        ...(Object.keys(styleRules).length ? { style: styleRules } : {})
      }
    },
    assist: {
      enabled: true,
      actions: {
        source: {
          organizeImports: profile.rules.imports.ordering.status === 'enforced' ? 'on' : 'off'
        }
      }
    },
    ...(pluginEntries.length
      ? { plugins: pluginEntries.map((entry) => `./biome/plugins/${entry.fileName}`) }
      : {})
  };

  if (Object.keys(jsFormatter).length) {
    config.javascript = { formatter: jsFormatter };
  }

  return config;
}

/**
 * @param {import('../types.js').CdoProfileV1} profile
 */
function gritPluginEntries(profile) {
  /** @type {Array<{ fileName: string, source: string }>} */
  const entries = [];

  const naming = profile.rules.naming.functionWordCountPreference;
  if (enforced(naming) && naming.value === 'single-word') {
    entries.push({
      fileName: 'function-name-single-word.grit',
      source: [
        "`function $name($...args) { $...body }` where {",
        "  $name <: r\"[_-]|[a-z][A-Z]\",",
        "  register_diagnostic(span = $name, message = \"CDO profile prefers single-word function names.\", severity = \"warn\")",
        "}"
      ].join('\n')
    });
  }
  if (enforced(naming) && naming.value === 'multi-word') {
    entries.push({
      fileName: 'function-name-multi-word.grit',
      source: [
        "`function $name($...args) { $...body }` where {",
        "  $name <: r\"^[a-z]+$\",",
        "  register_diagnostic(span = $name, message = \"CDO profile prefers multi-word function names.\", severity = \"warn\")",
        "}"
      ].join('\n')
    });
  }

  const functionExpressionNaming = profile.rules.naming.functionExpressionNamingPreference;
  if (enforced(functionExpressionNaming) && functionExpressionNaming.value === 'named') {
    entries.push({
      fileName: 'function-expression-named.grit',
      source: [
        "`function ($params) { $body }` where {",
        "  register_diagnostic(span = $body, message = \"CDO profile prefers named function expressions.\", severity = \"warn\")",
        "}"
      ].join('\n')
    });
  }

  const jsdoc = profile.rules.comments.preferJsdocForFunctions;
  if (enforced(jsdoc) && jsdoc.value === true) {
    entries.push({
      fileName: 'function-jsdoc-preference.grit',
      source: [
        "`function $name($...args) { $...body }` where {",
        "  register_diagnostic(span = $name, message = \"CDO profile prefers JSDoc on functions.\", severity = \"warn\")",
        "}"
      ].join('\n')
    });
  }

  const braces = profile.rules.controlFlow.singleLineIfBraces;
  if (enforced(braces) && braces.value === 'omit') {
    entries.push({
      fileName: 'single-line-if-omit-braces.grit',
      source: [
        "`if ($condition) { $statement }` where {",
        "  register_diagnostic(span = $statement, message = \"CDO profile prefers omitting braces for single-line if statements.\", severity = \"warn\")",
        "}"
      ].join('\n')
    });
  }

  const guard = profile.rules.controlFlow.guardClauses;
  if (enforced(guard) && guard.value === 'prefer') {
    entries.push({
      fileName: 'guard-clause-preference.grit',
      source: [
        "`function $name($...args) { $first; $...rest }` where {",
        "  register_diagnostic(span = $name, message = \"CDO profile prefers guard clauses at function start.\", severity = \"info\")",
        "}"
      ].join('\n')
    });
  }

  return entries;
}

/**
 * @param {import('../types.js').CdoProfileV1} profile
 * @param {string} outDir
 * @param {{ disableFormatter?: boolean }} [options]
 */
export async function writeBiomeConfig(profile, outDir, options = {}) {
  const target = path.resolve(outDir, 'biome.json');
  const pluginEntries = gritPluginEntries(profile);
  const config = biomeConfigObject(profile, pluginEntries, options);

  await writeText(target, `${JSON.stringify(config, null, 2)}\n`);
  /** @type {string[]} */
  const pluginPaths = [];
  for (const entry of pluginEntries) {
    const pluginPath = path.resolve(outDir, 'biome', 'plugins', entry.fileName);
    await writeText(pluginPath, `${entry.source}\n`);
    pluginPaths.push(pluginPath);
  }

  return {
    configPath: target,
    pluginPath: pluginPaths[0] ?? null,
    pluginPaths
  };
}
