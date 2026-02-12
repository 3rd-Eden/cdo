// @ts-check

/**
 * @param {string} name
 */
export function nameWordCount(name) {
  if (!name) return 0;

  const normalized = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .trim();

  if (!normalized) return 0;
  return normalized.split(/\s+/).length;
}

/**
 * @param {import('@babel/types').Node | null | undefined} node
 */
export function nodeEnd(node) {
  return typeof node?.end === 'number' ? node.end : -1;
}

/**
 * @param {number} lineNumber
 * @param {string[]} lines
 */
export function hasBlankLineBefore(lineNumber, lines) {
  if (!Number.isInteger(lineNumber) || lineNumber <= 1) return false;
  const previous = lines[lineNumber - 2];
  return previous !== undefined && /^\s*$/.test(previous);
}

/**
 * @param {import('@babel/types').Statement | null | undefined} node
 */
export function isGuardExitStatement(node) {
  if (!node) return false;
  if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') return true;

  if (node.type === 'BlockStatement') {
    if (node.body.length !== 1) return false;
    return isGuardExitStatement(node.body[0]);
  }

  return false;
}

/**
 * @param {import('@babel/types').Node | null | undefined} node
 */
function isLiteralLike(node) {
  if (!node) return false;
  if (
    node.type === 'StringLiteral' ||
    node.type === 'NumericLiteral' ||
    node.type === 'BooleanLiteral' ||
    node.type === 'NullLiteral' ||
    node.type === 'BigIntLiteral' ||
    node.type === 'RegExpLiteral'
  ) {
    return true;
  }

  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return true;
  }

  return false;
}

/**
 * @param {import('@babel/types').Node | null | undefined} node
 * @param {import('./signals.js').FileSignals} signals
 */
export function updateYodaStats(node, signals) {
  if (!node) return;

  if (node.type === 'LogicalExpression') {
    updateYodaStats(node.left, signals);
    updateYodaStats(node.right, signals);
    return;
  }

  if (node.type === 'ParenthesizedExpression') {
    updateYodaStats(node.expression, signals);
    return;
  }

  if (node.type !== 'BinaryExpression') return;
  if (!['==', '===', '!=', '!==', '<', '<=', '>', '>='].includes(node.operator)) return;

  const leftLiteral = isLiteralLike(node.left);
  const rightLiteral = isLiteralLike(node.right);
  if (leftLiteral === rightLiteral) return;

  if (leftLiteral) signals.yodaConditionsYes += 1;
  else signals.yodaConditionsNo += 1;
}

/**
 * @param {string} source
 * @param {import('@babel/types').ConditionalExpression} node
 * @returns {'leading' | 'trailing' | null}
 */
export function multilineTernaryOperatorPlacement(source, node) {
  const startLine = node.loc?.start.line;
  const endLine = node.loc?.end.line;
  if (typeof startLine !== 'number' || typeof endLine !== 'number' || startLine === endLine) {
    return null;
  }

  if (
    typeof node.test.end !== 'number' ||
    typeof node.consequent.start !== 'number' ||
    typeof node.consequent.end !== 'number' ||
    typeof node.alternate.start !== 'number'
  ) {
    return null;
  }

  const questionSegment = source.slice(node.test.end, node.consequent.start);
  const colonSegment = source.slice(node.consequent.end, node.alternate.start);
  const questionIndex = questionSegment.indexOf('?');
  const colonIndex = colonSegment.indexOf(':');
  if (questionIndex === -1 || colonIndex === -1) return null;

  const questionLeading = /\n/.test(questionSegment.slice(0, questionIndex));
  const colonLeading = /\n/.test(colonSegment.slice(0, colonIndex));
  if (questionLeading || colonLeading) return 'leading';

  return 'trailing';
}

/**
 * @param {string[]} values
 * @param {import('./signals.js').FileSignals} signals
 */
export function updateOrderingStats(values, signals) {
  if (values.length < 2) return;

  const sorted = [...values].sort((a, b) => a.localeCompare(b));
  const isSorted = values.every((value, index) => value === sorted[index]);
  const weight = Math.max(1, values.length - 1);
  if (isSorted) signals.importSortedGroups += weight;
  else signals.importUnsortedGroups += weight;
}

/**
 * @param {string} source
 * @param {import('@babel/types').Node} node
 * @param {(import('@babel/types').Node | null | undefined)[]} items
 * @param {import('./signals.js').FileSignals} signals
 */
export function updateTrailingCommaStats(source, node, items, signals) {
  const filtered = items.filter(Boolean);
  if (filtered.length < 2) return;

  const startLine = node.loc?.start.line ?? 0;
  const endLine = node.loc?.end.line ?? 0;
  if (startLine === endLine) return;

  const last = filtered[filtered.length - 1];
  const end = nodeEnd(node);
  const lastEnd = nodeEnd(last);

  if (end < 1 || lastEnd < 0 || lastEnd >= end) return;

  const between = source.slice(lastEnd, end - 1);
  if (between.includes(',')) signals.trailingCommaYes += 1;
  else signals.trailingCommaNo += 1;
}
