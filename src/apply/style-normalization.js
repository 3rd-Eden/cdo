// @ts-check
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

/**
 * @typedef {'match-case' | 'indent'} SwitchCaseBreakStyle
 * @typedef {'space' | 'tab'} IndentKind
 * @typedef {'compact' | 'expanded'} MultilineCallLayout
 * @typedef {'aligned' | 'indented'} MemberExpressionIndentationStyle
 * @typedef {'leading' | 'trailing'} VariableDeclarationCommaPlacement
 * @typedef {'leading' | 'trailing'} TernaryOperatorPlacement
 */

/**
 * @param {string} source
 */
function parseAst(source) {
  try {
    return parse(source, {
      sourceType: 'unambiguous',
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator',
        'dynamicImport',
        'decorators-legacy'
      ],
      errorRecovery: true,
      allowReturnOutsideFunction: true,
      ranges: true,
      tokens: true
    });
  } catch {
    return null;
  }
}

/**
 * @param {string} source
 */
function lineOffsets(source) {
  /** @type {number[]} */
  const offsets = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') offsets.push(index + 1);
  }
  return offsets;
}

/**
 * @param {number} column
 * @param {IndentKind} indentKind
 * @param {number} indentSize
 */
function indentForColumn(column, indentKind, indentSize) {
  if (indentKind !== 'tab') return ' '.repeat(Math.max(0, column));

  const size = Math.max(1, Math.floor(indentSize || 2));
  const tabs = Math.floor(column / size);
  const spaces = column % size;
  return `${'\t'.repeat(Math.max(0, tabs))}${' '.repeat(Math.max(0, spaces))}`;
}

/**
 * @param {string} source
 * @param {Array<{ start: number, end: number, text: string }>} replacements
 */
function applyReplacements(source, replacements) {
  if (!replacements.length) return source;
  const sorted = [...replacements].sort((a, b) => b.start - a.start);

  let next = source;
  for (const replacement of sorted) {
    if (replacement.start < 0 || replacement.end < replacement.start) continue;
    next =
      next.slice(0, replacement.start) +
      replacement.text +
      next.slice(replacement.end);
  }

  return next;
}

/**
 * @param {string} indent
 * @param {number} count
 */
function dedentIndent(indent, count) {
  if (count <= 0 || !indent) return indent;

  let remove = 0;
  while (
    remove < indent.length &&
    remove < count &&
    (indent[remove] === ' ' || indent[remove] === '\t')
  ) {
    remove += 1;
  }

  return indent.slice(remove);
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function sanitizeForSignature(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForSignature(entry));
  }
  if (!value || typeof value !== 'object') return value;

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, entry] of Object.entries(/** @type {Record<string, unknown>} */ (value))) {
    if (
      key === 'start' ||
      key === 'end' ||
      key === 'range' ||
      key === 'loc' ||
      key === 'extra' ||
      key === 'leadingComments' ||
      key === 'trailingComments' ||
      key === 'innerComments'
    ) {
      continue;
    }
    out[key] = sanitizeForSignature(entry);
  }
  return out;
}

/**
 * @param {import('@babel/types').Node} node
 */
function nodeSignature(node) {
  return JSON.stringify(sanitizeForSignature(node));
}

/**
 * @param {import('@babel/types').Node | null | undefined} callee
 */
function collectCalleeMembers(callee) {
  /** @type {import('@babel/types').MemberExpression[]} */
  const members = [];

  /**
   * @param {import('@babel/types').Node | null | undefined} node
   */
  function walk(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'CallExpression') {
      walk(node.callee);
      return;
    }
    if (node.type === 'OptionalCallExpression') {
      walk(node.callee);
      return;
    }
    if (node.type === 'MemberExpression') {
      walk(node.object);
      members.push(node);
    }
  }

  walk(callee);
  return members;
}

/**
 * @param {string} source
 * @param {import('@babel/types').MemberExpression} member
 */
function memberSeparator(source, member) {
  if (typeof member.object.end !== 'number' || typeof member.property.start !== 'number') {
    return null;
  }

  const between = source.slice(member.object.end, member.property.start);
  if (!between.includes('.') && !between.includes('?.')) return null;
  const delimiter = between.includes('?.') ? '?.' : '.';
  return {
    start: member.object.end,
    end: member.property.start,
    between,
    delimiter,
    hasNewline: between.includes('\n')
  };
}

/**
 * @typedef {{ broken: boolean, column: number | null }} MemberChainSegment
 * @typedef {{ segments: MemberChainSegment[] }} MemberChainLayout
 */

/**
 * @param {string} referenceSource
 */
function collectReferenceMemberChainLayouts(referenceSource) {
  const ast = parseAst(referenceSource);
  /** @type {Map<string, MemberChainLayout[]>} */
  const layouts = new Map();
  if (!ast) return layouts;

  /**
   * @param {import('@babel/types').CallExpression | import('@babel/types').OptionalCallExpression} node
   */
  function collectNode(node) {
    const members = collectCalleeMembers(node.callee);
    if (members.length < 2) return;

    /** @type {MemberChainSegment[]} */
    const segments = [];
    let brokenCount = 0;
    for (const member of members) {
      const separator = memberSeparator(referenceSource, member);
      if (!separator) continue;

      const propertyColumn = member.property.loc?.start.column;
      const column =
        separator.hasNewline && typeof propertyColumn === 'number'
          ? Math.max(0, propertyColumn - separator.delimiter.length)
          : null;

      if (separator.hasNewline) brokenCount += 1;
      segments.push({
        broken: separator.hasNewline,
        column
      });
    }

    if (!segments.length || brokenCount === 0) return;
    const key = nodeSignature(node);
    const queue = layouts.get(key) ?? [];
    queue.push({ segments });
    layouts.set(key, queue);
  }

  traverse.default(ast, {
    CallExpression(path) {
      const parent = path.parentPath?.node;
      if (
        parent &&
        (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') &&
        parent.object === path.node
      ) {
        return;
      }
      collectNode(path.node);
    },
    OptionalCallExpression(path) {
      const parent = path.parentPath?.node;
      if (
        parent &&
        (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') &&
        parent.object === path.node
      ) {
        return;
      }
      collectNode(path.node);
    }
  });

  return layouts;
}

/**
 * @param {string} source
 * @param {MemberExpressionIndentationStyle} style
 * @param {IndentKind} indentKind
 * @param {number} indentSize
 * @param {Map<string, MemberChainLayout[]>} referenceLayouts
 */
function applyReferenceMemberChainBreaks(
  source,
  style,
  indentKind,
  indentSize,
  referenceLayouts
) {
  if (!referenceLayouts.size) return source;
  const ast = parseAst(source);
  if (!ast) return source;

  const indentStep = Math.max(1, Math.floor(indentSize || 2));
  /** @type {Array<{ start: number, end: number, text: string }>} */
  const replacements = [];

  /**
   * @param {import('@babel/types').CallExpression | import('@babel/types').OptionalCallExpression} node
   */
  function alignNode(node) {
    const key = nodeSignature(node);
    const queue = referenceLayouts.get(key);
    if (!queue?.length) return;
    const layout = queue.shift();
    if (!layout) return;

    const baseColumn = node.loc?.start.column ?? 0;
    const fallbackColumn = style === 'aligned' ? baseColumn : baseColumn + indentStep;
    const members = collectCalleeMembers(node.callee);

    /** @type {Array<{ start: number, end: number, between: string, delimiter: string, hasNewline: boolean }>} */
    const currentSegments = [];
    for (const member of members) {
      const separator = memberSeparator(source, member);
      if (!separator) continue;
      currentSegments.push(separator);
    }

    const total = Math.min(layout.segments.length, currentSegments.length);
    for (let index = 0; index < total; index += 1) {
      const target = layout.segments[index];
      const current = currentSegments[index];
      if (/\/\//.test(current.between) || /\/\*/.test(current.between)) continue;

      if (target.broken && !current.hasNewline) {
        const targetColumn =
          typeof target.column === 'number' ? target.column : fallbackColumn;
        replacements.push({
          start: current.start,
          end: current.end,
          text: `\n${indentForColumn(targetColumn, indentKind, indentSize)}${current.delimiter}`
        });
        continue;
      }

      if (!target.broken && current.hasNewline) {
        replacements.push({
          start: current.start,
          end: current.end,
          text: current.delimiter
        });
      }
    }
  }

  traverse.default(ast, {
    CallExpression(path) {
      const parent = path.parentPath?.node;
      if (
        parent &&
        (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') &&
        parent.object === path.node
      ) {
        return;
      }
      alignNode(path.node);
    },
    OptionalCallExpression(path) {
      const parent = path.parentPath?.node;
      if (
        parent &&
        (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') &&
        parent.object === path.node
      ) {
        return;
      }
      alignNode(path.node);
    }
  });

  return applyReplacements(source, replacements);
}

/**
 * @param {string} source
 * @param {MemberExpressionIndentationStyle} style
 * @param {IndentKind} indentKind
 * @param {number} indentSize
 */
function applyMemberChainIndentation(source, style, indentKind, indentSize) {
  const ast = parseAst(source);
  if (!ast) return source;
  const offsets = lineOffsets(source);
  const lines = source.split('\n');
  const indentStep = Math.max(1, Math.floor(indentSize || 2));

  /** @type {Array<{ start: number, end: number, text: string }>} */
  const replacements = [];

  traverse.default(ast, {
    MemberExpression(path) {
      const objectStartLine = path.node.object.loc?.start.line;
      const objectStartColumn = path.node.object.loc?.start.column;
      const memberLine = path.node.property.loc?.start.line;
      if (
        typeof objectStartLine !== 'number' ||
        typeof objectStartColumn !== 'number' ||
        typeof memberLine !== 'number' ||
        memberLine <= objectStartLine
      ) {
        return;
      }

      const continuation = lines[memberLine - 1];
      if (!continuation) return;
      if (!/^\s*(?:\?\.|\.)/.test(continuation)) return;

      const continuationColumn = continuation.match(/^\s*/)?.[0].length ?? 0;
      const desiredColumn =
        style === 'aligned'
          ? objectStartColumn
          : objectStartColumn + indentStep;
      if (continuationColumn === desiredColumn) return;

      const lineStart = offsets[memberLine - 1];
      if (typeof lineStart !== 'number') return;
      replacements.push({
        start: lineStart,
        end: lineStart + continuationColumn,
        text: indentForColumn(desiredColumn, indentKind, indentSize)
      });
    }
  });

  return applyReplacements(source, replacements);
}

/**
 * @param {string} source
 * @param {MemberExpressionIndentationStyle | null} style
 * @param {IndentKind} indentKind
 * @param {number} indentSize
 * @param {string | null} referenceSource
 */
export function applyMemberExpressionIndentation(
  source,
  style,
  indentKind = 'space',
  indentSize = 2,
  referenceSource = null
) {
  if (!style) return source;

  let next = source;
  if (typeof referenceSource === 'string' && referenceSource.length > 0) {
    const referenceLayouts = collectReferenceMemberChainLayouts(referenceSource);
    next = applyReferenceMemberChainBreaks(
      next,
      style,
      indentKind,
      indentSize,
      referenceLayouts
    );
  }

  return applyMemberChainIndentation(next, style, indentKind, indentSize);
}

/**
 * @typedef {{
 *   placement: TernaryOperatorPlacement,
 *   questionColumn: number,
 *   colonColumn: number
 * }} ReferenceTernaryLayout
 */

/**
 * @param {string} source
 * @param {number} start
 * @param {number} end
 * @param {'?' | ':'} operator
 */
function ternaryOperatorInfo(source, start, end, operator) {
  const between = source.slice(start, end);
  const index = between.indexOf(operator);
  if (index === -1) return null;

  const absolute = start + index;
  const lineStart = source.lastIndexOf('\n', absolute - 1) + 1;
  return {
    column: absolute - lineStart,
    leading: /\n/.test(between.slice(0, index))
  };
}

/**
 * @param {string} source
 * @param {import('@babel/types').ConditionalExpression} node
 * @returns {ReferenceTernaryLayout | null}
 */
function ternaryPlacement(source, node) {
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

  const question = ternaryOperatorInfo(source, node.test.end, node.consequent.start, '?');
  const colon = ternaryOperatorInfo(source, node.consequent.end, node.alternate.start, ':');
  if (!question || !colon) return null;

  return {
    placement: question.leading || colon.leading ? 'leading' : 'trailing',
    questionColumn: question.column,
    colonColumn: colon.column
  };
}

/**
 * @param {string} referenceSource
 */
function collectReferenceTernaryLayouts(referenceSource) {
  const ast = parseAst(referenceSource);
  /** @type {Map<string, ReferenceTernaryLayout[]>} */
  const layouts = new Map();
  if (!ast) return layouts;

  traverse.default(ast, {
    ConditionalExpression(path) {
      const info = ternaryPlacement(referenceSource, path.node);
      if (!info) return;

      const key = nodeSignature(path.node);
      const queue = layouts.get(key) ?? [];
      queue.push(info);
      layouts.set(key, queue);
    }
  });

  return layouts;
}

/**
 * @param {string} source
 * @param {TernaryOperatorPlacement} placement
 * @param {IndentKind} indentKind
 * @param {number} indentSize
 * @param {Map<string, ReferenceTernaryLayout[]>} referenceLayouts
 */
function applyReferenceTernaryLayouts(
  source,
  placement,
  indentKind,
  indentSize,
  referenceLayouts
) {
  if (!referenceLayouts.size || placement !== 'leading') return source;

  const ast = parseAst(source);
  if (!ast) return source;

  /** @type {Array<{ start: number, end: number, text: string }>} */
  const replacements = [];

  traverse.default(ast, {
    ConditionalExpression(path) {
      const node = path.node;
      const key = nodeSignature(node);
      const queue = referenceLayouts.get(key);
      if (!queue?.length) return;
      const reference = queue.shift();
      if (!reference) return;

      const startLine = node.loc?.start.line;
      const endLine = node.loc?.end.line;
      if (typeof startLine !== 'number' || typeof endLine !== 'number') return;
      if (startLine !== endLine) return;

      if (
        typeof node.start !== 'number' ||
        typeof node.end !== 'number' ||
        typeof node.test.start !== 'number' ||
        typeof node.test.end !== 'number' ||
        typeof node.consequent.start !== 'number' ||
        typeof node.consequent.end !== 'number' ||
        typeof node.alternate.start !== 'number' ||
        typeof node.alternate.end !== 'number'
      ) {
        return;
      }

      const betweenQuestion = source.slice(node.test.end, node.consequent.start);
      const betweenColon = source.slice(node.consequent.end, node.alternate.start);
      if (
        /\/\//.test(betweenQuestion) ||
        /\/\*/.test(betweenQuestion) ||
        /\/\//.test(betweenColon) ||
        /\/\*/.test(betweenColon)
      ) {
        return;
      }

      const test = source.slice(node.test.start, node.test.end).trim();
      const consequent = source.slice(node.consequent.start, node.consequent.end).trim();
      const alternate = source.slice(node.alternate.start, node.alternate.end).trim();
      if (!test || !consequent || !alternate) return;
      if (test.includes('\n') || consequent.includes('\n') || alternate.includes('\n')) return;

      const fallbackColumn = (node.loc?.start.column ?? 0) + Math.max(1, Math.floor(indentSize || 2));
      const questionColumn = Number.isInteger(reference.questionColumn)
        ? reference.questionColumn
        : fallbackColumn;
      const colonColumn = Number.isInteger(reference.colonColumn)
        ? reference.colonColumn
        : questionColumn;

      replacements.push({
        start: node.start,
        end: node.end,
        text: [
          test,
          `${indentForColumn(questionColumn, indentKind, indentSize)}? ${consequent}`,
          `${indentForColumn(colonColumn, indentKind, indentSize)}: ${alternate}`
        ].join('\n')
      });
    }
  });

  return applyReplacements(source, replacements);
}

/**
 * @param {string} source
 * @param {TernaryOperatorPlacement | null} placement
 * @param {IndentKind} indentKind
 * @param {number} indentSize
 * @param {string | null} referenceSource
 */
export function applyTernaryLayout(
  source,
  placement,
  indentKind = 'space',
  indentSize = 2,
  referenceSource = null
) {
  if (!placement) return source;

  if (typeof referenceSource !== 'string' || referenceSource.length === 0) {
    return source;
  }

  const referenceLayouts = collectReferenceTernaryLayouts(referenceSource);
  return applyReferenceTernaryLayouts(
    source,
    placement,
    indentKind,
    indentSize,
    referenceLayouts
  );
}

/**
 * @param {string} source
 * @param {'omit' | 'require' | null} style
 */
export function applySingleLineIfStyle(source, style) {
  if (style !== 'omit') return source;

  const ast = parseAst(source);
  if (!ast) return source;

  const lines = source.split('\n');
  /** @type {Array<{ start: number, end: number, text: string }>} */
  const replacements = [];

  traverse.default(ast, {
    IfStatement(path) {
      const node = path.node;
      if (node.alternate) return;
      if (node.consequent.type === 'BlockStatement') return;

      const ifLine = node.loc?.start.line;
      const testStartLine = node.test.loc?.start.line;
      const testEndLine = node.test.loc?.end.line;
      const statementStartLine = node.consequent.loc?.start.line;
      const statementEndLine = node.consequent.loc?.end.line;
      if (
        typeof ifLine !== 'number' ||
        typeof testStartLine !== 'number' ||
        typeof testEndLine !== 'number' ||
        typeof statementStartLine !== 'number' ||
        typeof statementEndLine !== 'number'
      ) {
        return;
      }

      if (testStartLine !== ifLine || testEndLine !== ifLine) return;
      if (statementStartLine !== statementEndLine) return;
      if (statementStartLine !== ifLine + 1) return;

      const ifStart = node.start;
      const ifEnd = node.consequent.end;
      const testStart = node.test.start;
      const testEnd = node.test.end;
      const statementStart = node.consequent.start;
      const statementEnd = node.consequent.end;

      if (
        typeof ifStart !== 'number' ||
        typeof ifEnd !== 'number' ||
        typeof testStart !== 'number' ||
        typeof testEnd !== 'number' ||
        typeof statementStart !== 'number' ||
        typeof statementEnd !== 'number'
      ) {
        return;
      }

      const statementLine = lines[statementStartLine - 1] ?? '';
      if (statementLine.includes('//')) return;

      const between = source.slice(testEnd, statementStart);
      if (!between.includes('\n')) return;
      if (/\/\//.test(between) || /\/\*/.test(between)) return;

      const condition = source.slice(testStart, testEnd);
      const statement = source.slice(statementStart, statementEnd);
      if (condition.includes('\n') || statement.includes('\n')) return;

      replacements.push({
        start: ifStart,
        end: ifEnd,
        text: `if (${condition}) ${statement}`
      });
    }
  });

  return applyReplacements(source, replacements);
}

/**
 * @param {string} source
 * @param {MultilineCallLayout | null} layout
 */
export function applyMultilineCallArgumentLayout(source, layout) {
  if (layout !== 'compact') return source;

  const ast = parseAst(source);
  if (!ast) return source;

  /** @type {Array<{ start: number, end: number, text: string }>} */
  const replacements = [];

  traverse.default(ast, {
    CallExpression(path) {
      const node = path.node;
      if (!node.arguments.length) return;

      const callStart = node.loc?.start.line;
      const callEnd = node.loc?.end.line;
      const firstArg = node.arguments[0];
      const firstArgStart = firstArg?.loc?.start.line;
      if (
        typeof callStart !== 'number' ||
        typeof callEnd !== 'number' ||
        typeof firstArgStart !== 'number'
      ) {
        return;
      }

      if (callEnd <= callStart) return;

      const start = node.start;
      const end = node.end;
      const calleeEnd = node.callee.end;
      const firstArgOffset = firstArg.start;
      if (
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        typeof calleeEnd !== 'number' ||
        typeof firstArgOffset !== 'number'
      ) {
        return;
      }

      const prefix = source.slice(calleeEnd, firstArgOffset);
      if (/\/\//.test(prefix) || /\/\*/.test(prefix)) return;

      const openParenRelative = prefix.lastIndexOf('(');
      if (openParenRelative === -1) return;
      const openParen = calleeEnd + openParenRelative;
      const closeParen = end - 1;
      if (closeParen <= openParen || source[closeParen] !== ')') return;

      const args = node.arguments;
      const lastArg = args[args.length - 1];
      if (typeof lastArg?.end !== 'number') return;

      const betweenOpenAndFirst = source.slice(openParen + 1, firstArgOffset);
      if (/\/\//.test(betweenOpenAndFirst) || /\/\*/.test(betweenOpenAndFirst)) return;

      let shouldCompact = betweenOpenAndFirst.includes('\n');
      for (let index = 1; index < args.length; index += 1) {
        const previous = args[index - 1];
        const current = args[index];
        if (typeof previous.end !== 'number' || typeof current.start !== 'number') return;

        const between = source.slice(previous.end, current.start);
        if (!between.includes(',')) return;
        if (/\/\//.test(between) || /\/\*/.test(between)) return;
        if (between.includes('\n')) shouldCompact = true;
      }

      const betweenLastAndClose = source.slice(lastArg.end, closeParen);
      if (/\/\//.test(betweenLastAndClose) || /\/\*/.test(betweenLastAndClose)) return;
      if (betweenLastAndClose.includes('\n')) shouldCompact = true;

      if (!shouldCompact) return;

      const trailingComma = /,\s*$/.test(betweenLastAndClose);
      const argTexts = args.map((arg) => {
        if (typeof arg.start !== 'number' || typeof arg.end !== 'number') return '';
        return source.slice(arg.start, arg.end);
      });
      if (argTexts.some((text) => text === '')) return;

      const compactArgs = `${argTexts.join(', ')}${trailingComma ? ',' : ''}`;
      let transformed = `${source.slice(start, openParen + 1)}${compactArgs})`;

      // If the call was in expanded-argument form, compacting args should also
      // remove one continuation indent level from multiline argument content.
      if (firstArgStart > callStart) {
        const callLineStart = source.lastIndexOf('\n', start - 1) + 1;
        const firstArgLineStart = source.lastIndexOf('\n', firstArgOffset - 1) + 1;
        const callIndent = Math.max(0, start - callLineStart);
        const firstArgIndent = Math.max(0, firstArgOffset - firstArgLineStart);
        const dedentBy = Math.max(0, firstArgIndent - callIndent);
        if (dedentBy > 0) {
          transformed = transformed.replace(/\n([ \t]+)/g, (_, indent) => `\n${dedentIndent(indent, dedentBy)}`);
        }
      }

      const original = source.slice(start, end);
      if (transformed === original) return;
      replacements.push({
        start,
        end,
        text: transformed
      });
    }
  });

  return applyReplacements(source, replacements);
}

/**
 * @param {string} source
 * @param {VariableDeclarationCommaPlacement | null} placement
 */
export function applyVariableDeclarationCommaPlacement(source, placement) {
  if (!placement) return source;

  const ast = parseAst(source);
  if (!ast) return source;
  const offsets = lineOffsets(source);

  /** @type {Array<{ start: number, end: number, text: string }>} */
  const replacements = [];

  traverse.default(ast, {
    VariableDeclaration(path) {
      const declarations = path.node.declarations;
      if (declarations.length < 2) return;

      for (let index = 1; index < declarations.length; index += 1) {
        const previous = declarations[index - 1];
        const current = declarations[index];
        if (typeof previous.end !== 'number' || typeof current.start !== 'number') continue;

        const between = source.slice(previous.end, current.start);
        if (!between.includes('\n')) continue;
        if (/\/\//.test(between) || /\/\*/.test(between)) continue;

        const commaIndex = between.indexOf(',');
        if (commaIndex === -1) continue;

        const beforeComma = between.slice(0, commaIndex);
        const afterComma = between.slice(commaIndex + 1);
        const lastLineBreak = beforeComma.lastIndexOf('\n');
        const beforeCommaLine = lastLineBreak === -1
          ? beforeComma
          : beforeComma.slice(lastLineBreak + 1);
        const newlineBeforeComma = beforeComma.includes('\n');
        const newlineAfterComma = afterComma.includes('\n');
        const isLeading = newlineBeforeComma && beforeCommaLine.trim() === '';
        const isTrailing = !newlineBeforeComma && newlineAfterComma;
        if (!isLeading && !isTrailing) continue;

        const currentLine = current.loc?.start.line;
        if (typeof currentLine !== 'number') continue;
        const lineStart = offsets[currentLine - 1];
        if (typeof lineStart !== 'number') continue;
        const currentIndent = source.slice(lineStart, current.start);

        if (placement === 'leading' && isTrailing) {
          replacements.push({
            start: previous.end,
            end: current.start,
            text: `\n${currentIndent}, `
          });
          continue;
        }

        if (placement === 'trailing' && isLeading) {
          replacements.push({
            start: previous.end,
            end: current.start,
            text: `,\n${currentIndent}`
          });
        }
      }
    }
  });

  return applyReplacements(source, replacements);
}

/**
 * @param {string} source
 * @param {SwitchCaseBreakStyle | null} style
 * @param {IndentKind} indentKind
 * @param {number} indentSize
 */
export function applySwitchCaseBreakIndentation(
  source,
  style,
  indentKind = 'space',
  indentSize = 2
) {
  if (!style) return source;

  const ast = parseAst(source);
  if (!ast) return source;
  const offsets = lineOffsets(source);

  /** @type {Array<{ start: number, end: number, text: string }>} */
  const replacements = [];

  traverse.default(ast, {
    SwitchCase(path) {
      const caseColumn = path.node.loc?.start.column;
      if (typeof caseColumn !== 'number') return;

      const desiredColumn =
        style === 'match-case'
          ? caseColumn
          : caseColumn + Math.max(1, Math.floor(indentSize || 2));

      for (const statement of path.node.consequent) {
        if (statement.type !== 'BreakStatement') continue;

        const breakLine = statement.loc?.start.line;
        const breakColumn = statement.loc?.start.column;
        if (
          typeof breakLine !== 'number' ||
          typeof breakColumn !== 'number' ||
          breakColumn === desiredColumn
        ) {
          continue;
        }

        const lineStart = offsets[breakLine - 1];
        if (typeof lineStart !== 'number') continue;

        replacements.push({
          start: lineStart,
          end: lineStart + breakColumn,
          text: indentForColumn(desiredColumn, indentKind, indentSize)
        });
      }
    }
  });

  return applyReplacements(source, replacements);
}
