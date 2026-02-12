#!/usr/bin/env node
// @ts-check
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['--test', 'test/snapshot.fixtures.test.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    UPDATE_SNAPSHOTS: '1'
  }
});

process.exitCode = result.status ?? 1;
