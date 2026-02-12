// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runNode } from './support/helpers.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('mcp self-test exposes required tools', async () => {
  const { stdout } = await runNode(['./src/cli.js', 'mcp', '--self-test'], ROOT);
  const tools = JSON.parse(stdout);
  const names = tools.map((tool) => tool.name);

  assert.deepEqual(names, [
    'cdo.learn_style',
    'cdo.generate_style_guide',
    'cdo.generate_agent_templates',
    'cdo.generate_iteration_report',
    'cdo.apply_style'
  ]);
});
