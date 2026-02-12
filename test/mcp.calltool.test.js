// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, access, writeFile } from 'node:fs/promises';
import { callCdoTool } from '../src/mcp/server.js';
import { createRepo } from './support/helpers.js';

test('callCdoTool executes all MCP tool paths', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      {
        path: 'index.js',
        content: `/** test */\nfunction noop() {\n  //comment\n  return 'x';\n}\n`
      }
    ]
  });

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'cdo-mcp-'));
  const profilePath = path.join(tmp, 'profile.json');
  const guidePath = path.join(tmp, 'STYLEGUIDE.cdo.md');
  const outDir = path.join(tmp, '.cdo');
  const applyReportPath = path.join(tmp, 'apply-report.json');
  const applyToolReportPath = path.join(tmp, 'apply-tool-report.json');
  const iterationOut = path.join(tmp, 'iteration.json');

  const learned = await callCdoTool('cdo.learn_style', {
    repoPaths: [repo],
    authorEmails: ['author@example.com']
  });
  const profile = JSON.parse(learned.content[0].text);
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');

  const guide = await callCdoTool('cdo.generate_style_guide', {
    profilePath,
    outFile: guidePath
  });
  assert.match(guide.content[0].text, /CDO Style Guide/);
  await access(guidePath);

  const configs = await callCdoTool('cdo.generate_agent_templates', {
    profilePath,
    outDir
  });
  const parsedConfigs = JSON.parse(configs.content[0].text);
  await access(parsedConfigs.biome.configPath);
  await access(parsedConfigs.agents.agentsPath);

  const applied = await callCdoTool('cdo.apply_style', {
    profilePath,
    repoPaths: [repo],
    engine: 'biome',
    write: false,
    safeOnly: true,
    reportPath: applyToolReportPath
  });
  const applyReport = JSON.parse(applied.content[0].text);
  await writeFile(applyReportPath, `${JSON.stringify(applyReport, null, 2)}\n`, 'utf8');
  await access(applyToolReportPath);

  const iteration = await callCdoTool('cdo.generate_iteration_report', {
    profilePath,
    applyReportPath,
    outFile: iterationOut
  });
  const parsedIteration = JSON.parse(iteration.content[0].text);
  assert.equal(parsedIteration.profileId, profile.profileId);
  await access(iterationOut);
});

test('callCdoTool rejects unknown tool', async () => {
  await assert.rejects(
    async () => callCdoTool('cdo.unknown', {}),
    /Unknown tool/
  );
});

test('callCdoTool validates profile shape for guide/config tools', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'cdo-mcp-invalid-'));
  const invalidProfilePath = path.join(tmp, 'invalid-profile.json');
  await writeFile(invalidProfilePath, '{"schemaVersion":"broken"}\n', 'utf8');

  await assert.rejects(
    async () => callCdoTool('cdo.generate_style_guide', { profilePath: invalidProfilePath }),
    /Profile schema validation failed/
  );

  await assert.rejects(
    async () => callCdoTool('cdo.generate_agent_templates', { profilePath: invalidProfilePath }),
    /Profile schema validation failed/
  );
});

test('callCdoTool learn_style supports sampleSize alias for sampling', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      { path: 'a.js', content: 'export const a = 1;\n' },
      { path: 'b.js', content: 'export const b = 2;\n' },
      { path: 'c.js', content: 'export const c = 3;\n' }
    ]
  });

  const learned = await callCdoTool('cdo.learn_style', {
    repoPaths: [repo],
    authorEmails: ['author@example.com'],
    sampleSize: 1
  });

  const profile = JSON.parse(learned.content[0].text);
  assert.equal(profile.sampleWindow.maxFilesPerRepo, 1);
  assert.equal(profile.sampleWindow.perRepo[0].fileCount, 1);
});

test('callCdoTool learn_style supports llmAugmenterCommand in llm-mcp mode', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [{ path: 'index.js', content: 'function run(value) { if (value) return 1; return 0; }\n' }]
  });

  const command = `${process.execPath} -e "process.stdout.write(JSON.stringify({rules:{'syntax.yodaConditions':{value:'always',confidence:0.95,evidenceCount:3}}}))"`;

  const learned = await callCdoTool('cdo.learn_style', {
    repoPaths: [repo],
    authorEmails: ['author@example.com'],
    inferenceMode: 'llm-mcp',
    minEvidence: 1,
    llmAugmenterCommand: command
  });

  const profile = JSON.parse(learned.content[0].text);
  assert.equal(profile.rules.syntax.yodaConditions.value, 'always');
  assert.equal(profile.rules.syntax.yodaConditions.provenance, 'llm_augmented');
});

test('callCdoTool learn_style supports llmSamplingMode/sampleContent for LLM payload size', async () => {
  const repo = await createRepo({
    email: 'author@example.com',
    files: [
      { path: 'a-long.js', content: `const value = '${'x'.repeat(5200)}';\n` },
      { path: 'b0.js', content: 'export const b0 = 0;\n' },
      { path: 'b1.js', content: 'export const b1 = 1;\n' },
      { path: 'b2.js', content: 'export const b2 = 2;\n' },
      { path: 'b3.js', content: 'export const b3 = 3;\n' },
      { path: 'b4.js', content: 'export const b4 = 4;\n' },
      { path: 'b5.js', content: 'export const b5 = 5;\n' },
      { path: 'b6.js', content: 'export const b6 = 6;\n' },
      { path: 'b7.js', content: 'export const b7 = 7;\n' },
      { path: 'b8.js', content: 'export const b8 = 8;\n' },
      { path: 'b9.js', content: 'export const b9 = 9;\n' },
      { path: 'c0.js', content: 'export const c0 = 10;\n' },
      { path: 'd0.js', content: 'export const d0 = 11;\n' }
    ]
  });

  const command = `${process.execPath} -e "const fs=require('node:fs');const payload=JSON.parse(fs.readFileSync(0,'utf8'));const value=payload.sampledFiles.length>12?'always':'never';process.stdout.write(JSON.stringify({rules:{'syntax.yodaConditions':{value,confidence:0.95,evidenceCount:20}}}));"`;

  const fullMode = await callCdoTool('cdo.learn_style', {
    repoPaths: [repo],
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 30,
    inferenceMode: 'llm-mcp',
    minEvidence: 1,
    llmSamplingMode: 'full',
    llmAugmenterCommand: command
  });
  const fullProfile = JSON.parse(fullMode.content[0].text);
  assert.equal(fullProfile.rules.syntax.yodaConditions.value, 'always');

  const compactAlias = await callCdoTool('cdo.learn_style', {
    repoPaths: [repo],
    authorEmails: ['author@example.com'],
    maxFilesPerRepo: 30,
    inferenceMode: 'llm-mcp',
    minEvidence: 1,
    sampleContent: 'compact',
    llmAugmenterCommand: command
  });
  const compactProfile = JSON.parse(compactAlias.content[0].text);
  assert.equal(compactProfile.rules.syntax.yodaConditions.value, 'never');
});
