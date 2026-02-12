// @ts-check

/**
 * @param {string[]} lines
 * @param {import('./signals.js').FileSignals} signals
 */
export function collectLineLayoutSignals(lines, signals) {
  for (const line of lines) {
    if (/^\s*$/.test(line)) {
      signals.blankLines += 1;
      continue;
    }

    signals.lineLengthMax = Math.max(signals.lineLengthMax, line.length);

    const indent = line.match(/^(\s+)/);
    if (!indent) continue;

    if (indent[1].includes('\t')) {
      signals.indentTabLines += 1;
      continue;
    }

    const size = indent[1].length;
    if (size <= 0) continue;

    signals.indentSpaceLines += 1;
    const key = String(size);
    signals.indentSpaceSizes[key] = (signals.indentSpaceSizes[key] ?? 0) + 1;
  }
}
