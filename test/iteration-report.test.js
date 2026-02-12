// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateIterationReport, validateApplyReport } from '../src/output/iteration-report.js';
import { createProfileFixture } from './support/profile-fixture.js';

test('iteration report computes deltas, repo changes, and categories', () => {
  const previous = createProfileFixture();
  previous.confidenceSummary.overall = 0.8;
  previous.confidenceSummary.byRule['syntax.semicolons'] = 0.7;

  const profile = createProfileFixture();
  profile.profileId = 'current';
  profile.sources.roots = ['/repo'];
  profile.confidenceSummary.overall = 0.95;
  profile.confidenceSummary.byRule['syntax.semicolons'] = 0.9;

  /** @type {import('../src/types.js').ApplyReport} */
  const applyReport = {
    engine: 'biome',
    write: false,
    filesScanned: 3,
    filesChanged: 2,
    diffs: [
      `Index: /repo/a.js\n@@\n-//old\n+// new\n-foo\n+foo \n-\n+\n-  x\n+  x\n`
    ],
    files: [
      { file: '/repo/a.js', changed: true, additions: 4, deletions: 4 },
      { file: '/outside/z.js', changed: true, additions: 1, deletions: 1 },
      { file: '/repo/b.js', changed: false, additions: 0, deletions: 0 }
    ]
  };

  const report = generateIterationReport(profile, applyReport, previous);

  assert.equal(report.profileId, 'current');
  assert.ok(Math.abs((report.confidence.deltaOverall ?? 0) - 0.15) < 1e-9);
  assert.ok(Math.abs(report.confidence.deltaByRule['syntax.semicolons'] - 0.2) < 1e-9);
  assert.equal(report.diff.changedByRepo['/repo'], 1);
  assert.equal(report.diff.changedByRepo.unknown, 1);
  assert.ok(report.diff.topChangedCategories.length >= 1);
  assert.equal(report.diff.filesChanged, 2);
  assert.ok(report.diff.additions > 0);
  assert.ok(report.diff.deletions > 0);
});

test('iteration report handles no previous profile', () => {
  const profile = createProfileFixture();
  /** @type {import('../src/types.js').ApplyReport} */
  const applyReport = {
    engine: 'biome',
    write: false,
    filesScanned: 1,
    filesChanged: 0,
    diffs: [],
    files: [{ file: '/tmp/repo/index.js', changed: false, additions: 0, deletions: 0 }]
  };

  const report = generateIterationReport(profile, applyReport, null);
  assert.equal(report.confidence.deltaOverall, null);
  assert.deepEqual(report.diff.topChangedCategories, []);
});

test('iteration report validation rejects malformed apply report', () => {
  assert.throws(
    () => validateApplyReport(/** @type {any} */ ({ engine: 'biome' })),
    /Invalid apply report/
  );

  assert.throws(
    () =>
      validateApplyReport(
        /** @type {any} */ ({
          engine: 'biome',
          write: false,
          filesScanned: 2,
          filesChanged: 2,
          diffs: [],
          files: [{ file: '/repo/a.js', changed: true, additions: 1, deletions: 1 }]
        })
      ),
    /filesScanned must match files.length/
  );

  assert.throws(
    () =>
      validateApplyReport(
        /** @type {any} */ ({
          engine: 'biome',
          write: false,
          filesScanned: 1,
          filesChanged: 0,
          diffs: [],
          files: [{ file: '/repo/a.js', changed: true, additions: 1, deletions: 1 }]
        })
      ),
    /filesChanged must match changed file entries/
  );
});
