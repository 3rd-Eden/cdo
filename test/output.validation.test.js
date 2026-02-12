// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { generateGuide } from '../src/output/markdown.js';
import { generateConfigs } from '../src/output/config.js';
import { generateIterationReport } from '../src/output/iteration-report.js';
import { createProfileFixture } from './support/profile-fixture.js';

/**
 * @returns {import('../src/types.js').ApplyReport}
 */
function applyReportFixture() {
  return {
    engine: 'biome',
    write: false,
    filesScanned: 1,
    filesChanged: 0,
    diffs: [],
    files: [
      {
        file: '/tmp/repo/index.js',
        changed: false,
        additions: 0,
        deletions: 0
      }
    ]
  };
}

test('generateGuide validates profile schema for API callers', () => {
  const invalid = /** @type {any} */ ({ schemaVersion: 'broken' });
  assert.throws(
    () => generateGuide(invalid),
    /Profile schema validation failed/
  );
});

test('generateConfigs validates profile schema for API callers', async () => {
  const invalid = /** @type {any} */ ({ schemaVersion: 'broken' });
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'cdo-config-invalid-'));
  await assert.rejects(
    async () => generateConfigs(invalid, { outDir }),
    /Profile schema validation failed/
  );
});

test('generateIterationReport validates current and previous profiles', () => {
  const profile = createProfileFixture();
  const applyReport = applyReportFixture();

  const invalidCurrent = /** @type {any} */ ({ schemaVersion: 'broken' });
  assert.throws(
    () => generateIterationReport(invalidCurrent, applyReport, null),
    /Profile schema validation failed/
  );

  const invalidPrevious = /** @type {any} */ ({ schemaVersion: 'broken' });
  assert.throws(
    () => generateIterationReport(profile, applyReport, invalidPrevious),
    /Profile schema validation failed/
  );
});
