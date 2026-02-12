// @ts-check

/**
 * Skip comment lines that are usually directives or separators,
 * as they do not express spacing preference.
 * @param {string} value
 */
export function ignoreLineCommentForSpacing(value) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^[-=*_/#]+$/.test(trimmed)) return true;
  if (/^(?:eslint|istanbul|jshint|jscs|sourceMappingURL|region|endregion)\b/i.test(trimmed)) return true;
  if (/^(?:#|@ts-)/i.test(trimmed)) return true;
  return false;
}

/**
 * @param {string} text
 */
function isMeaningfulCommentText(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^[-=*_/#]+$/.test(trimmed)) return false;
  if (ignoreLineCommentForSpacing(trimmed)) return false;
  return true;
}

/**
 * @param {string} prefix
 */
function isLikelyAlignmentPrefix(prefix) {
  const trimmed = prefix.trim();
  if (!trimmed) return false;
  if (/^(?:if|for|while|switch|catch)\s*\(/.test(trimmed)) return false;
  if (/^(?:return|throw)\b/.test(trimmed)) return false;
  if (/^(?:case|default)\b/.test(trimmed)) return false;
  if (/^\[/.test(trimmed)) return true;
  if (/,\s*$/.test(trimmed)) return true;
  if (/\{\s*$/.test(trimmed)) return true;
  if (/^(?:['"][^'"]+['"]|[A-Za-z_$][\w$]*)\s*:/.test(trimmed)) return true;
  return /(?:^|[^=!<>])(?:[+\-*/%&|^]?=)(?!=)/.test(trimmed);
}

/**
 * @param {string[]} lines
 * @param {import('@babel/types').File['comments']} comments
 * @param {import('./signals.js').FileSignals} signals
 */
function updateTrailingInlineCommentAlignment(lines, comments, signals) {
  /** @type {Array<{ line: number, column: number, gap: number, codeLength: number, indent: number }>} */
  const entries = [];

  for (const comment of comments ?? []) {
    if (comment.type !== 'CommentLine') continue;

    const line = comment.loc?.start.line;
    const column = comment.loc?.start.column;
    if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1) continue;

    const text = lines[line - 1];
    if (typeof text !== 'string') continue;

    const prefix = text.slice(0, column);
    if (!/\S/.test(prefix)) continue;

    const trimmedPrefix = prefix.replace(/\s+$/, '');
    const gap = prefix.length - trimmedPrefix.length;
    if (gap < 1) continue;
    if (!isLikelyAlignmentPrefix(trimmedPrefix)) continue;

    entries.push({
      line,
      column,
      gap,
      codeLength: trimmedPrefix.length,
      indent: prefix.match(/^\s*/)?.[0].length ?? 0
    });
  }

  for (let index = 0; index < entries.length;) {
    const group = [entries[index]];
    let cursor = index + 1;
    while (cursor < entries.length) {
      const previous = entries[cursor - 1];
      const current = entries[cursor];
      const baseIndent = group[0]?.indent ?? current.indent;
      const gap = current.line - previous.line - 1;
      const between = gap > 0
        ? lines.slice(previous.line, current.line - 1)
        : [];
      const hasBlankBetween = between.some((line) => /^\s*$/.test(line));
      const split =
        current.indent !== baseIndent ||
        gap > 3 ||
        hasBlankBetween;
      if (split) break;

      group.push(entries[cursor]);
      cursor += 1;
    }
    index = cursor;

    if (group.length < 2) continue;

    for (let pairIndex = 1; pairIndex < group.length; pairIndex += 1) {
      const previous = group[pairIndex - 1];
      const current = group[pairIndex];

      const ambiguousSingleSpace =
        previous.gap === 1 &&
        current.gap === 1 &&
        previous.codeLength === current.codeLength;

      if (ambiguousSingleSpace) continue;

      if (previous.column === current.column) {
        signals.trailingInlineCommentAlignedPairs += 1;
      } else {
        signals.trailingInlineCommentUnalignedPairs += 1;
      }
    }
  }
}

/**
 * @param {string[]} lines
 * @param {import('@babel/types').File['comments']} comments
 * @param {import('./signals.js').FileSignals} signals
 */
export function collectCommentSignals(lines, comments, signals) {
  for (let index = 0; index < lines.length;) {
    const match = lines[index].match(/^\s*\/\/(.*)$/);
    if (!match) {
      index += 1;
      continue;
    }

    /** @type {string[]} */
    const group = [];
    let cursor = index;
    while (cursor < lines.length) {
      const lineMatch = lines[cursor].match(/^\s*\/\/(.*)$/);
      if (!lineMatch) break;
      group.push(lineMatch[1].trim());
      cursor += 1;
    }
    index = cursor;

    const meaningful = group.filter(isMeaningfulCommentText);
    if (!meaningful.length) continue;

    const framed =
      group.length >= 3 &&
      group[0].trim() === '' &&
      group[group.length - 1].trim() === '';
    if (framed) signals.commentFramedBlocks += 1;
    else signals.commentPlainBlocks += 1;
  }

  updateTrailingInlineCommentAlignment(lines, comments, signals);

  for (const comment of comments ?? []) {
    if (comment.type !== 'CommentLine') continue;
    if (ignoreLineCommentForSpacing(comment.value)) continue;

    if (/^\s/.test(comment.value)) signals.lineCommentSpace += 1;
    else signals.lineCommentTight += 1;
  }
}
