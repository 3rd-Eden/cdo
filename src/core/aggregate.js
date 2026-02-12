// @ts-check
import { addSignalCounts, createSignals } from './extractors/signals.js';

/**
 * @typedef {import('./extractors/signals.js').FileSignals} FileSignals
 */

/**
 * @param {FileSignals[]} files
 */
export function aggregateSignals(files) {
  const out = createSignals();

  for (const file of files) {
    addSignalCounts(out, file);
  }

  return out;
}
