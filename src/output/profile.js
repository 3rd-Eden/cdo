// @ts-check
import path from 'node:path';
import Ajv2020Module from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import schema from '../../schema/cdo-profile.v1.schema.json' with { type: 'json' };
import { writeJson } from '../util/fs.js';

const Ajv2020 = /** @type {any} */ (Ajv2020Module);
const addFormats = /** @type {any} */ (addFormatsModule);
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

/**
 * @param {import('../types.js').CdoProfileV1} profile
 */
export function validateProfile(profile) {
  const valid = validate(profile);
  if (valid) return;

  const errors = (validate.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message ?? 'invalid'}`)
    .join('; ');

  throw new Error(`Profile schema validation failed: ${errors}`);
}

/**
 * @param {import('../types.js').CdoProfileV1} profile
 * @param {string} outFile
 */
export async function writeProfile(profile, outFile) {
  validateProfile(profile);
  const output = path.resolve(outFile);
  await writeJson(output, profile);
  return output;
}
