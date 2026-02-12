// @ts-check
import path from 'node:path';
import { writeText } from '../util/fs.js';

/**
 * @param {import('../types.js').CdoProfileV1} profile
 * @param {string} outDir
 */
export async function writeOxcConfig(profile, outDir) {
  const config = {
    quotes: profile.rules.syntax.quotes.status === 'enforced' ? profile.rules.syntax.quotes.value : undefined,
    semicolons: profile.rules.syntax.semicolons.status === 'enforced' ? profile.rules.syntax.semicolons.value : undefined,
    trailingCommas:
      profile.rules.syntax.trailingCommas.status === 'enforced'
        ? profile.rules.syntax.trailingCommas.value === 'always-multiline'
          ? 'all'
          : 'none'
        : undefined
  };

  const normalized = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined));
  const target = path.resolve(outDir, 'oxfmt.json');
  await writeText(target, `${JSON.stringify(normalized, null, 2)}\n`);
  return { configPath: target };
}
