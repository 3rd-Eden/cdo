// @ts-check
import path from 'node:path';
import { writeBiomeConfig } from './config-biome.js';
import { writeGritPack } from './config-grit.js';
import { writeOxcConfig } from './config-oxc.js';
import { writeAgentTemplates } from './agent-templates.js';
import { validateProfile } from './profile.js';

/**
 * @param {import('../types.js').CdoProfileV1} profile
 * @param {{ outDir?: string, includeOxc?: boolean }} [options]
 */
export async function generateConfigs(profile, options = {}) {
  validateProfile(profile);
  const outDir = path.resolve(options.outDir ?? '.cdo');
  const biome = await writeBiomeConfig(profile, outDir);
  const grit = await writeGritPack(profile, outDir);
  const agents = await writeAgentTemplates(profile, outDir);
  const oxc = options.includeOxc === false ? null : await writeOxcConfig(profile, outDir);

  return {
    outDir,
    biome,
    grit,
    oxc,
    agents
  };
}
