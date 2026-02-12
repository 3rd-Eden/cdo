// @ts-check

/**
 * @typedef {'aligned' | 'single-space'} InlineCommentStyle
 */

/**
 * @param {string} prefix
 */
function isLikelyAlignmentTarget(prefix) {
  const trimmed = prefix.trim();
  if (!trimmed) return false;
  if (/^(?:if|for|while|switch|catch)\s*\(/.test(trimmed)) return false;
  if (/^(?:return|throw)\b/.test(trimmed)) return false;
  if (/^(?:case|default)\b/.test(trimmed)) return false;
  if (/^\[/.test(trimmed)) return true;
  if (/,\s*$/.test(trimmed)) return true;
  if (/\{\s*$/.test(trimmed)) return true;
  if (/(?:^|[^=!<>])(?:[+\-*/%&|^]?=)(?!=)/.test(trimmed)) return true;
  if (/^(?:['"][^'"]+['"]|[A-Za-z_$][\w$]*)\s*:/.test(trimmed)) return true;
  return false;
}

/**
 * @param {string} value
 */
function normalizeLeftForMatch(value) {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * @param {string} referenceSource
 */
function referenceInlineCommentLookup(referenceSource) {
  /** @type {Map<string, Set<string>>} */
  const lookup = new Map();

  for (const line of referenceSource.split('\n')) {
    const match = line.match(/^(\s*)(.+?)(\s+)\/\/(.*)$/);
    if (!match) continue;

    const left = `${match[1]}${match[2]}`.replace(/\s+$/, '');
    if (!isLikelyAlignmentTarget(left)) continue;

    const key = normalizeLeftForMatch(left);
    const commentText = match[4].trim();
    const values = lookup.get(key) ?? new Set();
    values.add(commentText);
    lookup.set(key, values);
  }

  return lookup;
}

/**
 * @param {string[]} lines
 * @param {string} referenceSource
 */
function restoreDetachedInlineComments(lines, referenceSource) {
  const lookup = referenceInlineCommentLookup(referenceSource);
  if (!lookup.size) return;

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index];
    if (line.includes('//')) continue;

    const next = lines[index + 1];
    const detached = next.match(/^\s*\/\/(.*)$/);
    if (!detached) continue;

    const left = line.replace(/\s+$/, '');
    if (!isLikelyAlignmentTarget(left)) continue;

    const key = normalizeLeftForMatch(left);
    const allowedComments = lookup.get(key);
    if (!allowedComments) continue;

    const commentText = detached[1].trim();
    if (!allowedComments.has(commentText)) continue;

    lines[index] = `${left} // ${commentText}`;
    lines.splice(index + 1, 1);
  }
}

/**
 * @param {string} line
 * @param {number} lineNumber
 */
function parseCandidate(line, lineNumber) {
  const match = line.match(/^(\s*)(.+?)(\s+)\/\/(.*)$/);
  if (!match) return null;

  const left = `${match[1]}${match[2]}`;
  const trimmedLeft = left.replace(/\s+$/, '');
  if (!isLikelyAlignmentTarget(trimmedLeft)) return null;

  return {
    lineNumber,
    line,
    left: trimmedLeft,
    indent: match[1].length,
    comment: match[4]
  };
}

/**
 * @param {Array<{ lineNumber: number, line: string, left: string, indent: number, comment: string }>} group
 * @param {InlineCommentStyle} style
 * @param {string[]} out
 */
function rewriteGroup(group, style, out) {
  if (!group.length) return;

  if (style === 'single-space') {
    for (const entry of group) {
      out[entry.lineNumber] = `${entry.left} //${entry.comment}`;
    }
    return;
  }

  if (group.length < 2) return;
  const width = group.reduce((max, entry) => Math.max(max, entry.left.length), 0);
  for (const entry of group) {
    const pad = Math.max(2, width - entry.left.length + 2);
    out[entry.lineNumber] = `${entry.left}${' '.repeat(pad)}//${entry.comment}`;
  }
}

/**
 * @param {Array<{ lineNumber: number, line: string, left: string, indent: number, comment: string }>} candidates
 * @param {string[]} lines
 */
function splitGroups(candidates, lines) {
  /** @type {Array<Array<{ lineNumber: number, line: string, left: string, indent: number, comment: string }>>} */
  const groups = [];
  if (!candidates.length) return groups;

  let group = [candidates[0]];
  for (let index = 1; index < candidates.length; index += 1) {
    const previous = candidates[index - 1];
    const current = candidates[index];
    const baseIndent = group[0]?.indent ?? current.indent;
    const gap = current.lineNumber - previous.lineNumber - 1;
    const between = gap > 0
      ? lines.slice(previous.lineNumber + 1, current.lineNumber)
      : [];
    const hasBlankBetween = between.some((line) => /^\s*$/.test(line));

    const split =
      current.indent !== baseIndent ||
      gap > 3 ||
      hasBlankBetween;

    if (split) {
      groups.push(group);
      group = [current];
      continue;
    }

    group.push(current);
  }

  groups.push(group);
  return groups;
}

/**
 * @param {string} source
 * @param {InlineCommentStyle | null} style
 * @param {string | null} referenceSource
 */
export function applyInlineCommentStyle(source, style, referenceSource = null) {
  if (!style) return source;

  const out = source.split('\n');
  if (style === 'aligned' && typeof referenceSource === 'string' && referenceSource.length > 0) {
    restoreDetachedInlineComments(out, referenceSource);
  }

  /** @type {Array<{ lineNumber: number, line: string, left: string, indent: number, comment: string }>} */
  const candidates = [];
  for (let index = 0; index < out.length; index += 1) {
    const candidate = parseCandidate(out[index], index);
    if (candidate) candidates.push(candidate);
  }

  const groups = splitGroups(candidates, out);
  for (const group of groups) {
    rewriteGroup(group, style, out);
  }

  return out.join('\n');
}
